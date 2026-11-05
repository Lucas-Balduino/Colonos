/**
 * Tiny pixel canvas for the procedural art. Everything is seeded, so running
 * `npm run art` twice writes the same bytes.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  PNG: { new (o: { width: number; height: number }): { data: Buffer }; sync: { write(p: unknown): Buffer } };
};

export type RGB = readonly [number, number, number];

export function hex(c: string): RGB {
  const n = Number.parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export class Raster {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): RGB | null {
    if (!this.inside(x, y)) return null;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] === 0) return null;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!];
  }

  alpha(x: number, y: number): number {
    return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3]! : 0;
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  /** Multiplies an existing pixel (shadows, bevels). */
  tint(x: number, y: number, k: number): void {
    const c = this.get(Math.floor(x), Math.floor(y));
    if (c) this.set(x, y, scale(c, k), this.alpha(Math.floor(x), Math.floor(y)));
  }

  toPng(file: string): void {
    const png = new PNG({ width: this.w, height: this.h });
    png.data.set(this.data);
    writeFileSync(file, PNG.sync.write(png));
  }
}

/* ---------- randomness and noise ---------- */

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise. `period` makes it tile (for the sea). */
export function noise(x: number, y: number, seed: number, period = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrap = (v: number) => (period ? ((v % period) + period) % period : v);
  const s = (t: number) => t * t * (3 - 2 * t);
  const v = (ix: number, iy: number) => hash2(wrap(ix), wrap(iy), seed);
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * s(fx);
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * s(fx);
  return a + (b - a) * s(fy);
}

export function fbm(x: number, y: number, seed: number, octaves = 3, period = 0): number {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * f, y * f, seed + o * 17, period ? period * f : 0) * amp;
    total += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / total;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function bayer(x: number, y: number): number {
  return BAYER[(y & 3) * 4 + (x & 3)]!;
}

/** Picks a ramp color for t in [0, 1] with ordered dithering between steps. */
export function ramp(colors: readonly RGB[], t: number, x: number, y: number): RGB {
  const v = Math.max(0, Math.min(0.9999, t)) * (colors.length - 1);
  const i = Math.floor(v);
  const frac = v - i;
  return colors[Math.min(colors.length - 1, frac > bayer(x, y) ? i + 1 : i)]!;
}

/* ---------- hex geometry (pointy top) ---------- */

export const HEX_R = 56;
export const TILE_W = 97;
export const TILE_H = 112;
export const CX = TILE_W / 2;
export const CY = TILE_H / 2;
const SQ3 = Math.sqrt(3);

/** Signed distance to the hex border in pixels (positive inside). */
export function hexInset(x: number, y: number, r = HEX_R + 0.65): number {
  const dx = Math.abs(x + 0.5 - CX);
  const dy = Math.abs(y + 0.5 - CY);
  const side = (SQ3 / 2) * r - dx;
  const slant = ((r - dy) * SQ3) / 2 - dx / 2;
  return Math.min(side, slant);
}

/** Which way the nearest border faces: 1 = toward the light (top left), -1 = away. */
export function borderLight(x: number, y: number): number {
  const dx = x + 0.5 - CX;
  const dy = y + 0.5 - CY;
  const ang = Math.atan2(dy, dx);
  const edge = Math.round(ang / (Math.PI / 3));
  const nx = Math.cos(edge * (Math.PI / 3));
  const ny = Math.sin(edge * (Math.PI / 3));
  return -(nx * 0.55 + ny * 0.85);
}

/** Hex corners, where houses sit. Props stay clear of these. */
export const CORNERS = Array.from({ length: 6 }, (_, i) => {
  const a = ((60 * i - 30) * Math.PI) / 180;
  return { x: CX + HEX_R * Math.cos(a), y: CY + HEX_R * Math.sin(a) };
});
