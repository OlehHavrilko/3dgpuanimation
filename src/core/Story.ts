import { formatMeters } from './math';
import type { FrameState } from './LevelManager';
import { content } from '../content';
import { GB202_ATOMS, scientific } from './facts';

/**
 * The narrative layer: three acts, three anchor numbers, one finale.
 *
 * The eight scales are a chronology; the story is what gives them shape. This module
 * groups them into acts, drops a title card at each act boundary, surfaces a single
 * memorable number at the moment it means something, breathes once with a chrome-free
 * "clean shot" before the last dive, and closes the journey with a proper ending
 * instead of simply stopping.
 */

export interface Act {
  id: number;
  roman: string;
  title: string;
  /** The scales in this act, for the card's route line. */
  route: string;
  /** One thesis sentence — the act's reason to exist. */
  blurb: string;
  levels: number[];
}

const ACT_SHAPE = [
  { roman: 'I', levels: [0, 1, 2] },
  { roman: 'II', levels: [3, 4, 5] },
  { roman: 'III', levels: [6, 7] },
];
export const ACTS: Act[] = ACT_SHAPE.map((a, id) => ({ id, ...a, ...content.story.acts[id] }));

export function actForLevel(index: number): Act {
  return ACTS.find((a) => a.levels.includes(index)) ?? ACTS[ACTS.length - 1];
}

export interface KeyNumber {
  /** Level index it belongs to. */
  level: number;
  /** Local segment progress at which it appears (content + dive). */
  at: number;
  value: string;
  unit: string;
  /** The line that makes the number land. */
  caption: string;
}

/**
 * Three facts, deliberately not more. Each is placed where the thing it counts is on
 * screen, so the number explains what the eye is already looking at.
 */
const KEY_NUMBER_PLACES = [
  { level: 3, at: 0.4 },
  { level: 4, at: 0.46 },
  { level: 7, at: 0.5 },
];
export const KEY_NUMBERS: KeyNumber[] = KEY_NUMBER_PLACES.map((k, i) => ({ ...k, ...content.story.keyNumbers[i] }));

/**
 * The one chrome-free moment of the descent: the last dive plus the opening of the atom.
 * The dive alone is under a second, so the breath is extended into the first beat of the
 * final scale and the HUD returns exactly as the wavefunction caption takes over.
 */
const CLEAN_SHOT = { diveLevel: 6, fromDive: 0.28, atomLevel: 7, untilLocal: 0.22 };
const CARD_SECONDS = 2.6;
const CARD_COOLDOWN = 2;
const KEY_SECONDS = 5.2;
const FINALE_AT = 0.9;

export interface StoryHooks {
  getLevelCount(): number;
  /** True while the landing card is still up (the narrative layer stays quiet). */
  introVisible(): boolean;
  levelName(index: number): string;
  levelScale(index: number): string;
  levelCaption(): string;
  /** Take the wheel back from the tour. */
  stopTour(): void;
  /** Restart the guided tour from the first scale. */
  replay(): void;
  /** Fly back up through every scale, then call `done`. */
  zoomOut(done: () => void): void;
  enterExplore(): void;
  /** The live WebGL canvas, for Share frame. */
  getCanvas(): HTMLCanvasElement;
}

const SOURCE_URL = 'https://github.com/OlehHavrilko/3dgpuanimation';

export class Story {
  /** 0..1 amount the camera eases back for the finale composition. */
  pullback = 0;

  private actIndex = -1;
  private levelIndex = -1;
  private cardTimer = 0;
  private cardCooldown = 0;
  private keyTimer = 0;
  private keyShown = new Set<number>();
  private finaleOn = false;
  private finaleDismissed = false;
  private captureRequested = false;

  // DOM
  private card = document.getElementById('act')!;
  private cardRoman = document.getElementById('act-roman')!;
  private cardTitle = document.getElementById('act-title')!;
  private cardRoute = document.getElementById('act-route')!;
  private cardBlurb = document.getElementById('act-blurb')!;
  private key = document.getElementById('keynum')!;
  private keyValue = document.getElementById('kn-number')!;
  private keyUnit = document.getElementById('kn-unit')!;
  private keyCaption = document.getElementById('kn-caption')!;
  private finale = document.getElementById('finale')!;

  constructor(private hook: StoryHooks) {
    const byId = (id: string) => document.getElementById(id) as HTMLButtonElement;
    byId('fin-replay').addEventListener('click', () => this.replay());
    byId('fin-zoomout').textContent = content.story.zoomOut;
    byId('fin-zoomout').addEventListener('click', () => this.zoomOut());
    this.initCoda();
    byId('fin-explore').addEventListener('click', () => this.explore());
    byId('fin-share').addEventListener('click', () => {
      this.captureRequested = true;
    });
    // Keep the source link honest if the page is served from a fork.
    const src = document.getElementById('fin-source') as HTMLAnchorElement | null;
    if (src) src.href = SOURCE_URL;
  }

  /** Called once per frame, after the level manager has ticked. */
  update(state: FrameState, dt: number) {
    // The landing has its own attract loop; the narrative starts when the door opens.
    if (this.hook.introVisible()) return;

    const index = state.index;
    if (index !== this.levelIndex) {
      this.levelIndex = index;
      this.keyShown.clear();
      this.hideKey();
      // Chrome returns between levels unless the finale owns the screen.
      if (!this.finaleOn) this.setCleanShot(false);
    }

    this.cardCooldown = Math.max(0, this.cardCooldown - dt);
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) this.card.classList.remove('on');
    }

    const act = actForLevel(index);
    if (act.id !== this.actIndex) {
      this.actIndex = act.id;
      // Only announce an act when we arrive at its first scale, not when dropping
      // into the middle of it from the palette or a deep link.
      if (index === act.levels[0] && this.cardCooldown <= 0 && !this.finaleOn) {
        this.showCard(act);
      }
    }

    for (const kn of KEY_NUMBERS) {
      if (
        kn.level === index &&
        !this.keyShown.has(kn.level) &&
        state.local >= kn.at &&
        state.dive < 0.15 &&
        !this.finaleOn
      ) {
        this.keyShown.add(kn.level);
        this.showKey(kn);
      }
    }
    if (this.keyTimer > 0) {
      this.keyTimer -= dt;
      if (this.keyTimer <= 0) this.hideKey();
    }

    const clean =
      !this.finaleOn &&
      ((index === CLEAN_SHOT.diveLevel && state.dive > CLEAN_SHOT.fromDive) ||
        (index === CLEAN_SHOT.atomLevel && state.local < CLEAN_SHOT.untilLocal));
    this.setCleanShot(clean);

    const last = this.hook.getLevelCount() - 1;
    if (!this.finaleOn && !this.finaleDismissed && index === last && state.local > FINALE_AT) {
      this.showFinale();
    }
    // Leaving the bottom on the scrollwheel steps out of the finale — and stepping back
    // in brings it home again, so it never feels like a modal trap.
    if (this.finaleOn && state.local < 0.6) this.hideFinale(false);
    this.pullback = Math.min(1, Math.max(0, this.pullback + (this.finaleOn ? dt / 1.8 : -dt / 1.2)));
  }

  get finaleVisible() {
    return this.finaleOn;
  }

  /** Called right after the composer has drawn, so the colour buffer is still readable. */
  captureFrame(state: FrameState) {
    if (!this.captureRequested) return;
    this.captureRequested = false;
    this.share(state);
  }

  private showCard(act: Act) {
    this.cardRoman.textContent = content.story.act(act.roman);
    this.cardTitle.textContent = act.title;
    this.cardRoute.textContent = act.route;
    this.cardBlurb.textContent = act.blurb;
    this.card.classList.remove('on');
    // Force a reflow so the entrance animation restarts even on a quick re-crossing.
    void this.card.offsetWidth;
    this.card.classList.add('on');
    this.cardTimer = CARD_SECONDS;
    this.cardCooldown = CARD_COOLDOWN + CARD_SECONDS;
  }

  private showKey(kn: KeyNumber) {
    this.keyValue.textContent = kn.value;
    this.keyUnit.textContent = kn.unit;
    this.keyCaption.textContent = kn.caption;
    this.key.classList.remove('on');
    void this.key.offsetWidth;
    this.key.classList.add('on');
    this.keyTimer = KEY_SECONDS;
    // The number takes the centre of the screen; the HUD steps back so the two never overlap.
    document.body.classList.add('keynum-on');
  }

  private hideKey() {
    this.key.classList.remove('on');
    this.keyTimer = 0;
    document.body.classList.remove('keynum-on');
  }

  private setCleanShot(on: boolean) {
    if (on === document.body.classList.contains('cleanshot')) return;
    document.body.classList.toggle('cleanshot', on);
  }

  private showFinale() {
    this.finaleOn = true;
    this.card.classList.remove('on');
    this.hideKey();
    this.setCleanShot(false);
    this.hook.stopTour();
    document.body.classList.add('finale-open');
    // It carries buttons and a link, so it must leave the accessibility tree when closed
    // and join it when open.
    this.finale.setAttribute('aria-hidden', 'false');
    this.finale.classList.add('on');
  }

  private hideFinale(dismissed: boolean) {
    this.finaleOn = false;
    this.finaleDismissed = dismissed;
    document.body.classList.remove('finale-open');
    this.finale.setAttribute('aria-hidden', 'true');
    this.finale.classList.remove('on');
  }

  /** Restart the whole descent from the first scale. Also bound to Space at the finale. */
  replay() {
    this.hideFinale(true);
    this.reset();
    this.hook.replay();
  }

  /** The reverse zoom: back up through every scale, ending on the closing line. */
  zoomOut() {
    this.hideFinale(true);
    this.hook.zoomOut(() => this.showCoda());
  }

  private initCoda() {
    const C = content.story.coda;
    const set = (id: string, text: string) => (document.getElementById(id)!.textContent = text);
    set('coda-title', C.title);
    set('coda-body', C.body(scientific(GB202_ATOMS)));
    set('coda-note', C.note);
    set('coda-again', C.again);
    set('coda-explore', C.explore);
    document.getElementById('coda-again')!.addEventListener('click', () => {
      this.hideCoda();
      this.hook.replay();
    });
    document.getElementById('coda-explore')!.addEventListener('click', () => {
      this.hideCoda();
      this.hook.enterExplore();
    });
  }

  private showCoda() {
    const el = document.getElementById('coda')!;
    el.setAttribute('aria-hidden', 'false');
    el.classList.add('on');
  }

  private hideCoda() {
    const el = document.getElementById('coda')!;
    el.setAttribute('aria-hidden', 'true');
    el.classList.remove('on');
  }

  private explore() {
    this.hideFinale(true);
    this.hook.enterExplore();
  }

  /** Forget the journey: used when replaying so the acts announce themselves again. */
  reset() {
    this.actIndex = -1;
    this.levelIndex = -1;
    this.keyShown.clear();
    this.pullback = 0;
    this.card.classList.remove('on');
    this.hideKey();
    this.setCleanShot(false);
    // `finaleDismissed` is intentionally NOT reset here — replay needs it cleared too.
    this.finaleDismissed = false;
  }

  /** Compose a 1200×630 share card: the live frame plus the context that gives it meaning. */
  private share(state: FrameState) {
    const gl = this.hook.getCanvas();
    const W = 1200;
    const H = 630;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) return;

    const s = Math.max(W / gl.width, H / gl.height);
    const dw = gl.width * s;
    const dh = gl.height * s;
    try {
      g.drawImage(gl, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch {
      g.fillStyle = '#04070a';
      g.fillRect(0, 0, W, H);
    }

    const grad = g.createLinearGradient(0, H * 0.3, 0, H);
    grad.addColorStop(0, 'rgba(2,5,4,0)');
    grad.addColorStop(1, 'rgba(2,5,4,0.94)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    const sans = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

    // Brand + accent
    g.fillStyle = '#76b900';
    g.fillRect(64, 58, 40, 3);
    g.font = `600 17px ${mono}`;
    g.fillStyle = '#f1f7ec';
    g.fillText('GPU  \u25B8  ATOM', 64, 46);

    // Scale + name
    g.font = `300 72px ${sans}`;
    g.fillStyle = '#f1f7ec';
    g.fillText(this.hook.levelScale(state.index), 60, H - 132);
    g.font = `600 20px ${sans}`;
    g.fillStyle = '#a6e05a';
    g.fillText(this.hook.levelName(state.index).toUpperCase(), 64, H - 100);

    // Caption
    g.font = `400 19px ${mono}`;
    g.fillStyle = 'rgba(225,240,215,0.72)';
    const caption = this.hook.levelCaption();
    if (caption) g.fillText(truncate(caption, 74), 64, H - 66);

    // A real scale bar, so the picture carries its own units.
    const { nice, px } = niceScaleBar(state.fovMeters, W);
    const barX = W - 64 - px;
    const barY = H - 78;
    g.strokeStyle = '#a6e05a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(barX, barY);
    g.lineTo(barX + px, barY);
    g.moveTo(barX, barY - 6);
    g.lineTo(barX, barY + 6);
    g.moveTo(barX + px, barY - 6);
    g.lineTo(barX + px, barY + 6);
    g.stroke();
    g.font = `400 16px ${mono}`;
    g.fillStyle = '#f1f7ec';
    g.textAlign = 'right';
    g.fillText(formatMeters(nice), W - 64, barY - 14);
    g.textAlign = 'left';

    const slug = this.hook
      .levelName(state.index)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gpu-to-atom-${String(state.index + 1).padStart(2, '0')}${slug ? `-${slug}` : ''}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  }
}

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}\u2026`;
}

/** 1-2-5 scale bar that lands near 120 px wide, matching the on-screen HUD bar. */
function niceScaleBar(meters: number, width: number) {
  const metersPerPixel = meters / width;
  const raw = metersPerPixel * 120;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-15))));
  const norm = raw / pow;
  const nice = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * pow;
  const px = Math.min(220, Math.max(40, nice / metersPerPixel));
  return { nice, px };
}
