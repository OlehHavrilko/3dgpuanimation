import { content, lang } from '../content';

const STORAGE_KEY = 'gpu-atom:voice';
/** Captions flip quickly while scrolling; only the one that stays this long is read aloud. */
const CAPTION_SETTLE_MS = 700;

/**
 * Spoken narration through the browser's own speech synthesis (no audio files, nothing to
 * download). It reads the story: act cards and anchor numbers first, then the contextual
 * caption of each scale once it has settled. Off by default; the choice is remembered.
 */
export class Voice {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private on = false;
  private settle = 0;
  private lastCaption = '';
  /** Act cards and anchor numbers are read in full; a caption never cuts them off. */
  private busyUntil = 0;

  constructor() {
    if (!this.supported) return;
    try {
      this.on = localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      /* storage disabled: stay off */
    }
    // Voices load asynchronously in Chromium; touching the list early warms it up.
    speechSynthesis.getVoices();
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
    if (this.on) this.speak(content.ui.voice.hello, true);
    else this.silence();
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
    if (this.supported) speechSynthesis.cancel();
  }

  private speak(text: string, interrupt: boolean) {
    if (interrupt) speechSynthesis.cancel();
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
