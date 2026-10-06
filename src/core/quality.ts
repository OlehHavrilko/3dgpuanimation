/**
 * Device-tiered quality. The viewer has to hold 60 fps from a phone to a workstation,
 * so instead of one hard-coded setting we probe the device once and derive a coherent
 * preset: how much resolution, how much AA, which post effects, and how aggressively
 * we pre-build and cache the next scale.
 *
 * `?quality=low|high` still forces a tier (handy for screenshots and CI).
 */
export type QualityTier = 'high' | 'medium' | 'low';

export interface Quality {
  tier: QualityTier;
  /** Hard cap on device pixel ratio. */
  maxPixelRatio: number;
  /** Render at least this many pixels per CSS pixel on 1x screens (supersampling kills shimmer). */
  supersample: number;
  /** Adaptive resolution may step below the cap when the frame rate drops. */
  adaptive: boolean;
  /** Lowest pixel ratio adaptive resolution may fall to. */
  minPixelRatio: number;
  /** Phone-sized touch screen: gets its own post chain (see `phoneOverrides`). */
  phone: boolean;
  /** MSAA samples on the composer's render target (0 disables). */
  msaaSamples: number;
  /** Post-process FXAA — the fallback when MSAA is too expensive. */
  fxaa: boolean;
  dof: boolean;
  bloom: boolean;
  /** Film grain opacity (0 disables). */
  grain: number;
  /** Chromatic aberration strength multiplier (0 disables). */
  chromatic: number;
  vignette: number;
  /**
   * Levels kept built and warmed up on each side of the current one (1 = previous + next;
   * 0 = only the current level, built on arrival). `?cache=0` forces 0.
   */
  levelCache: number;
  /** Scales per-point sprite size caps in the heaviest levels. */
  pointBudget: number;
  /** Respect the OS "reduce motion" setting: no parallax, no autoplay. */
  reducedMotion: boolean;
}

const params = new URLSearchParams(location.search);
const forced = params.get('quality');

/** Touch screen with a short side of a phone (portrait or landscape). `?phone=0|1` forces it. */
function probePhone() {
  const p = params.get('phone');
  if (p === '0' || p === '1') return p === '1';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(window.innerWidth, window.innerHeight) <= 520;
}

function probeTier(phone: boolean): QualityTier {
  if (forced === 'low' || forced === 'medium' || forced === 'high') return forced;
  const cores = navigator.hardwareConcurrency || 4;
  // Safari (every iPhone) does not expose deviceMemory: unknown is not "4 GB", so it must not
  // push a current phone down to the 1x tier on its own.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (phone) return cores >= 6 || (memory ?? 0) >= 6 ? 'medium' : 'low';
  if (cores >= 8 && (memory ?? 8) >= 8) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

const PRESETS: Record<QualityTier, Omit<Quality, 'tier' | 'reducedMotion' | 'phone'>> = {
  high: {
    maxPixelRatio: 1.75,
    supersample: 1.5,
    adaptive: true,
    minPixelRatio: 0.85,
    msaaSamples: 4,
    fxaa: false,
    dof: true,
    bloom: true,
    grain: 0.1,
    chromatic: 1,
    vignette: 1,
    levelCache: 1,
    pointBudget: 1,
  },
  medium: {
    maxPixelRatio: 1.5,
    supersample: 1.25,
    adaptive: true,
    minPixelRatio: 0.85,
    msaaSamples: 2,
    fxaa: false,
    dof: true,
    bloom: true,
    grain: 0.08,
    chromatic: 0.7,
    vignette: 1,
    levelCache: 1,
    pointBudget: 0.8,
  },
  low: {
    maxPixelRatio: 1,
    supersample: 1,
    adaptive: true,
    minPixelRatio: 0.85,
    msaaSamples: 0,
    fxaa: true,
    dof: false,
    bloom: true,
    grain: 0.05,
    chromatic: 0.35,
    vignette: 0.9,
    levelCache: 0,
    pointBudget: 0.55,
  },
};

/**
 * Phones get a different trade than "the desktop preset, smaller". Their screens are 2.5–3x,
 * so rendering at 1–1.5x upscales every edge into mush, and the effects that look filmic on a
 * monitor (half-res depth of field, grain, chromatic fringing) turn into noise and smear once
 * that blurry frame is stretched. So: spend the budget on pixels (up to 2x, never below 1.25x
 * on medium), and drop the effects that cost fill rate but read as low quality on a phone.
 */
const PHONE: Record<QualityTier, Partial<Quality>> = {
  high: { maxPixelRatio: 2, supersample: 1, minPixelRatio: 1.25, msaaSamples: 2, fxaa: false },
  medium: { maxPixelRatio: 2, supersample: 1, minPixelRatio: 1.25, msaaSamples: 2, fxaa: false },
  low: { maxPixelRatio: 1.5, supersample: 1, minPixelRatio: 1, msaaSamples: 0, fxaa: true, pointBudget: 0.7 },
};
const PHONE_FX: Partial<Quality> = { dof: false, chromatic: 0, grain: 0.025, vignette: 0.85 };

export const QUALITY: Quality = (() => {
  const phone = probePhone();
  const tier = probeTier(phone);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q: Quality = { ...PRESETS[tier], tier, reducedMotion, phone };
  if (phone) Object.assign(q, PHONE[tier], PHONE_FX);
  // Forced high is for screenshots: full resolution, no adaptation. Auto-high stays adaptive.
  if (params.get('cache') === '0') q.levelCache = 0;
  if (forced === 'high') {
    q.maxPixelRatio = 2;
    q.adaptive = false;
  }
  return q;
})();

/** A short human label for the debug HUD, e.g. "high · 4× MSAA · cache 2". */
export function qualityLabel(q: Quality = QUALITY) {
  const aa = q.msaaSamples ? `${q.msaaSamples}× MSAA` : q.fxaa ? 'FXAA' : 'no AA';
  return `${q.tier}${q.phone ? ' phone' : ''} · ${aa} · cache ±${q.levelCache}`;
}
