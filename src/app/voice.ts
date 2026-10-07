import { content, lang } from '../content';

const STORAGE_KEY = 'gpu-atom:voice';
/** Captions flip quickly while scrolling; only the one that stays this long is read aloud. */
const CAPTION_SETTLE_MS = 700;
const VOICE_DIR = `${import.meta.env.BASE_URL}voice/`;

/** FNV-1a of the exact spoken text: the clip's file name (see scripts/voice-build, the same hash). */
export function clipName(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Spoken narration. It reads the story: act cards and anchor numbers first, then the
 * contextual caption of each scale once it has settled. Recorded clips (public/voice, loaded
 * on demand once the voice is on) are used where one exists for the exact text; anything else
 * is read by the browser's own speech synthesis. Off by default; the choice is remembered.
 */
export class Voice {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private on = false;
  private settle = 0;
  private lastCaption = '';
  /** Act cards and anchor numbers are read in full; a caption never cuts them off. */
  private busyUntil = 0;
  /** Names of the pre-rendered clips for this language; null until the manifest arrives. */
  private clips: Set<string> | null = null;
  private audio: HTMLAudioElement | null = null;

  constructor() {
    if (!this.supported) return;
    try {
      this.on = localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      /* storage disabled: stay off */
    }
    // Voices load asynchronously in Chromium; touching the list early warms it up.
    speechSynthesis.getVoices();
    if (this.on) this.loadClips();
  }

  get enabled() {
    return this.supported && this.on;
  }

  toggle(): boolean {
    if (!this.supported) return false;
    this.on = !this.on;
    try {
      localStorage.setItem(STORAGE_KEY, this.on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (this.on) {
      this.loadClips();
      this.speak(content.ui.voice.hello, true);
    } else this.silence();
    return this.on;
  }

  /** The caption under the scale name changed. Read it once it has stayed on screen a moment. */
  caption(text: string) {
    if (!this.enabled || !text || text === this.lastCaption) return;
    this.lastCaption = text;
    window.clearTimeout(this.settle);
    this.settle = window.setTimeout(() => {
      if (performance.now() < this.busyUntil) return;
      this.speak(text, true);
    }, CAPTION_SETTLE_MS);
  }

  /** Act cards and anchor numbers: spoken in full, replacing whatever was being said. */
  announce(text: string, holdMs: number) {
    if (!this.enabled || !text) return;
    window.clearTimeout(this.settle);
    this.busyUntil = performance.now() + holdMs;
    this.speak(text, true);
  }

  silence() {
    window.clearTimeout(this.settle);
    this.busyUntil = 0;
    this.audio?.pause();
    if (this.supported) speechSynthesis.cancel();
  }

  /** The recorded narration is optional: without the manifest everything is read by the browser. */
  private loadClips() {
    if (this.clips) return;
    fetch(`${VOICE_DIR}manifest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: Record<string, Record<string, string>>) => {
        this.clips = new Set(Object.keys(m[lang] ?? {}));
      })
      .catch(() => {
        this.clips = new Set();
      });
  }

  private speak(text: string, interrupt: boolean) {
    if (interrupt) {
      speechSynthesis.cancel();
      this.audio?.pause();
    }
    const name = clipName(text);
    if (this.clips?.has(name)) {
      const audio = this.audio ?? (this.audio = new Audio());
      audio.src = `${VOICE_DIR}${lang}/${name}.mp3`;
      // If the clip fails to load or autoplay is refused, fall back to the browser's voice.
      audio.play().catch(() => this.synth(text));
      return;
    }
    this.synth(text);
  }

  private synth(text: string) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
    const voice = this.pickVoice();
    if (voice) u.voice = voice;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  /** Best voice for the page language: a natural/online one if the browser has it, else any. */
  private pickVoice(): SpeechSynthesisVoice | null {
    const prefix = lang === 'ru' ? 'ru' : 'en';
    const matches = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(prefix));
    return matches.find((v) => /natural|neural|online|google/i.test(v.name)) ?? matches[0] ?? null;
  }
}
