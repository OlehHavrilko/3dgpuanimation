/**
 * Procedural ambience — no audio files, everything synthesised.
 *
 * There is a low machine hum, a filtered noise "air" bed, a swoosh on every scale
 * transition and a small blip when a part is selected. Volume and brightness follow the
 * level: the card is a quiet room, the metal stack is a thin oscilloscope whine.
 *
 * Browsers require a user gesture before audio may start, so this is off by default and
 * only builds its graph the first time it is switched on.
 */
export class Ambience {
  enabled = false;
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private airGain: GainNode | null = null;
  private humFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private oscillators: OscillatorNode[] = [];

  /** Target level (0..1) of the air bed, ramped on each scene change. */
  private airTarget = 0.4;

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.start();
    else this.suspend();
    return this.enabled;
  }

  private ensure() {
    if (this.ac) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctor();
    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);

    const humGain = ac.createGain();
    humGain.gain.value = 0.05;
    const humFilter = ac.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 320;
    humFilter.Q.value = 0.7;
    humGain.connect(humFilter).connect(master);

    // Two detuned sines + a triangle give a cheap "machine room" drone.
    for (const [freq, type] of [
      [54, 'sine'],
      [81, 'sine'],
      [108, 'triangle'],
    ] as [number, OscillatorType][]) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ac.createGain();
      g.gain.value = type === 'triangle' ? 0.12 : 0.35;
      osc.connect(g).connect(humGain);
      osc.start();
      this.oscillators.push(osc);
    }

    // White-noise "air" through a band pass.
    const length = ac.sampleRate * 2;
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    const air = ac.createBufferSource();
    air.buffer = buffer;
    air.loop = true;
    const airFilter = ac.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 900;
    airFilter.Q.value = 0.6;
    const airGain = ac.createGain();
    airGain.gain.value = 0.02;
    air.connect(airFilter).connect(airGain).connect(master);
    air.start();

    this.ac = ac;
    this.master = master;
    this.humFilter = humFilter;
    this.airGain = airGain;
  }

  private start() {
    this.ensure();
    if (!this.ac || !this.master) return;
    void this.ac.resume();
    this.master.gain.cancelScheduledValues(this.ac.currentTime);
    this.master.gain.linearRampToValueAtTime(0.5, this.ac.currentTime + 1.2);
  }

  private suspend() {
    if (!this.ac || !this.master) return;
    const t = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.4);
    window.setTimeout(() => void this.ac?.suspend(), 500);
  }

  /** Follow the level: deeper scales get a higher, thinner drone and more air. */
  setScene(index: number) {
    if (!this.ac || !this.humFilter || !this.airGain) return;
    const t = this.ac.currentTime;
    const k = index / 7;
    this.humFilter.frequency.linearRampToValueAtTime(220 + k * 1400, t + 1.5);
    this.oscillators[0]?.frequency.linearRampToValueAtTime(54 - k * 18, t + 1.5);
    this.airTarget = 0.25 + k * 0.5;
    this.airGain.gain.linearRampToValueAtTime(0.012 + this.airTarget * 0.02, t + 1.5);
  }

  /** A filtered noise swoosh for a scale transition. */
  whoosh() {
    if (!this.enabled || !this.ac || !this.noiseBuffer || !this.master) return;
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    const g = ac.createGain();
    const t = ac.currentTime;
    filter.frequency.setValueAtTime(240, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.7);
  }

  /** Short confirmation tone when a part is selected. */
  blip(up = true) {
    if (!this.enabled || !this.ac || !this.master) return;
    const ac = this.ac;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    const g = ac.createGain();
    const t = ac.currentTime;
    osc.frequency.setValueAtTime(up ? 520 : 400, t);
    osc.frequency.exponentialRampToValueAtTime(up ? 880 : 260, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  dispose() {
    this.oscillators.forEach((o) => o.stop());
    this.oscillators = [];
    void this.ac?.close();
    this.ac = null;
  }
}
