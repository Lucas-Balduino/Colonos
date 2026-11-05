/**
 * Terrain tiles in the "diorama" style: dithered ground, small props with
 * soft shadows, light from the top left. Props stay clear of the number token
 * (center) and of the corners and borders where pieces sit.
 */
import {
  CORNERS,
  CX,
  CY,
  Raster,
  TILE_H,
  TILE_W,
  bayer,
  borderLight,
  fbm,
  hex,
  hexInset,
  mix,
  noise,
  ramp,
  rng,
  scale,
  type RGB,
} from "./raster.ts";

export const P = {
  grass: ["#2c4a26", "#3d6630", "#55853a", "#74a244", "#9cbf55", "#c2d673"].map(hex),
  meadow: ["#3f6a2c", "#5a8c36", "#7aab42", "#9cc452", "#bfd86c"].map(hex),
  floor: ["#1f3320", "#2a4527", "#37592f", "#4a6f38"].map(hex),
  pine: ["#1a3020", "#24452a", "#2f5d33", "#40763c", "#5b9147"].map(hex),
  oak: ["#22401f", "#33602a", "#4c8034", "#6fa040", "#98bf50"].map(hex),
  autumn: ["#5a2414", "#8e3a1a", "#c25a22", "#e2832e", "#f2ad4c"].map(hex),
  gold: ["#5e4a14", "#957019", "#c99a24", "#e6c03a", "#f4de70"].map(hex),
  trunk: ["#2e1d12", "#4a3020", "#6b4a2e"].map(hex),
  soil: ["#3a2516", "#56391f", "#76512e", "#97703f", "#b48d55"].map(hex),
  sand: ["#9a7340", "#b98f52", "#d3ab68", "#e4c483", "#f1dca6"].map(hex),
  clay: ["#5a2216", "#7f3420", "#a3492a", "#c26438", "#d9844c", "#e9a66a"].map(hex),
  stone: ["#2e303a", "#454856", "#5f6372", "#7d8291", "#a3a8b4", "#c9cdd4"].map(hex),
  snow: ["#9fb1c2", "#cfdbe4", "#f2f6f8"].map(hex),
  wheat: ["#7d5d17", "#a8801f", "#cfa42c", "#e6c446", "#f5df7e"].map(hex),
  wool: ["#8a8478", "#c2bcae", "#e8e3d6", "#fbf8ef"].map(hex),
  water: ["#0d3550", "#134b6a", "#1b6486", "#2b7fa0", "#4ea2bf", "#8fd0de"].map(hex),
  ink: hex("#1c140e"),
};

type Spot = { x: number; y: number };

const TOKEN_R = 21;

/** True where a prop of radius `pad` can stand without hiding token, corners or roads. */
function freeSpot(x: number, y: number, pad: number, token = TOKEN_R): boolean {
  if (hexInset(x, y) < 7 + pad) return false;
  if (Math.hypot(x - CX, y - CY) < token + pad) return false;
  return CORNERS.every((c) => Math.hypot(x - c.x, y - c.y) > 15 + pad);
}

function scatter(rand: () => number, count: number, minDist: number, ok: (x: number, y: number) => boolean): Spot[] {
  const out: Spot[] = [];
  for (let tries = 0; tries < 3000 && out.length < count; tries++) {
    const x = Math.floor(rand() * TILE_W);
    const y = Math.floor(rand() * TILE_H);
    if (!ok(x, y)) continue;
    if (out.some((s) => Math.hypot(s.x - x, s.y - y) < minDist)) continue;
    out.push({ x, y });
  }
  return out.sort((a, b) => a.y - b.y);
}

function paintGround(r: Raster, paint: (x: number, y: number) => RGB): void {
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      if (hexInset(x, y) > 0) r.set(x, y, paint(x, y));
    }
  }
}

/** Raised-tile edge: dark seam, lit rim toward the light, shaded rim away from it. */
function bevel(r: Raster): void {
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const d = hexInset(x, y);
      if (d <= 0) continue;
      const light = borderLight(x, y);
      if (d < 1.2) r.tint(x, y, 0.62);
      else if (d < 3.2 && light > 0.25) {
        const c = r.get(x, y)!;
        r.set(x, y, mix(c, [255, 244, 210], d < 2.2 ? 0.28 : 0.14));
      } else if (d < 3.2 && light < -0.25) r.tint(x, y, d < 2.2 ? 0.74 : 0.86);
    }
  }
}

function inTile(x: number, y: number): boolean {
  return hexInset(x, y) > 1;
}

function shadow(r: Raster, cx: number, cy: number, rx: number, ry: number, k = 0.62): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && inTile(x, y)) r.tint(x, y, k);
    }
  }
}

/** A pixel set drawn with a dark outline around it. */
class Shape {
  private px = new Map<number, RGB>();
  put(x: number, y: number, c: RGB): void {
    this.px.set(Math.floor(y) * 1000 + Math.floor(x), c);
  }
  has(x: number, y: number): boolean {
    return this.px.has(y * 1000 + x);
  }
  draw(r: Raster, outline: RGB | null): void {
    if (outline) {
      for (const key of this.px.keys()) {
        const x = key % 1000;
        const y = Math.floor(key / 1000);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (!this.has(x + dx, y + dy) && inTile(x + dx, y + dy)) r.set(x + dx, y + dy, outline);
        }
      }
    }
    for (const [key, c] of this.px) {
      const x = key % 1000;
      const y = Math.floor(key / 1000);
      if (inTile(x, y)) r.set(x, y, c);
    }
  }
}

/** Round sphere-lit blob: light top-left, rim darkens bottom-right. */
function blobShade(dx: number, dy: number, rad: number): number {
  const nx = dx / rad;
  const ny = dy / rad;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return 0.5 + 0.55 * (-nx * 0.5 - ny * 0.7 + nz * 0.35) - 0.12;
}

/** Leafy canopy built from small round clumps, like the autumn grove. */
function canopy(shape: Shape, cx: number, cy: number, rad: number, colors: readonly RGB[], rand: () => number): void {
  const clumps: { x: number; y: number; r: number }[] = [{ x: cx, y: cy, r: rad * 0.72 }];
  const n = 6 + Math.floor(rad * 1.2);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * rad * 0.62;
    clumps.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.85, r: 1.8 + rand() * rad * 0.4 });
  }
  clumps.sort((a, b) => a.y - b.y);
  for (const c of clumps) {
    for (let y = Math.floor(c.y - c.r); y <= c.y + c.r; y++) {
      for (let x = Math.floor(c.x - c.r); x <= c.x + c.r; x++) {
        const dx = x + 0.5 - c.x;
        const dy = y + 0.5 - c.y;
        if (dx * dx + dy * dy > c.r * c.r) continue;
        const local = blobShade(dx, dy, c.r);
        const global = blobShade(x + 0.5 - cx, y + 0.5 - cy, rad * 1.1);
        shape.put(x, y, ramp(colors, local * 0.45 + global * 0.55, x, y));
      }
    }
  }
}

function tree(r: Raster, x: number, y: number, size: number, colors: readonly RGB[], rand: () => number): void {
  shadow(r, x + 2, y, size * 0.95, size * 0.42, 0.58);
  const trunk = new Shape();
  for (let ty = y - size - 1; ty <= y; ty++) {
    trunk.put(x - 1, ty, P.trunk[1]!);
    trunk.put(x, ty, P.trunk[2]!);
  }
  trunk.draw(r, P.trunk[0]!);
  const leaves = new Shape();
  canopy(leaves, x, y - size - 2, size, colors, rand);
  leaves.draw(r, mix(colors[0]!, P.ink, 0.4));
}

function bush(r: Raster, x: number, y: number, size: number, colors: readonly RGB[], rand: () => number): void {
  shadow(r, x + 1, y + 1, size + 1, size * 0.45, 0.6);
  const s = new Shape();
  canopy(s, x, y - size * 0.5, size, colors, rand);
  s.draw(r, mix(colors[0]!, P.ink, 0.4));
}

function rock(r: Raster, x: number, y: number, rad: number, colors: readonly RGB[], rand: () => number): void {
  shadow(r, x + 1, y + 1, rad + 1.5, rad * 0.55, 0.6);
  const s = new Shape();
  const sx = rad * (1 + rand() * 0.3);
  const sy = rad * 0.8;
  for (let py = Math.floor(y - sy * 1.6); py <= y; py++) {
    for (let px = Math.floor(x - sx); px <= x + sx; px++) {
      const dx = (px + 0.5 - x) / sx;
      const dy = (py + 0.5 - (y - sy * 0.7)) / sy;
      if (dx * dx + dy * dy > 1) continue;
      const t = 0.5 - dx * 0.35 - dy * 0.45 + (noise(px * 0.7, py * 0.7, 5) - 0.5) * 0.3;
      s.put(px, py, ramp(colors, t, px, py));
    }
  }
  s.draw(r, mix(colors[0]!, P.ink, 0.5));
}

function grassTuft(r: Raster, x: number, y: number, light: RGB, dark: RGB): void {
  if (!inTile(x, y) || !inTile(x, y - 2)) return;
  r.set(x, y, dark);
  r.set(x - 1, y - 1, light);
  r.set(x + 1, y - 1, light);
  r.set(x, y - 2, light);
}

/* ---------------- tiles ---------------- */

export function forest(seed = 11): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const rand = rng(seed);
  paintGround(r, (x, y) => ramp(P.floor, fbm(x / 9, y / 9, seed, 3) * 1.1 - 0.05, x, y));
  // fallen leaves
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rand() * TILE_W);
    const y = Math.floor(rand() * TILE_H);
    if (inTile(x, y)) r.set(x, y, P.autumn[2 + Math.floor(rand() * 3)]!);
  }
  const spots = scatter(rand, 30, 8.5, (x, y) => freeSpot(x, y, 1, 18) || (hexInset(x, y) > 9 && Math.hypot(x - CX, y - CY) > 20 && rand() < 0.15));
  spots.forEach((s, i) => {
    const kind = i % 5;
    const colors = kind === 1 ? P.autumn : kind === 3 ? P.gold : i % 2 ? P.oak : P.pine;
    tree(r, s.x, s.y, 5 + Math.floor(rand() * 3), colors, rand);
  });
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rand() * TILE_W);
    const y = Math.floor(rand() * TILE_H);
    if (freeSpot(x, y, 0)) {
      r.set(x, y, hex("#d84a32"));
      r.set(x, y + 1, hex("#efe2c8"));
    }
  }
  bevel(r);
  return r;
}

export function pasture(seed = 23): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const rand = rng(seed);
  paintGround(r, (x, y) => ramp(P.meadow, fbm(x / 12, y / 12, seed, 3) * 1.15 + 0.08, x, y));
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rand() * TILE_W);
    const y = Math.floor(rand() * TILE_H);
    grassTuft(r, x, y, P.meadow[4]!, P.meadow[1]!);
  }
  const flowers = [hex("#fbf8ef"), hex("#f4d84a"), hex("#e88aa8"), hex("#b8a8f0")];
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rand() * TILE_W);
    const y = Math.floor(rand() * TILE_H);
    if (inTile(x, y)) r.set(x, y, flowers[Math.floor(rand() * flowers.length)]!);
  }
  // a short fence on the left
  const fence = new Shape();
  const fx = 16;
  const fy = 44;
  for (let i = 0; i < 4; i++) {
    const px = fx + i * 5;
    const py = fy + i * 3;
    for (let k = 0; k < 5; k++) fence.put(px, py - k, P.trunk[2]!);
    if (i < 3) {
      for (let k = 0; k < 5; k++) {
        fence.put(px + k, py - 3 + Math.round((k * 3) / 5), P.soil[4]!);
        fence.put(px + k, py - 1 + Math.round((k * 3) / 5), P.soil[3]!);
      }
    }
  }
  shadow(r, fx + 9, fy + 3, 11, 3, 0.7);
  fence.draw(r, P.trunk[0]!);
  const spots = scatter(rand, 8, 12, (x, y) => freeSpot(x, y, 3) && !(x < 42 && y > 30 && y < 58));
  spots.forEach((s, i) => {
    if (i % 3 === 2) bush(r, s.x, s.y, 4, P.oak, rand);
    else sheep(r, s.x, s.y, i % 2 ? 1 : -1);
  });
  bevel(r);
  return r;
}

function sheep(r: Raster, x: number, y: number, facing: 1 | -1): void {
  shadow(r, x + 1, y + 1, 6, 2.2, 0.6);
  const s = new Shape();
  const head = hex("#34282a");
  for (const lx of [-2, 2]) {
    s.put(x + lx, y, head);
    s.put(x + lx, y - 1, head);
  }
  for (let py = y - 7; py <= y - 1; py++) {
    for (let px = x - 5; px <= x + 5; px++) {
      const dx = (px + 0.5 - x) / 5;
      const dy = (py + 0.5 - (y - 4)) / 3.4;
      if (dx * dx + dy * dy > 1) continue;
      const bump = noise(px * 0.9, py * 0.9, 77) * 0.35;
      s.put(px, py, ramp(P.wool, 0.55 - dx * 0.25 - dy * 0.45 + bump, px, py));
    }
  }
  const hx = x + facing * 5;
  for (let py = y - 6; py <= y - 3; py++) {
    s.put(hx, py, head);
    s.put(hx + facing, py, head);
  }
  s.put(hx - facing, y - 6, head);
  s.put(hx + facing, y - 5, hex("#f2ece0"));
  s.draw(r, hex("#4a4038"));
}

export function fields(seed = 37): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const rand = rng(seed);
  const crops = [P.wheat, P.gold, [...P.wheat].reverse().slice(0, 1).concat(P.wheat.slice(1))];
  paintGround(r, (x, y) => {
    // two dirt paths split the tile into three fields
    const path1 = Math.abs(y - (0.42 * x + 30) + (noise(x / 6, 0, seed) - 0.5) * 3);
    const path2 = Math.abs(x - (0.35 * y + 54) + (noise(0, y / 6, seed) - 0.5) * 3);
    if (path1 < 1.6 || (path2 < 1.6 && y > 0.42 * x + 30)) {
      return ramp(P.soil, 0.75 + (noise(x, y, 3) - 0.5) * 0.4, x, y);
    }
    const field = y < 0.42 * x + 30 ? 0 : x < 0.35 * y + 54 ? 1 : 2;
    const dir = field === 1 ? x * 0.866 - y * 0.5 : x * 0.5 + y * 0.866;
    const u = ((dir % 4) + 4) % 4;
    if (u < 1) return ramp(P.soil, 0.35 + noise(x / 3, y / 3, 9) * 0.3, x, y);
    const base = 0.35 + fbm(x / 10, y / 10, seed + field, 2) * 0.5 + (u > 2.6 ? 0.18 : 0) - (u < 1.6 ? 0.12 : 0);
    const stalk = (x + (field ? 1 : 0)) % 2 === 0 ? 0.08 : -0.04;
    const ramped = crops[field] ?? P.wheat;
    return ramp(field === 2 ? P.meadow.slice(1).map((c, i) => mix(c, P.wheat[i]!, 0.55)) : ramped, base + stalk, x, y);
  });
  const spots = scatter(rand, 3, 24, (x, y) => freeSpot(x, y, 4));
  for (const s of spots) haystack(r, s.x, s.y);
  bevel(r);
  return r;
}

function haystack(r: Raster, x: number, y: number): void {
  shadow(r, x + 2, y + 1, 7, 2.5, 0.58);
  const s = new Shape();
  for (let py = y - 9; py <= y; py++) {
    for (let px = x - 6; px <= x + 6; px++) {
      const dx = (px + 0.5 - x) / 6;
      const dy = (py + 0.5 - y) / 9;
      if (dx * dx + dy * dy > 1 || py > y) continue;
      const band = (py - y) % 3 === 0 ? -0.1 : 0;
      s.put(px, py, ramp(P.gold, 0.6 - dx * 0.35 + dy * 0.3 + band, px, py));
    }
  }
  s.draw(r, P.gold[0]!);
}

export function claypit(seed = 41): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const rand = rng(seed);
  const pits = [
    { x: 30, y: 33, rx: 15, ry: 9 },
    { x: 66, y: 80, rx: 15, ry: 9 },
  ];
  paintGround(r, (x, y) => {
    let t = 0.45 + (fbm(x / 9, y / 9, seed, 3) - 0.5) * 0.6;
    for (const p of pits) {
      const dx = (x + 0.5 - p.x) / p.rx;
      const dy = (y + 0.5 - p.y) / p.ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1) {
        const level = Math.floor((1 - d) * 3.6);
        if (level >= 3) return ramp(P.water.slice(1, 5), 0.35 + bayer(x, y) * 0.25 - dy * 0.3, x, y);
        // terraces step down; walls facing the light (lower right inside a hole) are bright
        const ring = (1 - d) * 3.6 - level;
        const wall = ring < 0.35;
        const facing = dx * 0.5 + dy * 0.85;
        t = 0.28 - level * 0.12 + (wall ? (facing > 0 ? 0.32 : -0.14) : 0) + (noise(x / 2, y / 2, 4) - 0.5) * 0.1;
        return ramp(P.clay, t, x, y);
      }
    }
    return ramp(P.clay, t + 0.15, x, y);
  });
  const spots = scatter(rand, 4, 16, (x, y) => {
    if (!freeSpot(x, y, 4)) return false;
    return pits.every((p) => Math.hypot((x - p.x) / (p.rx + 5), (y - p.y) / (p.ry + 6)) > 1);
  });
  for (const s of spots) bricks(r, s.x, s.y);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * TILE_W);
    const y = Math.floor(rand() * TILE_H);
    if (freeSpot(x, y, 0)) grassTuft(r, x, y, P.grass[3]!, P.grass[1]!);
  }
  bevel(r);
  return r;
}

function bricks(r: Raster, x: number, y: number): void {
  shadow(r, x + 2, y + 1, 7, 2.4, 0.6);
  const s = new Shape();
  const w = 9;
  const h = 6;
  const left = x - 5;
  // front face
  for (let py = y - h; py <= y; py++) {
    for (let px = left; px < left + w; px++) {
      const row = y - py;
      const mortar = row % 2 === 1 || (px - left + (Math.floor(row / 2) % 2) * 2) % 4 === 0;
      s.put(px, py, mortar ? P.clay[1]! : ramp(P.clay, 0.62 - (px - left) * 0.02, px, py));
    }
  }
  // top face, offset up and right for the 3/4 view
  for (let k = 1; k <= 2; k++) {
    for (let px = left + k; px < left + w + k; px++) s.put(px, y - h - k, P.clay[5]!);
  }
  // side face
  for (let k = 1; k <= 2; k++) {
    for (let py = y - h - k + 1; py <= y - k + 1; py++) s.put(left + w - 1 + k, py, P.clay[2]!);
  }
  s.draw(r, P.clay[0]!);
}

export function mountains(seed = 53): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const rand = rng(seed);
  paintGround(r, (x, y) => {
    const t = fbm(x / 8, y / 8, seed, 3);
    const moss = noise(x / 6, y / 6, seed + 2) > 0.66;
    return moss ? ramp(P.grass.slice(0, 4), t + 0.1, x, y) : ramp(P.stone.slice(1, 5), t * 1.1 - 0.05, x, y);
  });
  const peaks = [
    { x: 26, y: 46, w: 17, h: 28 },
    { x: 70, y: 44, w: 18, h: 30 },
    { x: 48, y: 98, w: 15, h: 16 },
  ];
  for (const p of peaks) peak(r, p.x, p.y, p.w, p.h, rand);
  mine(r, 74, 44);
  const spots = scatter(rand, 8, 9, (x, y) => freeSpot(x, y, 2) && peaks.every((p) => Math.hypot(x - p.x, y - p.y + 8) > p.w));
  for (const s of spots) rock(r, s.x, s.y, 2 + rand() * 1.5, P.stone, rand);
  bevel(r);
  return r;
}

function peak(r: Raster, px: number, baseY: number, halfW: number, height: number, rand: () => number): void {
  shadow(r, px + 4, baseY, halfW + 2, 3.5, 0.6);
  const s = new Shape();
  const top = baseY - height;
  const ridgeLean = (rand() - 0.5) * 4;
  for (let y = top; y <= baseY; y++) {
    const t = (y - top) / height;
    const jitterL = (noise(y / 2.5, 0, Math.floor(px)) - 0.5) * 4;
    const jitterR = (noise(0, y / 2.5, Math.floor(px) + 1) - 0.5) * 4;
    const hw = halfW * Math.pow(t, 0.85);
    const ridge = px + ridgeLean * (1 - t);
    for (let x = Math.floor(ridge - hw + jitterL * t); x <= ridge + hw + jitterR * t; x++) {
      const lit = x < ridge + (noise(x / 3, y / 3, 8) - 0.5) * 2;
      const crag = (noise(x / 2, y / 1.5, 31) - 0.5) * 0.35;
      const snowLine = 0.32 + (noise(x / 3, 0, 12) - 0.5) * 0.18;
      if (t < snowLine) s.put(x, y, ramp(P.snow, (lit ? 0.85 : 0.25) + crag, x, y));
      else s.put(x, y, ramp(P.stone, (lit ? 0.62 : 0.24) + crag - t * 0.12, x, y));
    }
  }
  s.draw(r, P.stone[0]!);
}

function mine(r: Raster, x: number, y: number): void {
  const s = new Shape();
  for (let py = y - 6; py <= y; py++) {
    for (let px = x - 3; px <= x + 3; px++) {
      const edge = px === x - 3 || px === x + 3 || py === y - 6;
      s.put(px, py, edge ? P.trunk[2]! : hex("#0f0b0c"));
    }
  }
  s.put(x - 4, y - 6, P.trunk[1]!);
  s.put(x + 4, y - 6, P.trunk[1]!);
  s.draw(r, P.trunk[0]!);
  // cart rails out of the mine
  for (let k = 1; k < 7; k++) {
    if (inTile(x - 2, y + k)) r.set(x - 2, y + k, P.stone[1]!);
    if (inTile(x + 2, y + k)) r.set(x + 2, y + k, P.stone[1]!);
    if (k % 2 === 0) for (let px = x - 2; px <= x + 2; px++) r.set(px, y + k, P.trunk[1]!);
  }
}

export function desert(seed = 67): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const rand = rng(seed);
  paintGround(r, (x, y) => {
    const warp = fbm(x / 14, y / 14, seed, 2) * 10;
    const ripple = Math.sin((x * 0.32 + y * 0.95 + warp) * 0.9);
    const t = 0.5 + fbm(x / 11, y / 11, seed + 4, 2) * 0.3 - 0.15 + (ripple > 0.82 ? 0.25 : ripple < -0.7 ? -0.18 : 0);
    return ramp(P.sand, t, x, y);
  });
  const spots = scatter(rand, 9, 12, (x, y) => freeSpot(x, y, 3));
  spots.forEach((s, i) => {
    if (i % 3 === 0) cactus(r, s.x, s.y);
    else if (i % 3 === 1) rock(r, s.x, s.y, 2.5 + rand() * 1.5, P.soil.slice(1), rand);
    else bush(r, s.x, s.y, 3, [hex("#4a4220"), hex("#6b6028"), hex("#8c7f36"), hex("#ad9e4c")], rand);
  });
  bevel(r);
  return r;
}

function cactus(r: Raster, x: number, y: number): void {
  shadow(r, x + 3, y, 5, 1.8, 0.62);
  const s = new Shape();
  const g = P.grass;
  for (let py = y - 11; py <= y; py++) {
    s.put(x - 1, py, g[3]!);
    s.put(x, py, g[2]!);
    s.put(x + 1, py, g[1]!);
  }
  s.put(x, y - 12, g[3]!);
  for (let k = 0; k < 4; k++) s.put(x - 3, y - 5 - k, g[3]!);
  s.put(x - 2, y - 5, g[2]!);
  for (let k = 0; k < 3; k++) s.put(x + 3, y - 7 - k, g[2]!);
  s.put(x + 2, y - 7, g[1]!);
  s.draw(r, g[0]!);
}

/** Seamless water, tiled under the whole board and drifted for motion. */
export function seaTile(size = 128, seed = 91): Raster {
  const r = new Raster(size, size);
  const period = 12;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * period;
      const v = (y / size) * period;
      const t = fbm(u, v, seed, 2, period) * 0.7 + 0.12;
      let c = ramp(P.water.slice(0, 4), t, x, y);
      const wave = noise((x / size) * 24, (y / size) * 72, seed + 5, 24);
      if (wave > 0.8) c = P.water[3]!;
      if (wave > 0.87) c = P.water[4]!;
      r.set(x, y, c);
    }
  }
  return r;
}

export function scaleUp(src: Raster, k: number): Raster {
  const r = new Raster(src.w * k, src.h * k);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const c = src.get(Math.floor(x / k), Math.floor(y / k));
      if (c) r.set(x, y, c, src.alpha(Math.floor(x / k), Math.floor(y / k)));
    }
  }
  return r;
}

export { scale };
