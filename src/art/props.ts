/**
 * Things standing on the island. Coordinates are texels; `s` is texels per
 * world pixel, so sizes given in world pixels are multiplied by it. Light
 * comes from the top left; shadows fall to the bottom right.
 */
import { P } from "./palette.ts";
import { hash2, hex, mix, noise, tone, type Raster, type RGB } from "./raster.ts";

/** A sprite assembled pixel by pixel, then stamped with an outline. */
export class Shape {
  private px = new Map<number, RGB>();
  put(x: number, y: number, c: RGB): void {
    this.px.set(Math.floor(y) * 8192 + Math.floor(x), c);
  }
  has(x: number, y: number): boolean {
    return this.px.has(y * 8192 + x);
  }
  draw(r: Raster, outline: RGB | null, onlyBelow = false): void {
    if (outline) {
      for (const key of this.px.keys()) {
        const x = key % 8192;
        const y = Math.floor(key / 8192);
        const dirs = onlyBelow ? [[0, 1], [1, 0], [-1, 0]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs as Array<[number, number]>) {
          if (!this.has(x + dx, y + dy)) r.set(x + dx, y + dy, outline);
        }
      }
    }
    for (const [key, c] of this.px) r.set(key % 8192, Math.floor(key / 8192), c);
  }
}

export function shadow(r: Raster, cx: number, cy: number, rx: number, ry: number, k = 0.62): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      // soft rim: the outer ring only darkens every other texel
      if (d > 0.7 && (x + y) % 2 === 0) continue;
      r.tint(x, y, k);
    }
  }
}

/** Lighting of a point on a ball: 0 dark .. 1 lit. */
function ball(dx: number, dy: number, rad: number): number {
  const nx = dx / rad;
  const ny = dy / rad;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return 0.5 + 0.5 * (-nx * 0.55 - ny * 0.65 + nz * 0.45) - 0.1;
}

function outlineOf(colors: readonly RGB[]): RGB {
  return mix(colors[0]!, P.ink, 0.45);
}

/** Leafy canopy made of many small round clumps, each catching the light. */
function canopy(shape: Shape, cx: number, cy: number, rx: number, ry: number, colors: readonly RGB[], seed: number, s: number): void {
  const clumps: Array<{ x: number; y: number; r: number }> = [];
  const n = Math.round(10 + (rx * ry) / (s * s * 3.2));
  for (let i = 0; i < n; i++) {
    const a = hash2(i, 1, seed) * Math.PI * 2;
    const d = Math.sqrt(hash2(i, 2, seed)) * 0.78;
    const r = s * (1.5 + hash2(i, 3, seed) * 1.6);
    clumps.push({ x: cx + Math.cos(a) * d * rx, y: cy + Math.sin(a) * d * ry, r });
  }
  clumps.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of clumps) {
    for (let y = Math.floor(c.y - c.r); y <= c.y + c.r; y++) {
      for (let x = Math.floor(c.x - c.r); x <= c.x + c.r; x++) {
        const dx = x + 0.5 - c.x;
        const dy = y + 0.5 - c.y;
        if (dx * dx + dy * dy > c.r * c.r) continue;
        const local = ball(dx, dy, c.r);
        const global = ball((x + 0.5 - cx) * (ry / rx), y + 0.5 - cy, ry * 1.15);
        let t = local * 0.42 + global * 0.62;
        // a dark crease along the lower rim of each clump
        if (dx * 0.5 + dy > c.r * 0.72) t -= 0.22;
        shape.put(x, y, tone(colors, t, x, y));
      }
    }
  }
  // sparkle: a few brightest leaves on the lit side
  for (let i = 0; i < n / 2; i++) {
    const x = Math.round(cx - rx * 0.6 + hash2(i, 5, seed) * rx);
    const y = Math.round(cy - ry * 0.7 + hash2(i, 6, seed) * ry * 0.8);
    if (shape.has(x, y)) shape.put(x, y, colors[colors.length - 1]!);
  }
}

export const TREE_KINDS = { autumn: P.autumn, rust: P.rust, gold: P.gold, oak: P.oak, pine: P.pine } as const;

export function leafLitter(r: Raster, cx: number, cy: number, rad: number, colors: readonly RGB[], seed: number): void {
  for (let y = Math.floor(cy - rad * 0.5); y <= cy + rad * 0.5; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const dx = (x - cx) / rad;
      const dy = (y - cy) / (rad * 0.5);
      const d = dx * dx + dy * dy;
      if (d > 1 || r.alpha(x, y) === 0) continue;
      if (hash2(x, y, seed) < 0.28 * (1 - d)) r.set(x, y, colors[1 + Math.floor(hash2(y, x, seed) * (colors.length - 2))]!);
    }
  }
}

export function tree(r: Raster, x: number, y: number, size: number, colors: readonly RGB[], seed: number, s: number): void {
  const R = size * s;
  shadow(r, x + R * 0.55, y + s, R * 1.05, R * 0.42, 0.55);
  leafLitter(r, x, y + s, R * 1.5, colors, seed + 9);
  const trunkH = Math.round(R * 0.85);
  const trunk = new Shape();
  const tw = Math.max(2, Math.round(s * 1.5));
  for (let ty = y - trunkH; ty <= y; ty++) {
    for (let k = 0; k < tw; k++) trunk.put(x - Math.floor(tw / 2) + k, ty, P.trunk[k === 0 ? 3 : k === tw - 1 ? 1 : 2]!);
  }
  // root flare
  trunk.put(x - Math.floor(tw / 2) - 1, y, P.trunk[2]!);
  trunk.put(x + Math.ceil(tw / 2), y, P.trunk[1]!);
  trunk.draw(r, P.trunk[0]!);
  const leaves = new Shape();
  canopy(leaves, x, y - trunkH - R * 0.62, R, R * 0.86, colors, seed, s);
  leaves.draw(r, outlineOf(colors));
}

export function bush(r: Raster, x: number, y: number, size: number, colors: readonly RGB[], seed: number, s: number): void {
  const R = size * s;
  shadow(r, x + R * 0.4, y + s * 0.5, R * 1.1, R * 0.4, 0.6);
  const leaves = new Shape();
  canopy(leaves, x, y - R * 0.55, R, R * 0.7, colors, seed, s);
  leaves.draw(r, outlineOf(colors));
}

export function rock(r: Raster, x: number, y: number, size: number, colors: readonly RGB[], seed: number, s: number): void {
  const rx = size * s * (1 + hash2(1, 1, seed) * 0.4);
  const ry = size * s * 0.75;
  shadow(r, x + rx * 0.4, y + s * 0.5, rx * 1.15, ry * 0.5, 0.6);
  const shape = new Shape();
  const cy = y - ry * 0.75;
  for (let py = Math.floor(cy - ry); py <= y; py++) {
    for (let px = Math.floor(x - rx); px <= x + rx; px++) {
      const dx = (px + 0.5 - x) / rx;
      const dy = (py + 0.5 - cy) / ry;
      const lumpy = 1 + (noise(px / (2 * s), py / (2 * s), seed) - 0.5) * 0.35;
      if (dx * dx + dy * dy > lumpy) continue;
      // flat-ish facets: quantize the light a little
      let t = ball(dx * rx, dy * ry, Math.max(rx, ry)) + (noise(px / (1.5 * s), py / (1.5 * s), seed + 3) - 0.5) * 0.3;
      if (dy < -0.35) t += 0.12;
      shape.put(px, py, tone(colors, t, px, py));
    }
  }
  shape.draw(r, mix(colors[0]!, P.ink, 0.5));
}

export function grassClump(r: Raster, x: number, y: number, s: number, seed: number, colors: readonly RGB[] = P.grass): void {
  const blades = 3 + Math.floor(hash2(0, 0, seed) * 3);
  for (let b = 0; b < blades; b++) {
    const lean = (hash2(b, 1, seed) - 0.5) * 1.6;
    const h = Math.round(s * (2 + hash2(b, 2, seed) * 2.5));
    const bx = x + Math.round((b - blades / 2) * s * 0.7);
    for (let k = 0; k < h; k++) {
      const c = k > h * 0.6 ? colors[colors.length - 2]! : k > h * 0.3 ? colors[4]! : colors[2]!;
      r.set(Math.round(bx + (lean * k) / s), y - k, c);
    }
  }
}

/* ---------- mountains ---------- */

export function peak(r: Raster, x: number, baseY: number, halfW: number, height: number, seed: number, s: number): void {
  shadow(r, x + halfW * 0.7, baseY + s, halfW * 1.3, s * 4, 0.55);
  const shape = new Shape();
  const top = baseY - height;
  const lean = (hash2(1, 2, seed) - 0.5) * halfW * 0.5;
  const snowBase = 0.3 + hash2(3, 3, seed) * 0.12;
  for (let y = Math.floor(top); y <= baseY; y++) {
    const t = (y - top) / height;
    const jl = (noise(y / (3 * s), 0.5, seed) - 0.5) * 0.5;
    const jr = (noise(0.5, y / (3 * s), seed + 1) - 0.5) * 0.5;
    const hw = halfW * Math.pow(t, 0.78);
    const ridge = x + lean * (1 - t) + (noise(y / (2 * s), 3, seed + 2) - 0.5) * s * 2 * t;
    const left = Math.floor(ridge - hw * (1 + jl));
    const right = Math.ceil(ridge + hw * (1 + jr));
    for (let px = left; px <= right; px++) {
      const lit = px < ridge;
      // gullies: ridged noise running down the slope
      const g = 1 - Math.abs(2 * noise((px - ridge) / (2.6 * s) + (y - top) / (9 * s), y / (7 * s), seed + 4) - 1);
      const across = Math.abs(px - ridge) / Math.max(1, hw);
      let shade = lit ? 0.68 - across * 0.12 : 0.34 - across * 0.06;
      shade += (g - 0.55) * 0.36 - t * 0.12;
      // emboss at texel scale for rocky grain
      const e = noise(px / (1.2 * s), y / (1.2 * s), seed + 5) - noise((px + 1) / (1.2 * s), (y + 1) / (1.2 * s), seed + 5);
      shade += e * 0.5;
      const snowLine = snowBase + g * 0.18 + (noise(px / (3 * s), 1, seed + 6) - 0.5) * 0.12;
      if (t < snowLine) shape.put(px, y, tone(P.snow, (lit ? 0.75 : 0.22) + (g - 0.5) * 0.3 + e * 0.6, px, y));
      else shape.put(px, y, tone(P.stone, shade, px, y));
    }
  }
  shape.draw(r, P.stone[0]!);
  // scree at the foot
  for (let i = 0; i < halfW * 1.2; i++) {
    const px = Math.round(x - halfW + hash2(i, 7, seed) * halfW * 2);
    const py = Math.round(baseY - s + hash2(i, 8, seed) * s * 3);
    if (r.alpha(px, py)) {
      r.set(px, py, P.stone[4]!);
      r.set(px + 1, py + 1, P.stone[1]!);
    }
  }
}

export function mine(r: Raster, x: number, y: number, s: number): void {
  const shape = new Shape();
  const w = 3 * s;
  const h = 5 * s;
  for (let py = y - h; py <= y; py++) {
    for (let px = x - w; px <= x + w; px++) {
      const frame = Math.abs(px - x) > w - s || py < y - h + s;
      shape.put(px, py, frame ? P.trunk[(px + py) % 3 === 0 ? 2 : 3]! : hex("#0c0a0c"));
    }
  }
  // a faint lamp inside
  shape.put(x, y - Math.round(h * 0.5), hex("#f2a444"));
  shape.draw(r, P.trunk[0]!);
  for (let k = 1; k < 5 * s; k++) {
    r.set(x - s, y + k, P.stone[1]!);
    r.set(x + s, y + k, P.stone[1]!);
    if (k % (2 * s) === 0) for (let px = x - s - 1; px <= x + s + 1; px++) r.set(px, y + k, P.trunk[1]!);
  }
}

/* ---------- pasture ---------- */

export function sheep(r: Raster, x: number, y: number, facing: 1 | -1, s: number, seed: number): void {
  shadow(r, x + s * 1.5, y + s * 0.5, s * 6.5, s * 2, 0.6);
  const shape = new Shape();
  const dark = hex("#2e2422");
  const legX = [-3, -1.5, 1.5, 3];
  for (const lx of legX) for (let k = 0; k < s * 2; k++) shape.put(x + lx * s, y - k, dark);
  const bx = x;
  const by = y - s * 4.5;
  const rx = s * 5.2;
  const ry = s * 3.4;
  for (let py = Math.floor(by - ry - s); py <= by + ry; py++) {
    for (let px = Math.floor(bx - rx - s); px <= bx + rx + s; px++) {
      const dx = (px + 0.5 - bx) / rx;
      const dy = (py + 0.5 - by) / ry;
      const curl = noise(px / (1.1 * s), py / (1.1 * s), seed);
      if (dx * dx + dy * dy > 1 + (curl - 0.5) * 0.5) continue;
      let t = ball(dx * rx, dy * ry, rx) + (curl - 0.5) * 0.5;
      if (dy > 0.55) t -= 0.15;
      shape.put(px, py, tone(P.wool, t + 0.12, px, py));
    }
  }
  const hx = x + facing * s * 5.5;
  const hy = y - s * 6;
  for (let py = hy - s * 1.5; py <= hy + s * 2; py++) {
    for (let px = hx - s * 1.2; px <= hx + s * 1.2; px++) shape.put(px, py, dark);
  }
  shape.put(hx - facing * s * 1.5, hy - s, dark);
  shape.put(hx - facing * s * 1.5 - facing, hy - s, dark);
  shape.put(hx + facing * Math.floor(s / 2), hy - Math.floor(s / 2), hex("#f6f0e0"));
  shape.draw(r, hex("#3a3230"));
}

export function fence(r: Raster, x: number, y: number, posts: number, s: number, dir: 1 | -1): void {
  const shape = new Shape();
  const step = 5 * s;
  for (let i = 0; i < posts; i++) {
    const px = x + i * step;
    const py = y + dir * i * s * 2;
    for (let k = 0; k < 5 * s; k++) {
      shape.put(px, py - k, P.trunk[3]!);
      shape.put(px + 1, py - k, P.trunk[2]!);
    }
    if (i < posts - 1) {
      for (let k = 0; k < step; k++) {
        const ry = Math.round((dir * k * 2) / 5);
        for (const h of [3.5, 1.8]) {
          shape.put(px + k, py - h * s + ry, P.soil[5]!);
          shape.put(px + k, py - h * s + ry + 1, P.soil[3]!);
        }
      }
    }
  }
  shadow(r, x + (posts * step) / 2 + s * 2, y + dir * posts * s + s, (posts * step) / 2 + s, s * 1.6, 0.72);
  shape.draw(r, P.trunk[0]!);
}

/* ---------- fields ---------- */

export function haystack(r: Raster, x: number, y: number, s: number, seed: number): void {
  shadow(r, x + s * 2.5, y + s * 0.5, s * 7, s * 2.2, 0.58);
  const shape = new Shape();
  const rx = s * 5.5;
  const ry = s * 7;
  for (let py = Math.floor(y - ry); py <= y; py++) {
    for (let px = Math.floor(x - rx); px <= x + rx; px++) {
      const dx = (px + 0.5 - x) / rx;
      const dy = (py + 0.5 - y) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const straw = noise(px / (0.8 * s), py / (2.5 * s), seed) - 0.5;
      const band = Math.floor((y - py) / (2.2 * s)) % 2 === 0 ? 0.06 : -0.04;
      shape.put(px, py, tone(P.gold, ball(dx * rx, dy * ry, rx) + straw * 0.45 + band + 0.05, px, py));
    }
  }
  shape.draw(r, P.gold[0]!);
}

export function scarecrow(r: Raster, x: number, y: number, s: number): void {
  shadow(r, x + s * 3, y, s * 3, s, 0.65);
  const shape = new Shape();
  for (let k = 0; k < 11 * s; k++) shape.put(x, y - k, P.trunk[2]!);
  for (let k = -3 * s; k <= 3 * s; k++) shape.put(x + k, y - 8 * s, P.trunk[2]!);
  for (let py = y - 9 * s; py <= y - 4 * s; py++) for (let px = x - s; px <= x + s; px++) shape.put(px, py, hex("#a8402a"));
  for (let py = y - 12 * s; py <= y - 10 * s; py++) for (let px = x - s; px <= x + s; px++) shape.put(px, py, P.sand[4]!);
  for (let px = x - 2 * s; px <= x + 2 * s; px++) shape.put(px, y - 12 * s, P.gold[1]!);
  shape.draw(r, P.ink);
}

/* ---------- clay pits ---------- */

export function brickStack(r: Raster, x: number, y: number, s: number): void {
  shadow(r, x + s * 3, y + s * 0.5, s * 7, s * 2.2, 0.6);
  const shape = new Shape();
  const w = 9 * s;
  const h = 6 * s;
  const left = x - Math.round(w / 2);
  const bh = Math.max(2, Math.round(1.5 * s));
  const bw = 4 * s;
  for (let py = y - h; py <= y; py++) {
    const row = Math.floor((y - py) / bh);
    for (let px = left; px < left + w; px++) {
      const mortar = (y - py) % bh === 0 || (px - left + (row % 2) * (bw / 2)) % bw === 0;
      shape.put(px, py, mortar ? P.clay[1]! : tone(P.clay, 0.62 - (px - left) / w / 4 + (hash2(px >> 2, row, 3) - 0.5) * 0.2, px, py));
    }
  }
  const depth = 2 * s;
  for (let k = 1; k <= depth; k++) {
    for (let px = left + k; px < left + w + k; px++) shape.put(px, y - h - k, P.clay[k === depth ? 6 : 5]!);
    for (let py = y - h - k + 1; py <= y - k + 1; py++) shape.put(left + w - 1 + k, py, P.clay[2]!);
  }
  shape.draw(r, P.clay[0]!);
}

export function kiln(r: Raster, x: number, y: number, s: number): void {
  shadow(r, x + s * 3, y + s, s * 8, s * 2.5, 0.58);
  const shape = new Shape();
  const rx = 6 * s;
  const ry = 7 * s;
  for (let py = Math.floor(y - ry); py <= y; py++) {
    for (let px = Math.floor(x - rx); px <= x + rx; px++) {
      const dx = (px + 0.5 - x) / rx;
      const dy = (py + 0.5 - y) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const brick = ((py >> 1) + (px >> 2)) % 5 === 0 ? -0.15 : 0;
      shape.put(px, py, tone(P.clay, ball(dx * rx, dy * ry, rx) + brick + 0.05, px, py));
    }
  }
  // glowing mouth
  for (let py = y - 3 * s; py <= y; py++) {
    for (let px = x - 2 * s; px <= x + 2 * s; px++) {
      const d = Math.hypot(px - x, (py - y) * 1.3) / (2.5 * s);
      if (d < 1) shape.put(px, py, d < 0.45 ? hex("#ffd877") : d < 0.75 ? hex("#f0a03a") : hex("#a8401a"));
    }
  }
  // chimney
  for (let py = y - ry - 3 * s; py < y - ry + s; py++) for (let px = x + s; px <= x + 2 * s; px++) shape.put(px, py, P.clay[2]!);
  shape.draw(r, P.clay[0]!);
}

/* ---------- desert ---------- */

export function cactus(r: Raster, x: number, y: number, s: number, seed: number): void {
  shadow(r, x + s * 3, y, s * 4, s * 1.5, 0.62);
  const shape = new Shape();
  // dusty sage, round in the light, ribbed
  const g = [hex("#1c2818"), hex("#2c3e24"), hex("#435634"), hex("#5e7046"), hex("#7c8c5a"), hex("#9aa676")];
  const h = Math.round((9 + hash2(1, 1, seed) * 5) * s);
  const w = Math.max(2, Math.round(1.4 * s));
  const column = (cx: number, top: number, bottom: number) => {
    for (let py = top; py <= bottom; py++) {
      for (let k = -w; k <= w; k++) {
        const round = Math.cos((k / (w + 0.5)) * 1.3);
        let t = 0.25 + round * 0.4 - (k / w) * 0.18 - ((bottom - py) < s ? 0.12 : 0);
        if (k !== 0 && Math.abs(k) % 2 === 0) t -= 0.14;
        if (hash2(cx + k, py, seed) < 0.06) t += 0.3; // a spine catching the sun
        shape.put(cx + k, py, tone(g, t, cx + k, py));
      }
    }
  };
  column(x, y - h, y);
  const armY = y - Math.round(h * 0.55);
  const ax = x - 3 * s;
  for (let k = 0; k <= 3 * s; k++) shape.put(x - k, armY, g[2]!);
  column(ax, armY - 4 * s, armY);
  if (hash2(2, 2, seed) > 0.4) {
    const by = y - Math.round(h * 0.35);
    for (let k = 0; k <= 3 * s; k++) shape.put(x + k, by, g[2]!);
    column(x + 3 * s, by - 3 * s, by);
  }
  shape.put(x, y - h - 1, hex("#e8885a"));
  shape.draw(r, g[0]!);
}

export function dryBush(r: Raster, x: number, y: number, s: number, seed: number): void {
  const c = [hex("#5a4a22"), hex("#7a6830"), hex("#9a8640"), hex("#b8a258")];
  for (let b = 0; b < 9; b++) {
    const a = -Math.PI / 2 + (hash2(b, 1, seed) - 0.5) * 2.2;
    const len = s * (3 + hash2(b, 2, seed) * 3);
    for (let k = 0; k < len; k++) r.set(Math.round(x + Math.cos(a) * k), Math.round(y + Math.sin(a) * k), c[Math.min(3, Math.floor((k / len) * 4))]!);
  }
}

export function skull(r: Raster, x: number, y: number, s: number): void {
  const shape = new Shape();
  const bone = hex("#efe6d0");
  for (let py = y - 2 * s; py <= y; py++) for (let px = x - 2 * s; px <= x + s; px++) shape.put(px, py, bone);
  shape.put(x - s, y - s, hex("#3a2a20"));
  for (let k = 1; k <= 2 * s; k++) {
    shape.put(x - 2 * s - k, y - 2 * s - Math.floor(k / 2), bone);
    shape.put(x + s + k, y - 2 * s - Math.floor(k / 2), bone);
  }
  shape.draw(r, hex("#7a6a50"));
}
