/**
 * The robber's recipe, for every piece on the table: model a small volume in
 * a 2:1 view, paint it four times larger with light, texture and grime, then
 * average it down so each pixel is a little painting of its own. Edges stay
 * hard and there is no outline; the rim is just the darker side of the form.
 *
 * World axes: x runs to the lower right, y to the lower left, z up. One world
 * unit is one final pixel.
 */
import { Raster, grade, hash2, mix, noise, type RGB } from "./raster.ts";

export type V3 = readonly [number, number, number];
/** Paints a point of a face. `u`, `v` are distances along the face edges; `z` is the height. */
export type Material = (u: number, v: number, z: number, px: number, py: number) => Ink | null;
/** A color, or a light (fourth element 1) that ignores shading. */
export type Ink = RGB | readonly [number, number, number, 1];

export function lit(c: RGB): Ink {
  return [c[0], c[1], c[2], 1];
}

/** Supersampling: hi-res texels per final pixel, per axis. */
const K = 4;
/** Direction toward the light: upper left of the screen, from above. */
const LIGHT: V3 = norm([-0.25, 0.75, 1]);
const GLOW_KEY = 1;

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export class Sculpt {
  readonly w: number;
  readonly h: number;
  /** Final-pixel position of the world origin. */
  readonly ox: number;
  readonly oy: number;
  private readonly col: Float32Array;
  private readonly cov: Uint8Array;

  constructor(w: number, h: number, ox: number, oy: number) {
    this.w = w;
    this.h = h;
    this.ox = ox;
    this.oy = oy;
    this.col = new Float32Array(w * K * h * K * 3);
    this.cov = new Uint8Array(w * K * h * K);
  }

  private screen(p: V3): [number, number] {
    return [(this.ox + p[0] - p[1]) * K, (this.oy + (p[0] + p[1]) * 0.5 - p[2]) * K];
  }

  /**
   * Paints the face o + a*u + b*v (a, b in 0..1; a + b <= 1 when `tri`).
   * Light comes from the face normal unless `light` is given; `glow` faces
   * ignore light and survive the final rim darkening.
   */
  face(o: V3, u: V3, v: V3, mat: Material, opts: { light?: number; tri?: boolean; glow?: boolean; ao?: boolean } = {}): void {
    const [x0, y0] = this.screen(o);
    const [xu, yu] = this.screen([o[0] + u[0], o[1] + u[1], o[2] + u[2]]);
    const [xv, yv] = this.screen([o[0] + v[0], o[1] + v[1], o[2] + v[2]]);
    const ux = xu - x0;
    const uy = yu - y0;
    const vx = xv - x0;
    const vy = yv - y0;
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-6) return;
    let n = norm(cross(u, v));
    // face the viewer, who looks along (1, 1, 1)
    if (n[0] + n[1] + n[2] < 0) n = [-n[0], -n[1], -n[2]];
    const diffuse = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const light = opts.light ?? 0.5 + 0.62 * diffuse;
    const lu = Math.hypot(u[0], u[1], u[2]);
    const lv = Math.hypot(v[0], v[1], v[2]);
    const W = this.w * K;
    const H = this.h * K;
    const xs = [x0, xu, xv, xu + vx];
    const ys = [y0, yu, yv, yu + vy];
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const dx = px + 0.5 - x0;
        const dy = py + 0.5 - y0;
        const a = (dx * vy - dy * vx) / det;
        const b = (ux * dy - uy * dx) / det;
        if (a < 0 || a > 1 || b < 0 || b > 1 || (opts.tri && a + b > 1)) continue;
        const z = o[2] + a * u[2] + b * v[2];
        const c = mat(a * lu, b * lv, z, px, py);
        if (!c) continue;
        let k = light;
        // the foot of every wall sits in its own shade
        if (opts.ao !== false) k *= 0.76 + 0.24 * Math.min(1, Math.max(0, z / 3));
        const i = py * W + px;
        if (opts.glow || c.length === 4) {
          this.col[i * 3] = c[0];
          this.col[i * 3 + 1] = c[1];
          this.col[i * 3 + 2] = c[2];
          this.cov[i] = 1 + GLOW_KEY;
        } else {
          this.col[i * 3] = c[0] * k;
          this.col[i * 3 + 1] = c[1] * k;
          this.col[i * 3 + 2] = c[2] * k;
          this.cov[i] = 1;
        }
      }
    }
  }

  /** The three faces a viewer sees on an axis-aligned box. */
  box(p: V3, s: V3, mats: { top?: Material; left?: Material; right?: Material }, opts: { glow?: boolean } = {}): void {
    const [x, y, z] = p;
    const [dx, dy, dz] = s;
    if (mats.right) this.face([x + dx, y, z], [0, dy, 0], [0, 0, dz], mats.right, opts);
    if (mats.left) this.face([x, y + dy, z], [dx, 0, 0], [0, 0, dz], mats.left, opts);
    if (mats.top) this.face([x, y, z + dz], [dx, 0, 0], [0, dy, 0], mats.top, opts);
  }

  /** Flat blob in screen space (smoke, foam): `fn` gets the offset from the center in final pixels. */
  blob(cx: number, cy: number, r: number, fn: (dx: number, dy: number, px: number, py: number) => Ink | null): void {
    const W = this.w * K;
    const H = this.h * K;
    for (let py = Math.max(0, Math.floor((cy - r) * K)); py < Math.min(H, Math.ceil((cy + r) * K)); py++) {
      for (let px = Math.max(0, Math.floor((cx - r) * K)); px < Math.min(W, Math.ceil((cx + r) * K)); px++) {
        const dx = (px + 0.5) / K - cx;
        const dy = (py + 0.5) / K - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const c = fn(dx, dy, px, py);
        if (!c) continue;
        const i = py * W + px;
        this.col[i * 3] = c[0];
        this.col[i * 3 + 1] = c[1];
        this.col[i * 3 + 2] = c[2];
        this.cov[i] = c.length === 4 ? 1 + GLOW_KEY : 1;
      }
    }
  }

  /** Final-pixel position of a world point. */
  at(p: V3): [number, number] {
    const [x, y] = this.screen(p);
    return [x / K, y / K];
  }

  /**
   * Averages down to final pixels: a pixel exists when at least half of it
   * was painted, the silhouette's edge sinks a little, and lights spill a
   * warm halo onto the pixels around them.
   */
  finish(seed: number, mood = 0.4): Raster {
    const out = new Raster(this.w, this.h);
    const W = this.w * K;
    const glow = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        let lit = 0;
        for (let j = 0; j < K; j++) {
          for (let i = 0; i < K; i++) {
            const t = (y * K + j) * W + x * K + i;
            if (!this.cov[t]) continue;
            r += this.col[t * 3]!;
            g += this.col[t * 3 + 1]!;
            b += this.col[t * 3 + 2]!;
            n += 1;
            if (this.cov[t] > 1) lit += 1;
          }
        }
        if (n * 2 < K * K) continue;
        out.set(x, y, [r / n, g / n, b / n]);
        if (lit * 2 >= n) glow[y * this.w + x] = 1;
      }
    }
    grade(out, seed, mood);
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && out.alpha(x, y) > 0;
    const edits: Array<[number, number, RGB]> = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!solid(x, y)) continue;
        const c = out.get(x, y)!;
        if (glow[y * this.w + x]) {
          // lights keep their own color, a touch hotter in the middle
          edits.push([x, y, c]);
          continue;
        }
        let k = 1;
        if (!solid(x - 1, y) || !solid(x, y - 1)) k = 0.86;
        if (!solid(x + 1, y) || !solid(x, y + 1)) k = 0.7;
        let warm = 0;
        for (let j = -2; j <= 2; j++) {
          for (let i = -2; i <= 2; i++) {
            if (glow[(y + j) * this.w + x + i] && x + i >= 0 && x + i < this.w && y + j >= 0 && y + j < this.h) {
              warm = Math.max(warm, 1 - Math.hypot(i, j) / 3);
            }
          }
        }
        // the robber's crunch: no two neighbors quite alike
        k *= 1 + (hash2(x, y, seed + 3) - 0.5) * 0.22;
        let e: RGB = [c[0] * k, c[1] * k, c[2] * k];
        if (warm > 0) e = mix(e, [255, 170, 70], warm * 0.38);
        edits.push([x, y, e]);
      }
    }
    for (const [x, y, c] of edits) out.set(x, y, c);
    return out;
  }
}

/* ---------- materials ---------- */

/** Smooth pick along a ramp, with a hi-res speck so the average looks brushed. */
export function shade(ramp: readonly RGB[], t: number, px: number, py: number): RGB {
  const v = Math.max(0, Math.min(0.9999, t + (hash2(px, py, 911) - 0.5) * 0.16)) * (ramp.length - 1);
  const i = Math.floor(v);
  return mix(ramp[i]!, ramp[Math.min(ramp.length - 1, i + 1)]!, v - i);
}

/** Overlapping shingle rows; `v` runs from the eave up. */
export function shingles(ramp: readonly RGB[], seed: number, row = 2.2, tile = 2.8): Material {
  return (u, v, _z, px, py) => {
    const r = Math.floor(v / row);
    const f = v / row - r;
    const off = r % 2 ? tile / 2 : 0;
    const t0 = Math.floor((u + off) / tile);
    const seam = (u + off) / tile - t0;
    let t = 0.55 + (hash2(t0, r, seed) - 0.5) * 0.4 + (noise(u / 3, v / 3, seed) - 0.5) * 0.3;
    if (f < 0.28) t -= 0.42; // each row casts a lip of shade on the one below
    else if (f > 0.8) t += 0.12;
    if (seam < 0.1) t -= 0.25;
    if (hash2(t0, r, seed + 5) < 0.05) t -= 0.25; // a slipped or darker tile
    const c = shade(ramp, t, px, py);
    // moss creeping up from the eave
    if (v < 3 && noise(u / 2, v / 2, seed + 9) > 0.62) return mix(c, [70, 92, 44], 0.55);
    return c;
  };
}

/** Rough stone courses with dark mortar. */
export function stones(ramp: readonly RGB[], seed: number, course = 2.4): Material {
  return (u, v, _z, px, py) => {
    const r = Math.floor(v / course);
    const f = v / course - r;
    const len = 2.6 + hash2(r, 3, seed) * 1.6;
    const off = hash2(r, 4, seed) * len;
    const b = Math.floor((u + off) / len);
    const seam = (u + off) / len - b;
    if (f < 0.2 || seam < 0.12) return shade(ramp, 0.08, px, py);
    let t = 0.48 + (hash2(b, r, seed) - 0.5) * 0.45 + (noise(u / 1.6, v / 1.6, seed + 1) - 0.5) * 0.35;
    if (f > 0.78) t += 0.12;
    return shade(ramp, t, px, py);
  };
}

/** Boards running along `u` (or `v` when `across`), with grain, seams and nails. */
export function planks(ramp: readonly RGB[], seed: number, width = 2, across = false): Material {
  return (u0, v0, _z, px, py) => {
    const u = across ? v0 : u0;
    const v = across ? u0 : v0;
    const r = Math.floor(v / width);
    const f = v / width - r;
    if (f < 0.16) return shade(ramp, 0.05, px, py);
    const grain = noise(u / 4, v * 2.4, seed + r) - 0.5;
    let t = 0.5 + (hash2(r, 1, seed) - 0.5) * 0.35 + grain * 0.45;
    if (f > 0.75) t += 0.1;
    if (Math.abs(((u + hash2(r, 2, seed) * 5) % 6) - 0.5) < 0.35 && f > 0.4 && f < 0.6) t -= 0.4;
    return shade(ramp, t, px, py);
  };
}

/** Lime plaster, dirtier toward the ground. */
export function plaster(ramp: readonly RGB[], seed: number): Material {
  return (u, v, z, px, py) => {
    let t = 0.62 + (noise(u / 2.5, v / 2.5, seed) - 0.5) * 0.35 + (noise(u / 0.9, v / 0.9, seed + 1) - 0.5) * 0.2;
    t -= Math.max(0, 0.35 - z * 0.06);
    if (noise(u / 3, v / 1.2, seed + 2) > 0.74) t -= 0.25; // a damp streak
    return shade(ramp, t, px, py);
  };
}

/** A flat color with grain (beams, sills, cloth trims). */
export function solid(ramp: readonly RGB[], t: number, seed: number): Material {
  return (u, v, _z, px, py) => shade(ramp, t + (noise(u / 1.5, v / 1.5, seed) - 0.5) * 0.3, px, py);
}

/** Overlays rectangles in face coordinates on top of a base material. */
export function decal(base: Material, parts: Array<{ u0: number; v0: number; u1: number; v1: number; m: Material }>): Material {
  return (u, v, z, px, py) => {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!;
      if (u >= p.u0 && u < p.u1 && v >= p.v0 && v < p.v1) return p.m(u - p.u0, v - p.v0, z, px, py);
    }
    return base(u, v, z, px, py);
  };
}
