/**
 * Pieces on the table, made the way the robber was: small volumes painted
 * large and averaged down (see sculpt.ts). Every piece has two frames, like
 * the robber, swapped on the same slow beat: windows flicker, smoke drifts,
 * flags wave, the boat bobs.
 */
import { P } from "./palette.ts";
import { Raster, downsample, grade, hex, mix, noise, type RGB } from "./raster.ts";
import { Sculpt, decal, lit, planks, plaster, shade, shingles, solid, stones, type Material } from "./sculpt.ts";

export type Frame = 0 | 1;

const STONE = ["#26222a", "#3e3840", "#5a5258", "#786e70", "#988c88", "#b8aca2"].map(hex);
const WOOD = ["#1e140c", "#352216", "#4f341e", "#6c4a2a", "#8a6238", "#a87c48"].map(hex);
const TIMBER = ["#150e0a", "#24180f", "#382616", "#4c3420"].map(hex);
const LIME = ["#5a4834", "#80684a", "#a68c64", "#c6ae80", "#dccaa0", "#eee2c0"].map(hex);
const PARCHMENT = ["#5a4630", "#8a7250", "#b49c74", "#d2bd92", "#e8d9b0", "#f4eacb"].map(hex);
const CANVAS = ["#4e4434", "#786a52", "#a0927a", "#c2b498", "#dcd0b4"].map(hex);
const IRON = ["#121216", "#24242a", "#3c3c44"].map(hex);
const SMOKE = ["#4a4652", "#6c6874", "#908c96", "#b4b0b8", "#d0ccd2"].map(hex);
const FOAM = ["#2c5468", "#4c7a8a", "#7aa4ae", "#b4d0d2"].map(hex);

type Part = { u0: number; v0: number; u1: number; v1: number; m: Material };

/** Five steps of a player's color, from the shade under a tile to its sunlit edge. */
export function factionRamp(base: string): RGB[] {
  const c = hex(base);
  return [mix(c, P.ink, 0.72), mix(c, P.ink, 0.48), mix(c, P.ink, 0.24), c, mix(c, [255, 236, 200], 0.3)];
}

function seedOf(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h % 100000;
}

/** A lit window: wooden frame, cross bar, and a lamp somewhere inside. */
function windowLight(w: number, h: number, frame: Frame, seed: number): Material {
  const f = frame ? 0.78 : 1;
  return (u, v, _z, px, py) => {
    const edge = Math.min(u, w - u, v, h - v);
    if (edge < 0.45) return shade(TIMBER, 0.35, px, py);
    if (Math.abs(u - w / 2) < 0.22 || Math.abs(v - h * 0.55) < 0.2) return shade(TIMBER, 0.6, px, py);
    // warmest low in the pane, where the hearth is
    const heat = (1 - v / h) * 0.6 + 0.4 + (noise(u, v, seed) - 0.5) * 0.3;
    const c = mix([196, 92, 30], [255, 226, 140], Math.min(1, heat * f));
    return lit(mix(c, [120, 50, 20], 1 - f));
  };
}

function door(w: number, h: number, seed: number): Material {
  const boards = planks(WOOD.slice(0, 4), seed, 0.9, true);
  return (u, v, z, px, py) => {
    const edge = Math.min(u, w - u, h - v);
    if (edge < 0.4) return shade(TIMBER, 0.3, px, py);
    if ((Math.abs(v - h * 0.3) < 0.25 || Math.abs(v - h * 0.75) < 0.25) && u < w * 0.7) return shade(IRON, 0.7, px, py);
    if (Math.abs(u - w * 0.78) < 0.3 && Math.abs(v - h * 0.5) < 0.3) return shade(IRON, 1, px, py);
    return boards(u, v, z, px, py);
  };
}

function lanternLight(frame: Frame): Material {
  return (u, v) => {
    if (v > 0.75 * 2.6 || v < 0.15 * 2.6) return [24, 18, 14];
    return lit(frame ? [255, 190, 90] : [255, 230, 150 - u * 20]);
  };
}

/** Half-timbered wall: posts, beams and a cross brace over plaster. */
function timbered(len: number, h: number, seed: number, extra: Part[]): Material {
  const wall = plaster(LIME, seed);
  const beam = solid(TIMBER, 0.55, seed + 1);
  const bay = len > 10 ? len / 2 : len;
  const base: Material = (u, v, z, px, py) => {
    if (u < 0.75 || u > len - 0.75 || v > h - 0.8 || v < 0.55) return beam(u, v, z, px, py);
    if (len > 10 && Math.abs(u - len / 2) < 0.4) return beam(u, v, z, px, py);
    // a brace in the first bay
    if (u < bay && Math.abs((u - 0.75) / (bay - 1.5) - (v - 0.55) / (h - 1.35)) < 0.07) return beam(u, v, z, px, py);
    return wall(u, v, z, px, py);
  };
  return decal(base, extra);
}

interface HouseSpec {
  x: number;
  y: number;
  len: number;
  depth: number;
  footing: number;
  wall: number;
  pitch: number;
  roof: RGB[];
  seed: number;
  /** Openings on the long, sunlit wall. */
  front: Part[];
  /** Openings on the gable end. */
  side: Part[];
  /** Drawn behind the front slope of the roof (chimneys). */
  behindRoof?: (s: Sculpt) => void;
}

/** A cottage with its ridge along x: footing, timbered walls, gable and roof. */
function house(s: Sculpt, h: HouseSpec): void {
  const { x, y, len, depth, footing, wall, pitch } = h;
  const top = footing + wall;
  s.box([x, y, 0], [len, depth, footing], { left: stones(STONE, h.seed), right: stones(STONE, h.seed + 1) });
  s.box([x, y, footing], [len, depth, wall], {
    left: timbered(len, wall, h.seed + 2, h.front),
    right: timbered(depth, wall, h.seed + 3, h.side),
  });
  // gable end, plastered, with a beam across its foot
  const gable = plaster(LIME, h.seed + 4);
  const gbeam = solid(TIMBER, 0.5, h.seed + 5);
  s.face([x + len, y, top], [0, depth, 0], [0, depth / 2, pitch], (u, v, z, px, py) => (z < top + 0.7 ? gbeam(u, v, z, px, py) : gable(u, v, z, px, py)), {
    tri: true,
  });
  h.behindRoof?.(s);
  const eave = 0.9;
  const mid = y + depth / 2;
  const run = depth / 2 + eave;
  const drop = (eave * pitch) / (depth / 2);
  // front slope, from the eave up to the ridge
  s.face([x - 0.9, y + depth + eave, top - drop], [len + 1.8, 0, 0], [0, -run, pitch + drop], shingles(h.roof, h.seed + 6));
  // barge boards on the gable end, and the ridge cap
  const barge = solid(TIMBER, 0.45, h.seed + 7);
  s.face([x + len + 0.9, y + depth + eave, top - drop], [0, -run, pitch + drop], [0, 0, -0.9], barge);
  s.face([x + len + 0.9, mid, top + pitch], [0, -run, -(pitch + drop)], [0, 0, -0.9], barge);
  const cap = h.roof.slice(0, 3);
  s.box([x - 0.9, mid - 0.45, top + pitch - 0.3], [len + 1.8, 0.9, 0.7], { top: solid(cap, 0.6, h.seed + 8), left: solid(cap, 0.4, h.seed + 8), right: barge });
}

function chimney(s: Sculpt, x: number, y: number, z0: number, z1: number, seed: number): void {
  s.box([x, y, z0], [2, 2, z1 - z0], { left: stones(STONE, seed, 1.6), right: stones(STONE, seed + 1, 1.6) });
  s.box([x - 0.3, y - 0.3, z1], [2.6, 2.6, 0.8], {
    left: solid(STONE, 0.3, seed),
    right: solid(STONE, 0.2, seed),
    top: (u, v, _z, px, py) => (u > 0.7 && u < 1.9 && v > 0.7 && v < 1.9 ? [16, 12, 12] : shade(STONE, 0.55, px, py)),
  });
}

function smoke(s: Sculpt, from: [number, number], frame: Frame, seed: number): void {
  const puffs = frame
    ? [
        [0.8, -3, 1.8],
        [2.4, -6.4, 2.2],
        [4.4, -9.8, 1.7],
      ]
    : [
        [0.3, -2.6, 1.7],
        [1.6, -5.8, 2.3],
        [3.4, -9.2, 1.9],
      ];
  puffs.forEach(([dx, dy, r], i) => {
    s.blob(from[0] + dx!, from[1] + dy!, r!, (ox, oy, px, py) => {
      const t = 0.7 - (ox + oy) / (r! * 2.4) + (noise(px / 3, py / 3, seed + i) - 0.5) * 0.3 - i * 0.08;
      return shade(SMOKE, t, px, py);
    });
  });
}

/** Footprint center sits this many pixels above the bottom of the canvas. */
const FOOT = 8;

export const PIECE_SIZE = {
  settlement: { w: 42, h: 56 },
  city: { w: 54, h: 70 },
};

/** Anchor (0..1) of each piece's footprint center, for the board. */
export const PIECE_ANCHOR = {
  settlement: { x: 0.5, y: (PIECE_SIZE.settlement.h - FOOT) / PIECE_SIZE.settlement.h },
  city: { x: 0.5, y: (PIECE_SIZE.city.h - FOOT) / PIECE_SIZE.city.h },
};

function sculptFor(W: number, H: number, cx: number, cy: number): Sculpt {
  // the footprint's center lands on the anchor
  return new Sculpt(W, H, W / 2 - (cx - cy), H - FOOT - (cx + cy) / 2);
}

export function settlement(color: string, frame: Frame = 0): Raster {
  const { w: W, h: H } = PIECE_SIZE.settlement;
  const seed = seedOf(color);
  const s = sculptFor(W, H, 7.5, 5.5);
  house(s, {
    x: 0,
    y: 0,
    len: 15,
    depth: 11,
    footing: 2.4,
    wall: 8.4,
    pitch: 7,
    roof: factionRamp(color),
    seed,
    front: [
      { u0: 2.4, v0: 0, u1: 5.4, v1: 5.6, m: door(3, 5.6, seed) },
      { u0: 5.9, v0: 3, u1: 6.7, v1: 5.6, m: lanternLight(frame) },
      { u0: 9, v0: 2, u1: 12.4, v1: 5.6, m: windowLight(3.4, 3.6, frame, seed) },
    ],
    side: [{ u0: 3.6, v0: 2.2, u1: 7, v1: 5.6, m: windowLight(3.4, 3.4, frame ? 0 : 1, seed + 1) }],
    behindRoof: (sc) => chimney(sc, 10, 1.6, 13, 21, seed + 20),
  });
  smoke(s, s.at([11, 2.6, 22]), frame, seed);
  return s.finish(seed);
}

export function city(color: string, frame: Frame = 0): Raster {
  const { w: W, h: H } = PIECE_SIZE.city;
  const seed = seedOf(color) + 31;
  const roof = factionRamp(color);
  // footprint: the keep at the back right, the hall in front
  const s = sculptFor(W, H, 8.5, 9);
  const tx = 8;
  const ty = 0;
  const T = 10;
  const TH = 24;
  const slit = windowLight(1.6, 3, frame, seed);
  const banner: Material = (u, v, _z, px, py) => {
    // hangs from a rod and ends in a swallowtail
    if (v > 7.2) return shade(TIMBER, 0.5, px, py);
    if (v < Math.abs(u - 1.2) * 1.4) return null;
    const fold = Math.sin(u * 3 + (frame ? 1.4 : 0)) * 0.18;
    if (Math.abs(v - 4.6) < 0.6 && Math.abs(u - 1.2) < 0.6) return lit(mix(PARCHMENT[4]!, [255, 210, 120], 0.3));
    return shade(roof, 0.55 + fold + (noise(u, v, seed) - 0.5) * 0.2, px, py);
  };
  const keepFront = decal(stones(STONE, seed), [
    { u0: 5.6, v0: 8.6, u1: 7.2, v1: 11.6, m: slit },
    { u0: 5.6, v0: 15.6, u1: 7.2, v1: 18.6, m: slit },
    { u0: 1.2, v0: 10.5, u1: 3.6, v1: 19.2, m: banner },
  ]);
  const keepSide = decal(stones(STONE, seed + 1), [
    { u0: 2.2, v0: 12.6, u1: 3.8, v1: 15.6, m: slit },
    { u0: 5.4, v0: 10.5, u1: 7.8, v1: 19.2, m: banner },
  ]);
  s.box([tx, ty, 0], [T, T, TH], { left: keepFront, right: keepSide });
  // corbelled parapet
  s.box([tx - 0.5, ty - 0.5, TH], [T + 1, T + 1, 1.6], { left: stones(STONE.slice(0, 5), seed + 2, 0.8), right: stones(STONE.slice(0, 5), seed + 3, 0.8) });
  // pointed roof in the player's color
  const z0 = TH + 1.6;
  const apex = [tx + T / 2, ty + T / 2, z0 + 11] as const;
  const b2 = [tx + T + 0.8, ty - 0.8, z0 - 0.4] as const;
  const b3 = [tx + T + 0.8, ty + T + 0.8, z0 - 0.4] as const;
  const b4 = [tx - 0.8, ty + T + 0.8, z0 - 0.4] as const;
  const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!] as const;
  s.face(b2, sub(b3, b2), sub(apex, b2), shingles(roof, seed + 4, 1.8, 2.2), { tri: true });
  s.face(b4, sub(b3, b4), sub(apex, b4), shingles(roof, seed + 5, 1.8, 2.2), { tri: true });
  // pole and flag
  s.box([apex[0] - 0.3, apex[1] - 0.3, apex[2] - 1], [0.6, 0.6, 7], { left: solid(TIMBER, 0.6, seed), right: solid(TIMBER, 0.3, seed) });
  const wave = frame ? 1.6 : 0;
  s.face([apex[0] + 0.3, apex[1] + 0.3, apex[2] + 5.8], [5, 0, 0], [0, 0, -3], (u, v, _z, px, py) => {
    const sway = Math.sin(u * 1.3 + wave) * 0.45;
    if (v < sway || v > 3 + sway - u * 0.12 || (u > 4.2 && Math.abs(v - 1.5) < (u - 4.2) * 0.9)) return null;
    return shade(roof, 0.55 + Math.cos(u * 1.3 + wave) * 0.22 + (noise(u, v, seed) - 0.5) * 0.15, px, py);
  });

  house(s, {
    x: 0,
    y: 10,
    len: 14,
    depth: 8,
    footing: 2.5,
    wall: 7,
    pitch: 5.5,
    roof,
    seed: seed + 40,
    front: [
      { u0: 1.8, v0: 1.6, u1: 4.2, v1: 4.4, m: windowLight(2.4, 2.8, frame, seed + 2) },
      { u0: 5.6, v0: 0, u1: 8.6, v1: 5.2, m: door(3, 5.2, seed + 3) },
      { u0: 9.1, v0: 2.6, u1: 9.8, v1: 5.2, m: lanternLight(frame) },
      { u0: 10.2, v0: 1.6, u1: 12.6, v1: 4.4, m: windowLight(2.4, 2.8, frame ? 0 : 1, seed + 4) },
    ],
    side: [{ u0: 2.8, v0: 1.8, u1: 5.2, v1: 4.4, m: windowLight(2.4, 2.6, frame, seed + 5) }],
  });
  return s.finish(seed);
}

/** A see-through parchment version of a piece, for build previews. */
export function ghost(src: Raster): Raster {
  const r = new Raster(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.alpha(x, y) < 200) continue;
      const c = src.get(x, y)!;
      const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      r.set(x, y, mix(hex("#6e5e46"), hex("#fbf4e0"), Math.min(1, lum * 1.6)));
    }
  }
  return r;
}

export const TOKEN_SIZE = { w: 32, h: 34 };

/** Number token: a thick wooden disc with a parchment face. */
export function token(): Raster {
  const { w: W, h: H } = TOKEN_SIZE;
  const s = new Sculpt(W, H, 0, 0);
  const cx = W / 2;
  const cy = 15.5;
  const R = 15.2;
  // the edge of the disc, seen below its face
  s.blob(cx, cy + 2.2, R, (dx, dy, px, py) => shade(WOOD, 0.3 - dx / (R * 4) + (noise(Math.atan2(dy, dx) * 8, 0, 3) - 0.5) * 0.3, px, py));
  s.blob(cx, cy, R, (dx, dy, px, py) => {
    const d = Math.hypot(dx, dy);
    const lightSide = -(dx * 0.6 + dy * 0.8) / R;
    if (d > R - 3.2) {
      // the rim: turned wood with its grain running round
      const ring = noise(Math.atan2(dy, dx) * 5, d * 1.4, 11) - 0.5;
      let t = 0.5 + lightSide * 0.3 + ring * 0.35;
      if (d > R - 0.9) t -= 0.18;
      if (d < R - 2.6) t -= 0.25;
      return shade(WOOD, t, px, py);
    }
    // the face sits below the rim, which shades its upper left edge
    let t = 0.74 + (noise(dx / 3, dy / 3, 5) - 0.5) * 0.25 + (noise(dx * 1.2, dy * 0.4, 6) - 0.5) * 0.12;
    if (d > R - 5) t += lightSide < 0 ? 0.08 : -0.22 * (1 - (R - 3.2 - d) / 1.8);
    if (noise(dx / 5, dy / 5, 7) > 0.7) t -= 0.18; // an old stain
    return shade(PARCHMENT, t, px, py);
  });
  return s.finish(41, 0.35);
}

function crate(seed: number): Material {
  const boards = planks(WOOD.slice(1), seed, 1.05);
  return (u, v, z, px, py) => {
    if (u < 0.4 || u > 2.8 || v < 0.35 || v > 2.85) return shade(WOOD, 0.2, px, py);
    if (Math.abs(u - v * 0.95) < 0.35) return shade(WOOD, 0.62, px, py);
    return boards(u, v, z, px, py);
  };
}

/** Rings of foam where something stands in the water. */
function ripples(s: Sculpt, at: Array<[number, number]>, frame: Frame, seed: number, rx = 2.4): void {
  at.forEach(([x, y], i) => {
    const [cx, cy] = s.at([x + 0.7, y + 0.7, 0]);
    const r = rx + (frame ? 0.5 : 0);
    s.blob(cx, cy, r, (dx, dy, px, py) => {
      const d = Math.hypot(dx, dy * 2.1);
      if (d > r || d < r - 0.9) return null;
      if (noise(Math.atan2(dy, dx) * 3, frame, seed + i) < 0.4) return null;
      return shade(FOAM, 0.55 - dy * 0.2, px, py);
    });
  });
}

/** General harbor: a jetty on stilts with a crate, rope and a lantern. */
export function pier(frame: Frame = 0): Raster {
  const W = 52;
  const H = 46;
  const s = new Sculpt(W, H, W / 2, H / 2 + 5);
  const seed = 71;
  const post = (x: number, y: number) =>
    s.box([x, y, -3], [1.7, 1.7, 7.8], { left: planks(WOOD.slice(0, 4), seed + x, 0.8, true), right: solid(WOOD.slice(0, 3), 0.35, seed + y) });
  ripples(s, [[-11.5, -4.8], [10, -4.8], [-11.5, 4.2], [10, 4.2]], frame, seed, 2.8);
  post(-11.5, -4.8);
  post(10, -4.8);
  s.box([-12.8, -4.6, 2.4], [24.6, 9.6, 1.1], { left: solid(WOOD.slice(0, 4), 0.3, seed), right: solid(WOOD.slice(0, 4), 0.2, seed + 1), top: planks(WOOD, seed + 2, 1.7, true) });
  post(-11.5, 4.2);
  post(10, 4.2);
  // crate and a coil of rope
  s.box([-9.4, -3.8, 3.5], [4, 4, 4], { left: crate(seed + 3), right: crate(seed + 4), top: planks(WOOD.slice(1), seed + 5, 1.3) });
  const [rx, ry] = s.at([-2, 1.8, 3.5]);
  s.blob(rx, ry - 0.7, 2.3, (dx, dy, px, py) => {
    const d = Math.hypot(dx, dy * 1.6);
    if (d > 2.3) return null;
    if (d < 0.8) return shade(WOOD, 0.1, px, py);
    return shade(LIME, 0.35 + Math.sin(d * 6) * 0.15 - (dx + dy) * 0.08, px, py);
  });
  // lantern post at the end
  s.box([7.6, 2.4, 3.5], [1, 1, 11.5], { left: solid(TIMBER, 0.6, seed), right: solid(TIMBER, 0.3, seed) });
  s.box([8.5, 2.5, 14.4], [2.6, 0.7, 0.6], { left: solid(TIMBER, 0.5, seed), top: solid(TIMBER, 0.6, seed) });
  s.box([9.6, 1.9, 10.4], [2.2, 2.2, 3.4], { left: lanternLight(frame), right: lanternLight(frame) });
  s.box([9.2, 1.5, 13.8], [3, 3, 0.6], { left: solid(IRON, 0.6, seed), right: solid(IRON, 0.3, seed), top: solid(IRON, 0.8, seed) });
  return s.finish(seed);
}

/** Specific harbor: a fishing boat at anchor, rocking between frames. */
export function boat(frame: Frame = 0): Raster {
  const W = 54;
  const H = 54;
  const seed = 83;
  const s = new Sculpt(W, H, W / 2, H / 2 + 10 + frame);
  const L = 13.5;
  const B = 4.2;
  const keel = (u: number, len: number) => 2.8 * ((2 * u) / len - 1) ** 4;
  const hullPlanks = planks(WOOD, seed, 1.1);
  const stripe = solid(["#2a3a46", "#3c5262", "#56707e"].map(hex), 0.5, seed);
  const hull =
    (len: number): Material =>
    (u, v, z, px, py) => {
      if (v < keel(u, len)) return null;
      if (v > 4.4) return shade(WOOD, 0.75, px, py);
      if (v > 3.3 && v < 4) return stripe(u, v, z, px, py);
      return hullPlanks(u, v, z, px, py);
    };
  ripples(s, [[-7, 3.2], [3, 3.2], [11, 1.2]], frame, seed, 3.8);
  // far wall inside, the floor and a thwart, then the near side
  s.face([-L, -B, 1.8], [2 * L, 0, 0], [0, 0, 3.4], planks(WOOD.slice(0, 4), seed + 1, 1), { light: 0.5 });
  s.face([-L, -B, 1.8], [2 * L, 0, 0], [0, 2 * B, 0], planks(WOOD.slice(0, 4), seed + 2, 1.2, true), { light: 0.55 });
  s.box([-3.5, -B, 3], [1.8, 2 * B, 0.7], { top: solid(WOOD, 0.6, seed), left: solid(WOOD, 0.3, seed) });
  s.face([-L, B, 0], [2 * L, 0, 0], [0, 0, 5.2], hull(2 * L));
  // the bow comes to a point
  s.face([L, B, 0], [4.2, -B, 0], [0, 0, 5.8], (u, v, z, px, py) => (v < 1.6 + u * 0.3 ? null : hull(7)(u + 3.5, v, z, px, py)));
  s.face([L, -B, 5.2], [0, 2 * B, 0], [4.2, B, 0.5], solid(WOOD, 0.7, seed), { tri: true });
  // mast, boom and a patched sail
  s.box([-0.6, -0.5, 1.8], [1, 1, 25], { left: solid(WOOD, 0.6, seed + 3), right: solid(WOOD, 0.3, seed + 3) });
  const clew = frame ? 11.6 : 11;
  s.box([-clew, -0.3, 7.6], [clew, 0.7, 0.7], { left: solid(WOOD, 0.55, seed + 4), top: solid(WOOD, 0.7, seed + 4) });
  const patch = ["#5a2a1c", "#7e3c24", "#9c5430"].map(hex);
  s.face(
    [-0.4, 0.6, 8.3],
    [-clew, frame ? 0.5 : 0, 0],
    [0, 0, 17.5],
    (u, v, _z, px, py) => {
      // a triangle from the boom up the mast, bellied by the wind
      const belly = Math.sin((u / clew) * Math.PI) * (frame ? 0.18 : 0.12);
      let t = 0.62 - (u / clew) * 0.18 + belly + (noise(u / 2, v / 2, seed + 5) - 0.5) * 0.18;
      if (Math.abs(v % 3.2) < 0.25) t -= 0.18; // seams
      if (u > 3 && u < 5.6 && v > 3.4 && v < 6.6) return shade(patch, 0.5 + belly, px, py);
      return shade(CANVAS, t, px, py);
    },
    { tri: true, light: 0.95 },
  );
  // a lamp on the stern
  s.box([-L + 0.4, -0.3, 5.2], [0.6, 0.6, 3.4], { left: solid(TIMBER, 0.5, seed) });
  s.box([-L, -0.7, 8.4], [1.6, 1.6, 2.4], { left: lanternLight(frame), right: lanternLight(frame) });
  return s.finish(seed);
}

export const ROAD_TILE = { w: 12, h: 10 };

/**
 * A repeating strip of plank road seen from above: boards across, rails in
 * the owner's color, a shadow under the far side. Tiles along x.
 */
export function roadTile(color: string): Raster {
  const { w: W, h: H } = ROAD_TILE;
  const K = 4;
  const hi = new Raster(W * K, H * K);
  const rail = factionRamp(color);
  const seed = seedOf(color);
  for (let y = 0; y < H * K; y++) {
    for (let x = 0; x < W * K; x++) {
      const fx = (x + 0.5) / K;
      const fy = (y + 0.5) / K;
      if (fy < 1) continue;
      if (fy > 9) {
        hi.set(x, y, [10, 8, 6], 120);
        continue;
      }
      let c: RGB;
      if (fy < 2.4 || fy > 7.6) {
        // rails: lit along the top, shaded along the bottom, nailed at each board
        const top = fy < 2.4;
        let t = top ? 0.72 - (fy - 1) * 0.12 : 0.42 - (fy - 7.6) * 0.18;
        if (Math.abs((fx % 3) - 1.5) < 0.35 && Math.abs(fy - (top ? 1.7 : 8.3)) < 0.35) t = 0.08;
        c = shade(rail, t + (noise(fx * 2, fy, seed) - 0.5) * 0.2, x, y);
      } else {
        const board = Math.floor(fx / 3);
        const f = fx / 3 - board;
        if (f < 0.12) c = shade(WOOD, 0.04, x, y);
        else {
          let t = 0.52 + (((board * 2654435761) >>> 0) % 7) / 7 * 0.25 - 0.12 + (noise(board * 5.3, fy * 1.6, seed + 1) - 0.5) * 0.4;
          if (f > 0.82) t -= 0.14;
          if (fy < 3.1) t -= 0.2; // under the rail's lip
          c = shade(WOOD, t, x, y);
        }
      }
      hi.set(x, y, c);
    }
  }
  const out = downsample(hi, K);
  grade(out, seed, 0.4);
  return out;
}
