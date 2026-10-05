import { mulberry32 } from '../../core/math';

/**
 * GB202 floorplan, as used by the die shader, picking and the signal trace. Pure geometry in
 * plane-local millimetres: x to the right, y "up" on the die (world -z). Schematic placement
 * following NVIDIA's published block diagram (12 GPCs x 16 SMs, central L2, 16 memory controllers).
 */
export const DIE_W = 29;
export const DIE_H = 26;
export const EDGE = 2.0; // memory-PHY ring width
export const L2_HALF = 2.0; // half-height of the central L2 band
export const GPC_COLS = 6;
export const SM_COLS = 2;
export const SM_ROWS = 8;
export const SMS = GPC_COLS * 2 * SM_COLS * SM_ROWS; // 192
export const SMS_ENABLED = 170; // RTX 5090
const FRONT_END = 0.35; // raster / ROP strip at the L2 side of each GPC
const HUB_HALF = 2.6;

/** [minX, minY, maxX, maxY] in plane-local mm. */
export type Rect = [number, number, number, number];

export type Block =
  | { kind: 'mc'; key: string; rect: Rect; index: number }
  | { kind: 'hub'; key: string; rect: Rect }
  | { kind: 'l2'; key: string; rect: Rect; east: boolean }
  | { kind: 'gpc'; key: string; rect: Rect; gpc: number; enabled: number }
  | { kind: 'sm'; key: string; rect: Rect; gpc: number; sm: number; off: boolean };

/** Which of the 192 SMs are fused off on an RTX 5090 (22 of them): a deterministic pick. */
export function fusedOffMask(seed = 5090): Uint8Array {
  const disabled = new Uint8Array(SMS);
  const rng = mulberry32(seed);
  let off = 0;
  while (off < SMS - SMS_ENABLED) {
    const i = Math.floor(rng() * SMS);
    if (!disabled[i]) {
      disabled[i] = 255;
      off++;
    }
  }
  return disabled;
}

export function smId(row: number, col: number, sc: number, sr: number) {
  return ((row * GPC_COLS + col) * SM_COLS + sc) * SM_ROWS + sr;
}

/** Centre of an SM (gpcCol 0..5, row 0 = top / 1 = bottom, smCol 0..1, smRow 0..7), plane-local. */
export function smCenterLocal(gpcCol: number, row: number, smCol: number, smRow: number): [number, number] {
  const innerW = DIE_W - 2 * EDGE;
  const gpcW = innerW / GPC_COLS;
  const gpcH = DIE_H / 2 - EDGE - L2_HALF;
  const x = -innerW / 2 + gpcW * (gpcCol + (smCol + 0.5) / SM_COLS);
  const y = L2_HALF + FRONT_END + (gpcH - FRONT_END) * ((smRow + 0.5) / SM_ROWS);
  return [x, row === 0 ? y : -y];
}

/**
 * Which block is at (x, y)? Mirrors the shader's layout. With smLevel false the whole GPC is
 * reported; with smLevel true the individual SM (front-end strip still reports the GPC).
 * Memory controllers are numbered 1..16 clockwise from the top-left, matching the chips on the PCB.
 */
export function classifyBlock(x: number, y: number, smLevel: boolean, disabled: Uint8Array): Block | null {
  const hx = DIE_W / 2;
  const hy = DIE_H / 2;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > hx || ay > hy) return null;

  if (ax > hx - EDGE || ay > hy - EDGE) {
    const vertical = ax > hx - EDGE && ax - (hx - EDGE) > ay - (hy - EDGE);
    const along = vertical ? y : x;
    const span = vertical ? DIE_H - 2 * EDGE : DIE_W - 2 * EDGE;
    const slot = Math.min(3, Math.max(0, Math.floor((along + span / 2) / (span / 4))));
    const lo = -span / 2 + (slot * span) / 4 + 0.25;
    const hi = lo + span / 4 - 0.5;
    const sx = Math.sign(x) || 1;
    const sy = Math.sign(y) || 1;
    const rect: Rect = vertical
      ? [Math.min(sx * (hx - EDGE), sx * (hx - 0.25)), lo, Math.max(sx * (hx - EDGE), sx * (hx - 0.25)), hi]
      : [lo, Math.min(sy * (hy - EDGE), sy * (hy - 0.25)), hi, Math.max(sy * (hy - EDGE), sy * (hy - 0.25))];
    if (x < rect[0] || x > rect[2] || y < rect[1] || y > rect[3]) return null;
    const side = vertical ? (sx > 0 ? 1 : 3) : sy > 0 ? 0 : 2;
    const index = side * 4 + (side === 0 || side === 3 ? slot : 3 - slot) + 1;
    return { kind: 'mc', key: `mc${index}`, rect, index };
  }

  if (ay < L2_HALF) {
    if (ax < HUB_HALF) return { kind: 'hub', key: 'hub', rect: [-HUB_HALF, -L2_HALF, HUB_HALF, L2_HALF] };
    const east = x > 0;
    const rect: Rect = east
      ? [2.8, -L2_HALF + 0.2, hx - EDGE - 0.2, L2_HALF - 0.2]
      : [-(hx - EDGE - 0.2), -L2_HALF + 0.2, -2.8, L2_HALF - 0.2];
    return { kind: 'l2', key: east ? 'l2r' : 'l2l', rect, east };
  }

  const innerW = DIE_W - 2 * EDGE;
  const gpcW = innerW / GPC_COLS;
  const gpcH = hy - EDGE - L2_HALF;
  const col = Math.min(GPC_COLS - 1, Math.max(0, Math.floor((x + innerW / 2) / gpcW)));
  const row = y > 0 ? 0 : 1;
  const x0 = -innerW / 2 + col * gpcW;
  const yIn = ay - L2_HALF;
  const gpc = row * GPC_COLS + col;
  const yRect = (a: number, b: number): [number, number] =>
    row === 0 ? [L2_HALF + a, L2_HALF + b] : [-(L2_HALF + b), -(L2_HALF + a)];

  if (!smLevel || yIn < FRONT_END) {
    let enabled = 0;
    for (let i = 0; i < SM_COLS * SM_ROWS; i++) if (!disabled[gpc * SM_COLS * SM_ROWS + i]) enabled++;
    const [y0, y1] = yRect(0.12, gpcH - 0.12);
    return { kind: 'gpc', key: `gpc${gpc}`, rect: [x0 + 0.12, y0, x0 + gpcW - 0.12, y1], gpc, enabled };
  }

  const smW = gpcW / SM_COLS;
  const smH = (gpcH - FRONT_END) / SM_ROWS;
  const sc = Math.min(SM_COLS - 1, Math.floor((x - x0) / smW));
  const sr = Math.min(SM_ROWS - 1, Math.floor((yIn - FRONT_END) / smH));
  const id = (gpc * SM_COLS + sc) * SM_ROWS + sr;
  const [y0, y1] = yRect(FRONT_END + sr * smH + 0.05, FRONT_END + (sr + 1) * smH - 0.05);
  return {
    kind: 'sm',
    key: `sm${id}`,
    rect: [x0 + sc * smW + 0.06, y0, x0 + (sc + 1) * smW - 0.06, y1],
    gpc,
    sm: id,
    off: disabled[id] > 0,
  };
}

/**
 * Waypoints (plane-local) of a signal coming from GDDR7 chip `chip` (0..15): its memory
 * controller, the L2 half on that side, the nearest GPC, and that GPC's first enabled SM.
 */
export function traceWaypoints(chip: number, disabled: Uint8Array) {
  const hx = DIE_W / 2;
  const hy = DIE_H / 2;
  const side = Math.floor(chip / 4);
  const slotIdx = chip % 4;
  const slot = side === 0 || side === 3 ? slotIdx : 3 - slotIdx;
  const vertical = side === 1 || side === 3;
  const span = vertical ? DIE_H - 2 * EDGE : DIE_W - 2 * EDGE;
  const along = -span / 2 + (slot + 0.5) * (span / 4);
  const mc: [number, number] = vertical
    ? [side === 1 ? hx - EDGE / 2 : -(hx - EDGE / 2), along]
    : [along, side === 0 ? hy - EDGE / 2 : -(hy - EDGE / 2)];
  const l2: [number, number] = [(Math.sign(mc[0]) || 1) * (hx - EDGE) * 0.55, 0];
  const innerW = DIE_W - 2 * EDGE;
  const gpcW = innerW / GPC_COLS;
  const gpcH = hy - EDGE - L2_HALF;
  const col = Math.min(GPC_COLS - 1, Math.max(0, Math.floor((mc[0] + innerW / 2) / gpcW)));
  const row = mc[1] >= 0 ? 0 : 1;
  const ySign = row === 0 ? 1 : -1;
  const x0 = -innerW / 2 + col * gpcW;
  const gpc: [number, number] = [x0 + gpcW / 2, ySign * (L2_HALF + 0.17)];
  const smW = gpcW / SM_COLS;
  const smH = (gpcH - FRONT_END) / SM_ROWS;
  let sm: [number, number] = [x0 + smW / 2, ySign * (L2_HALF + FRONT_END + smH / 2)];
  search: for (let sr = 0; sr < SM_ROWS; sr++) {
    for (let sc = 0; sc < SM_COLS; sc++) {
      if (!disabled[smId(row, col, sc, sr)]) {
        sm = [x0 + (sc + 0.5) * smW, ySign * (L2_HALF + FRONT_END + (sr + 0.5) * smH)];
        break search;
      }
    }
  }
  return { mc, l2, gpc, sm };
}
