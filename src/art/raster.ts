/**
 * Tiny pixel canvas for the procedural art. Pure: runs in the browser (the
 * island is painted per map) and in Node (`npm run art`). Everything is seeded.
 */

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
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
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

export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise. `period` makes it tile (for the sea). */
export function noise(x: number, y: number, seed: number, period = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  let xa = x0;
  let xb = x0 + 1;
  let ya = y0;
  let yb = y0 + 1;
  if (period) {
    xa = ((xa % period) + period) % period;
    xb = ((xb % period) + period) % period;
    ya = ((ya % period) + period) % period;
    yb = ((yb % period) + period) % period;
  }
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xa, ya, seed);
  const b = hash2(xb, ya, seed);
  const c = hash2(xa, yb, seed);
  const d = hash2(xb, yb, seed);
  const top = a + (b - a) * sx;
  return top + (c + (d - c) * sx - top) * sy;
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

/* ---------- painterly finish (the robber's look) ---------- */

/**
 * Like `ramp`, but blends smoothly between steps with a little grain instead
 * of ordered dithering, so a downsampled picture reads painted, not patterned.
 */
export function tone(colors: readonly RGB[], t: number, x: number, y: number): RGB {
  const v = Math.max(0, Math.min(0.9999, t + (hash2(x, y, 7177) - 0.5) * 0.1)) * (colors.length - 1);
  const i = Math.floor(v);
  return mix(colors[i]!, colors[Math.min(colors.length - 1, i + 1)]!, v - i);
}

/** Box-averages `k`x`k` blocks, weighting color by alpha. */
export function downsample(src: Raster, k: number): Raster {
  const out = new Raster(Math.floor(src.w / k), Math.floor(src.h / k));
  const d = src.data;
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const o = ((y * k + j) * src.w + x * k + i) * 4;
          const w = d[o + 3]!;
          r += d[o]! * w;
          g += d[o + 1]! * w;
          b += d[o + 2]! * w;
          a += w;
        }
      }
      if (!a) continue;
      const o = (y * out.w + x) * 4;
      out.data[o] = r / a;
      out.data[o + 1] = g / a;
      out.data[o + 2] = b / a;
      out.data[o + 3] = a / (k * k);
    }
  }
  return out;
}

/**
 * The robber's grade: a little less saturation, shadows sinking toward a cool
 * violet, lights warming toward lantern gold, and a per-pixel grain so no two
 * neighbors are quite the same color.
 */
export function grade(r: Raster, seed: number, amount = 1): void {
  const d = r.data;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const o = (y * r.w + x) * 4;
      if (!d[o + 3]) continue;
      const R = d[o]!;
      const G = d[o + 1]!;
      const B = d[o + 2]!;
      const L = 0.3 * R + 0.59 * G + 0.11 * B;
      const t = L / 255;
      const sat = 1 - 0.2 * amount;
      const k = (1 - amount) + amount * (0.7 + 0.42 * t) * (1 + (hash2(x, y, seed) - 0.5) * 0.12);
      const sh = Math.max(0, 0.42 - t) * amount;
      const hl = Math.max(0, t - 0.55) * amount;
      d[o] = (L + (R - L) * sat) * k + 10 * sh + 34 * hl;
      d[o + 1] = (L + (G - L) * sat) * k - 6 * sh + 14 * hl;
      d[o + 2] = (L + (B - L) * sat) * k + 22 * sh - 22 * hl;
    }
  }
}
