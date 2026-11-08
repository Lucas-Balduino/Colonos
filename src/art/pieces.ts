/**
 * Player pieces and board furniture, drawn at 2 texels per world pixel like
 * the island. Each piece's base sits at 90% of its height (sprite anchor).
 */
import { P } from "./palette.ts";
import { Shape } from "./props.ts";
import { Raster, hash2, hex, mix, noise, ramp, type RGB } from "./raster.ts";

/** Five tones from one faction color: deep shadow to sunlit. */
export function factionRamp(base: string): RGB[] {
  const c = hex(base);
  return [mix(c, P.ink, 0.62), mix(c, P.ink, 0.35), c, mix(c, [255, 244, 214], 0.28), mix(c, [255, 248, 228], 0.55)];
}

const PLASTER = ["#8a7658", "#b09a74", "#d2bd92", "#e8d8b0", "#f6ecd0"].map(hex);
const TIMBER = ["#2a1a10", "#422a18", "#5e3e22"].map(hex);
const GLOW = ["#a8401a", "#f0a03a", "#ffd877", "#fff4c8"].map(hex);

function softShadow(r: Raster, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d <= 1 && r.alpha(x, y) === 0) r.set(x, y, [16, 10, 6], d > 0.6 ? 60 : 105);
    }
  }
}

function rect(s: Shape, x0: number, y0: number, x1: number, y1: number, color: (x: number, y: number) => RGB): void {
  for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) s.put(x, y, color(x, y));
}

function window(s: Shape, x: number, y: number, w: number, h: number): void {
  rect(s, x - 1, y - 1, x + w, y + h, () => TIMBER[0]!);
  rect(s, x, y, x + w - 1, y + h - 1, (px, py) => {
    const d = Math.hypot(px - (x + w / 2), py - (y + h / 2)) / (w * 0.7);
    return ramp(GLOW, 1 - d, px, py);
  });
  const mx = x + Math.floor(w / 2);
  const my = y + Math.floor(h / 2);
  for (let k = y; k < y + h; k++) s.put(mx, k, TIMBER[1]!);
  for (let k = x; k < x + w; k++) s.put(k, my, TIMBER[1]!);
  // flower box
  rect(s, x - 1, y + h, x + w, y + h + 1, () => TIMBER[2]!);
  for (let k = x; k < x + w; k += 2) s.put(k, y + h - 1 + 0, hash2(k, y, 3) > 0.5 ? hex("#d65a6a") : hex("#f2d24a"));
}

/**
 * A timber-framed cottage seen from the front and a little to the right:
 * plaster wall, stone footing, shingled roof in the faction color, a gable
 * end on the right.
 */
function cottage(s: Shape, x0: number, base: number, w: number, wallH: number, roofH: number, roof: RGB[], seed: number): void {
  const x1 = x0 + w - 1;
  const wallTop = base - 4 - wallH;
  // stone footing
  rect(s, x0, base - 4, x1 + 6, base, (x, y) => {
    const mortar = (y - base) % 3 === 0 || (x + Math.floor((base - y) / 3) * 3) % 6 === 0;
    return mortar ? P.stone[1]! : ramp(P.stone, 0.62 - (x - x0) / (w * 3) + (hash2(x >> 1, y, seed) - 0.5) * 0.25, x, y);
  });
  // front wall
  rect(s, x0, wallTop, x1, base - 5, (x, y) => ramp(PLASTER, 0.62 + (noise(x / 3, y / 3, seed) - 0.5) * 0.3 - (x - x0) / (w * 4), x, y));
  for (const bx of [x0, x0 + 1, x1 - 1, x1]) rect(s, bx, wallTop, bx, base - 5, () => TIMBER[1]!);
  const mid = x0 + Math.floor(w / 2);
  rect(s, mid, wallTop, mid + 1, base - 5, () => TIMBER[1]!);
  rect(s, x0, wallTop, x1, wallTop + 1, () => TIMBER[0]!);
  // cross brace on the left panel
  for (let k = 0; k < wallH - 2; k++) {
    const x = x0 + 2 + Math.round((k * (mid - x0 - 3)) / (wallH - 2));
    if (x < mid - 6 || k > wallH * 0.7) continue;
    s.put(x, base - 6 - k, TIMBER[2]!);
  }
  // side wall (right), receding upward
  const depth = 6;
  for (let k = 1; k <= depth; k++) {
    const lift = Math.round(k * 0.6);
    rect(s, x1 + k, wallTop - lift, x1 + k, base - 5 - lift, (x, y) => ramp(PLASTER, 0.3 + (noise(x / 3, y / 3, seed) - 0.5) * 0.2, x, y));
  }
  // roof front slope with shingle rows
  const eaveY = wallTop + 1;
  const ridgeY = eaveY - roofH;
  for (let y = ridgeY; y <= eaveY; y++) {
    const t = (y - ridgeY) / roofH;
    const left = Math.round(x0 - 3 + (1 - t) * 3);
    const right = Math.round(x1 + 2 - (1 - t) * 1);
    const row = Math.floor((eaveY - y) / 3);
    for (let x = left; x <= right; x++) {
      const seam = (eaveY - y) % 3 === 0;
      const slit = (x + (row % 2) * 3) % 6 === 0;
      let tone = 0.75 - t * 0.35 - (x - left) / ((right - left) * 5);
      if (seam) tone -= 0.3;
      else if (slit) tone -= 0.18;
      tone += (hash2(x >> 1, row, seed) - 0.5) * 0.12;
      s.put(x, y, ramp(roof, tone, x, y));
    }
  }
  // eave shadow line and ridge cap
  rect(s, x0 - 3, eaveY + 1, x1 + 2, eaveY + 1, () => roof[0]!);
  rect(s, x0, ridgeY - 1, x1 + 1, ridgeY - 1, () => roof[3]!);
  // gable end on the right
  const gx = x1 + 3;
  for (let k = 0; k <= depth + 2; k++) {
    const x = gx + k;
    const top = ridgeY + Math.round((k * roofH) / (depth + 6));
    const bottom = eaveY - Math.round(k * 0.6);
    for (let y = top; y <= bottom; y++) s.put(x, y, k === 0 || y === top ? roof[1]! : ramp(PLASTER, 0.22, x, y));
  }
}

function door(s: Shape, x: number, base: number, w: number, h: number): void {
  rect(s, x - 1, base - 4 - h - 1, x + w, base - 5, () => TIMBER[0]!);
  rect(s, x, base - 4 - h, x + w - 1, base - 5, (px, py) => (px === x + Math.floor(w / 2) ? TIMBER[0]! : ramp(TIMBER, 0.5 + (py % 3 === 0 ? -0.3 : 0), px, py)));
  s.put(x + w - 2, base - 4 - Math.floor(h / 2), P.gold[4]!);
  // lantern beside the door
  rect(s, x + w + 2, base - 4 - h + 1, x + w + 3, base - 4 - h + 3, () => GLOW[2]!);
  s.put(x + w + 2, base - 4 - h, TIMBER[0]!);
}

export function settlement(color: string): Raster {
  const W = 64;
  const H = 76;
  const base = Math.round(H * 0.9);
  const r = new Raster(W, H);
  const roof = factionRamp(color);
  softShadow(r, W / 2 + 4, base, 27, 5);
  const s = new Shape();
  cottage(s, 13, base, 32, 16, 16, roof, 7);
  door(s, 18, base, 7, 11);
  window(s, 33, base - 17, 6, 6);
  // chimney with a stone cap
  rect(s, 36, base - 46, 40, base - 34, (x, y) => ramp(P.stone, 0.55 - (x - 36) * 0.08 + (((y + x) % 4 === 0) ? -0.2 : 0), x, y));
  rect(s, 35, base - 47, 41, base - 46, () => P.stone[2]!);
  s.draw(r, P.ink);
  return r;
}

export function city(color: string): Raster {
  const W = 88;
  const H = 100;
  const base = Math.round(H * 0.9);
  const r = new Raster(W, H);
  const roof = factionRamp(color);
  softShadow(r, W / 2 + 6, base, 38, 6);
  const s = new Shape();
  // stone tower behind, on the left
  const tx = 8;
  const tw = 20;
  const towerTop = base - 58;
  rect(s, tx, towerTop, tx + tw, base, (x, y) => {
    const row = Math.floor((base - y) / 4);
    const mortar = (base - y) % 4 === 0 || (x + (row % 2) * 4) % 8 === 0;
    const lit = 0.7 - (x - tx) / (tw * 1.6);
    return mortar ? P.stone[1]! : ramp(P.stone, lit + (hash2(x >> 2, row, 5) - 0.5) * 0.2, x, y);
  });
  window(s, tx + 8, towerTop + 10, 4, 7);
  // crenellations
  for (let x = tx - 1; x <= tx + tw + 1; x += 4) rect(s, x, towerTop - 4, x + 1, towerTop - 1, () => P.stone[4]!);
  rect(s, tx - 1, towerTop - 1, tx + tw + 1, towerTop, () => P.stone[2]!);
  // pointed roof on the tower
  const peak = towerTop - 22;
  for (let y = peak; y <= towerTop - 2; y++) {
    const t = (y - peak) / (towerTop - 2 - peak);
    const half = Math.round(2 + t * (tw / 2 + 2));
    const cx = tx + tw / 2;
    for (let x = Math.floor(cx - half); x <= cx + half; x++) {
      const lit = x < cx ? 0.75 : 0.35;
      const seam = (y - peak) % 3 === 0 ? -0.25 : 0;
      s.put(x, y, ramp(roof, lit + seam - t * 0.15, x, y));
    }
  }
  // flag
  const pole = tx + tw / 2;
  rect(s, pole, peak - 12, pole, peak, () => TIMBER[1]!);
  for (let y = peak - 12; y < peak - 6; y++) {
    for (let x = pole + 1; x <= pole + 8; x++) {
      const wave = Math.round(Math.sin((x - pole) * 0.9) * 0.8);
      if (y + wave < peak - 12 || y + wave >= peak - 6) continue;
      s.put(x, y + wave, ramp(roof, 0.75 - (x - pole) * 0.04, x, y));
    }
  }
  // main hall in front
  cottage(s, 26, base, 42, 22, 20, roof, 13);
  door(s, 31, base, 9, 15);
  window(s, 47, base - 22, 6, 7);
  window(s, 57, base - 22, 6, 7);
  // banner on the hall
  rect(s, 44, base - 12, 49, base - 5, (x, y) => ramp(roof, 0.65 - (y - base + 12) * 0.04, x, y));
  s.put(46, base - 10, P.gold[4]!);
  s.put(47, base - 10, P.gold[4]!);
  s.draw(r, P.ink);
  return r;
}

/** White-ish silhouette for build previews. */
export function ghost(src: Raster): Raster {
  const r = new Raster(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const a = src.alpha(x, y);
      if (a < 200) continue;
      const c = src.get(x, y)!;
      const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      r.set(x, y, mix(hex("#7a6a50"), hex("#fbf4e0"), Math.min(1, lum * 1.4)));
    }
  }
  return r;
}

export function robber(frame: 0 | 1): Raster {
  const W = 48;
  const H = 84;
  const base = Math.round(H * 0.85);
  const r = new Raster(W, H);
  softShadow(r, W / 2 + 4, base, 16, 4);
  const s = new Shape();
  const cloak = ["#121018", "#1e1a26", "#2c2636", "#3c344a", "#52486a"].map(hex);
  const cx = W / 2;
  const hoodY = base - 50;
  // cloak: a bell that flares at the hem
  for (let y = hoodY; y <= base; y++) {
    const t = (y - hoodY) / (base - hoodY);
    const half = 7 + t * 10 + (y > base - 3 ? 1 : 0);
    const sway = frame ? Math.round(t * t * 1.5) : 0;
    for (let x = Math.floor(cx - half + sway); x <= cx + half + sway; x++) {
      const across = (x - (cx + sway)) / half;
      let tone = 0.62 - across * 0.4 - t * 0.12;
      // folds
      if (Math.abs(Math.sin((x - cx) * 0.55 + t * 2)) > 0.92 && t > 0.3) tone -= 0.25;
      if (y >= base - 1 && (x + y) % 3 === 0) continue;
      s.put(x, y, ramp(cloak, tone, x, y));
    }
  }
  // hood
  for (let y = hoodY - 12; y <= hoodY + 6; y++) {
    for (let x = cx - 9; x <= cx + 9; x++) {
      const d = ((x - cx) / 9) ** 2 + ((y - (hoodY - 2)) / 10) ** 2;
      if (d > 1) continue;
      s.put(x, y, ramp(cloak, 0.7 - ((x - cx) / 9) * 0.4 - ((y - hoodY) / 10) * 0.2, x, y));
    }
  }
  // the dark opening and two eyes
  for (let y = hoodY - 5; y <= hoodY + 3; y++) {
    for (let x = cx - 5; x <= cx + 4; x++) {
      if (((x - cx + 0.5) / 5) ** 2 + ((y - (hoodY - 1)) / 4.5) ** 2 <= 1) s.put(x, y, hex("#07060a"));
    }
  }
  const eye = frame ? GLOW[2]! : GLOW[3]!;
  for (const ex of [cx - 3, cx + 1]) {
    s.put(ex, hoodY - 2, eye);
    s.put(ex + 1, hoodY - 2, eye);
  }
  // a stolen sack over the shoulder
  for (let y = hoodY + 2; y <= hoodY + 16; y++) {
    for (let x = cx + 6; x <= cx + 18; x++) {
      const d = ((x - (cx + 12)) / 6.5) ** 2 + ((y - (hoodY + 9)) / 7.5) ** 2;
      if (d <= 1) s.put(x, y, ramp(P.sand, 0.65 - ((x - cx - 12) / 6.5) * 0.3 - ((y - hoodY - 9) / 7.5) * 0.3, x, y));
    }
  }
  rect(s, cx + 9, hoodY + 1, cx + 14, hoodY + 2, () => P.trunk[1]!);
  s.draw(r, P.ink);
  return r;
}

/** Number token: parchment disc in a carved wooden rim. */
export function token(): Raster {
  const W = 64;
  const r = new Raster(W, W);
  const c = W / 2;
  softShadow(r, c + 2, c + 5, 28, 26);
  const parchment = ["#c9b48a", "#dccaa0", "#ecdcb4", "#f6ead0", "#fff6e2"].map(hex);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d > 28) continue;
      const light = (-dx - dy) / 40;
      if (d > 23) {
        const grain = noise(Math.atan2(dy, dx) * 6, d / 2, 4) - 0.5;
        r.set(x, y, d > 27 ? P.ink : ramp(P.trunk, 0.55 + light * 0.6 + grain * 0.5, x, y));
      } else if (d > 21.5) r.set(x, y, P.trunk[0]!);
      else r.set(x, y, ramp(parchment, 0.6 + light * 0.35 + (noise(x / 3, y / 3, 8) - 0.5) * 0.2, x, y));
    }
  }
  return r;
}

/** 3:1 harbor: a plank pier on posts with a lantern. */
export function pier(): Raster {
  const W = 72;
  const H = 64;
  const r = new Raster(W, H);
  const s = new Shape();
  // posts
  for (const [x, y] of [
    [12, 44],
    [30, 50],
    [48, 44],
    [60, 38],
  ] as const) {
    rect(s, x, y - 10, x + 2, y + 8, (px) => TIMBER[px === x ? 2 : 1]!);
    for (let k = 0; k < 3; k++) r.set(x + k, y + 9, P.water[5]!, 200);
  }
  // deck: diagonal planks
  for (let y = 18; y <= 42; y++) {
    for (let x = 6; x <= 66; x++) {
      const u = x - (y - 18) * 0.9;
      if (u < 4 || u > 46) continue;
      const plank = Math.floor((y - 18) / 3);
      const seam = (y - 18) % 3 === 2;
      s.put(x, y, seam ? TIMBER[1]! : ramp(P.soil, 0.65 + (hash2(Math.floor(u / 9), plank, 2) - 0.5) * 0.3 - (y - 18) / 80, x, y));
    }
  }
  // crates
  rect(s, 38, 14, 46, 22, (x, y) => (x === 38 || x === 46 || y === 14 || y === 22 || x - 38 === y - 14 ? TIMBER[1]! : ramp(P.soil, 0.7, x, y)));
  // lantern post
  rect(s, 20, 2, 21, 24, () => TIMBER[1]!);
  rect(s, 18, 2, 23, 3, () => TIMBER[0]!);
  rect(s, 19, 4, 22, 9, (x, y) => ramp(GLOW, 0.9 - Math.abs(x - 20.5) * 0.2 - (y - 4) * 0.05, x, y));
  s.draw(r, P.ink);
  return r;
}

/** 2:1 harbor: a moored sailboat. */
export function boat(): Raster {
  const W = 72;
  const H = 64;
  const r = new Raster(W, H);
  const s = new Shape();
  // hull
  for (let y = 40; y <= 52; y++) {
    const t = (y - 40) / 12;
    const left = Math.round(8 + t * 8);
    const right = Math.round(64 - t * 6);
    for (let x = left; x <= right; x++) {
      const stripe = y === 43 || y === 44;
      s.put(x, y, stripe ? hex("#2b6cb0") : ramp(P.trunk.concat([P.soil[4]!]), 0.75 - t * 0.6 + ((x + y) % 7 === 0 ? -0.15 : 0), x, y));
    }
  }
  // mast and sail
  rect(s, 36, 6, 37, 40, () => TIMBER[1]!);
  const sail = ["#b8ac90", "#d8ccac", "#f0e6cc", "#fff8e8"].map(hex);
  for (let y = 8; y <= 36; y++) {
    const t = (y - 8) / 28;
    const right = Math.round(38 + t * 20 + Math.sin(t * Math.PI) * 4);
    for (let x = 38; x <= right; x++) s.put(x, y, ramp(sail, 0.85 - (x - 38) / 40 - t * 0.2 + (y % 6 === 0 ? -0.2 : 0), x, y));
  }
  for (let y = 14; y <= 34; y++) {
    const t = (y - 14) / 20;
    for (let x = Math.round(34 - t * 14); x <= 35; x++) s.put(x, y, ramp(sail, 0.55 - t * 0.2, x, y));
  }
  s.draw(r, P.ink);
  // ripples
  for (let x = 6; x < 68; x++) if (hash2(x, 1, 9) > 0.45) r.set(x, 54 + (x % 5 === 0 ? 1 : 0), P.water[5]!, 190);
  return r;
}
