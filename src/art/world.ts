/**
 * Paints the whole island as one picture: biomes bleed into each other along
 * wobbly borders, the coast follows its own outline with a beach, the earth
 * shows under the south shore, and trees or peaks may lean over their
 * neighbors. Game geometry still uses exact hexes; only the paint is loose.
 */
import { HEX_DIRS, hexCorner, pointyHexToPixel } from "../core/hex.ts";
import type { Board, Terrain } from "../core/types.ts";
import { P } from "./palette.ts";
import {
  brickStack,
  bush,
  cactus,
  dryBush,
  fence,
  grassClump,
  haystack,
  kiln,
  mine,
  peak,
  rock,
  scarecrow,
  sheep,
  skull,
  tree,
  TREE_KINDS,
} from "./props.ts";
import { Raster, bayer, downsample, fbm, grade, hash2, mix, noise, tone, type RGB } from "./raster.ts";

const HEX = 56;
const SQ3 = Math.sqrt(3);
/** How far the earth shows below the south shore, in world pixels. */
export const CLIFF_DEPTH = 18;

export interface IslandArt {
  raster: Raster;
  /** World position of texel (0, 0). */
  x: number;
  y: number;
  /** Texels per world pixel. */
  scale: number;
}

interface Cell {
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: Terrain;
  seed: number;
  /** Clay pits or ponds, in world coordinates. */
  holes: Array<{ x: number; y: number; rx: number; ry: number }>;
  /** Field row direction. */
  rowAngle: number;
}

function axialRound(x: number, y: number): { q: number; r: number } {
  const qf = ((SQ3 / 3) * x - y / 3) / HEX;
  const rf = ((2 / 3) * y) / HEX;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** Distance from a point to its own hex border (world px), and the nearest edge. */
function inset(dx: number, dy: number): { d: number; edge: number } {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const side = (SQ3 / 2) * HEX - ax;
  const slant = ((HEX - ay) * SQ3) / 2 - ax / 2;
  let edge = Math.round(Math.atan2(dy, dx) / (Math.PI / 3));
  edge = ((edge % 6) + 6) % 6;
  return { d: Math.min(side, slant), edge };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

function boardSeed(board: Board): number {
  let h = 2166136261;
  for (const hex of Object.values(board.hexes)) {
    for (const ch of `${hex.id}${hex.terrain}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}

/* ---------- ground ---------- */

function emboss(tx: number, ty: number, scale: number, seed: number): number {
  return noise(tx / scale, ty / scale, seed) - noise((tx + 1) / scale, (ty + 1) / scale, seed);
}

function meadow(wx: number, wy: number, tx: number, ty: number, seed: number, lush: number): RGB {
  const base = fbm(wx / 26, wy / 26, seed, 3);
  const blades = noise(tx / 1.6, ty / 1.1, seed + 1);
  let t = 0.2 + base * 0.5 + (blades - 0.5) * 0.62 + lush;
  if (blades > 0.78) t += 0.12;
  const litterMask = fbm(wx / 18, wy / 18, seed + 2, 2);
  if (litterMask > 0.6 && hash2(tx, ty, seed) < (litterMask - 0.6) * 2.2) return tone(P.litter, hash2(ty, tx, seed), tx, ty);
  const h = hash2(tx, ty, seed + 5);
  if (h < 0.0035) return P.flowers[Math.floor(hash2(tx, ty, 9) * P.flowers.length)]!;
  return tone(P.grass, t, tx, ty);
}

function forestFloor(wx: number, wy: number, tx: number, ty: number, seed: number): RGB {
  const m = fbm(wx / 14, wy / 14, seed + 2, 2);
  if (hash2(tx, ty, seed) < 0.18 + m * 0.35) return tone(P.litter, hash2(ty, tx, seed) * 0.9, tx, ty);
  const t = fbm(wx / 12, wy / 12, seed, 2) * 0.8 + (noise(tx / 1.5, ty / 1.2, seed + 1) - 0.5) * 0.5;
  return tone(P.forestFloor, t + 0.15, tx, ty);
}

function field(cell: Cell, wx: number, wy: number, tx: number, ty: number, d: number, _s: number): RGB {
  // grassy headland round every field
  if (d < 5 + (noise(wx / 6, wy / 6, cell.seed) - 0.5) * 4) return meadow(wx, wy, tx, ty, cell.seed, 0.08);
  const ca = Math.cos(cell.rowAngle);
  const sa = Math.sin(cell.rowAngle);
  const u = (wx - cell.x) * ca + (wy - cell.y) * sa;
  const v = -(wx - cell.x) * sa + (wy - cell.y) * ca;
  // the field is split into strips of different ripeness
  const strip = Math.floor((v + 200 + (noise(u / 20, 0, cell.seed) - 0.5) * 6) / 22);
  const roll = hash2(strip, 7, cell.seed);
  const kind = roll < 0.12 ? 3 : Math.floor(roll * 3);
  // rows wander a little, like ones sown by hand
  const uu = u + (noise(v / 11, u / 40, cell.seed + 5) - 0.5) * 3.2;
  const across = (((uu % 4.4) + 4.4) % 4.4) / 4.4;
  if (across < 0.2) return tone(P.soil, 0.18 + noise(tx / 2, ty / 2, 4) * 0.35, tx, ty);
  // each row bulges toward the light, heads catch it, wind combs the field
  const bulge = Math.sin(((across - 0.2) / 0.8) * Math.PI);
  const heads = noise(tx / 1.3, ty / 1.3, cell.seed + strip) - 0.5;
  const wind = fbm(wx / 28 + wy / 70, wy / 28, cell.seed + 9, 2) - 0.5;
  const lit = across < 0.45 ? 0.1 : across > 0.85 ? -0.14 : 0;
  if (kind === 3) return tone(P.stubble, 0.45 + heads * 0.6 + lit + bulge * 0.1, tx, ty);
  const base = 0.4 + fbm(wx / 14, wy / 14, cell.seed + 2, 2) * 0.3 + (kind === 1 ? 0.12 : kind === 2 ? -0.08 : 0);
  return tone(P.wheat, base + bulge * 0.18 + heads * 0.55 + wind * 0.35 + lit, tx, ty);
}

function clayGround(cell: Cell, wx: number, wy: number, tx: number, ty: number, s: number): RGB {
  for (const h of cell.holes) {
    const dx = (wx - h.x) / h.rx;
    const dy = (wy - h.y) / h.ry;
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd >= 1) continue;
    const steps = 3.4;
    const level = Math.floor((1 - dd) * steps);
    if (level >= 3) return tone(P.water.slice(1, 5), 0.3 + bayer(tx, ty) * 0.3 - dy * 0.35, tx, ty);
    const frac = (1 - dd) * steps - level;
    const wall = frac < 0.4;
    const facing = dx * 0.55 + dy * 0.85;
    let t = 0.45 - level * 0.12 + (wall ? (facing > 0 ? 0.3 : -0.2) : 0);
    t += emboss(tx, ty, 1.6 * s, 3) * 0.6;
    return tone(P.clay, t, tx, ty);
  }
  const base = fbm(wx / 16, wy / 16, cell.seed, 3);
  let t = 0.38 + base * 0.4 + emboss(tx, ty, 2.2 * s, cell.seed + 1) * 0.9;
  if (hash2(tx, ty, cell.seed) < 0.04) t += 0.25;
  // tufts of grass hang on in the clay
  const tuft = noise(wx / 7, wy / 7, cell.seed + 3);
  if (tuft > 0.72 && noise(tx / 1.4, ty / 1.1, 5) > 0.5) return tone(P.grass, 0.35 + (tuft - 0.72) * 2, tx, ty);
  return tone(P.clay, t, tx, ty);
}

function rockGround(cell: Cell, wx: number, wy: number, tx: number, ty: number, s: number): RGB {
  const moss = fbm(wx / 15, wy / 15, cell.seed + 1, 2);
  const crack = 1 - Math.abs(2 * noise(wx / 9, wy / 9, cell.seed + 2) - 1);
  let t = 0.35 + fbm(wx / 10, wy / 10, cell.seed, 2) * 0.3 + emboss(tx, ty, 1.8 * s, cell.seed + 3) * 0.9;
  if (crack > 0.93) t -= 0.3;
  if (moss > 0.58) return tone(P.grass, 0.15 + (moss - 0.58) * 1.2 + (noise(tx / 1.5, ty / 1.2, 3) - 0.5) * 0.5, tx, ty);
  if (hash2(tx, ty, cell.seed) < 0.025) return P.stone[5]!;
  return tone(P.stone.slice(1), t, tx, ty);
}

function sandGround(wx: number, wy: number, tx: number, ty: number, seed: number, s: number): RGB {
  const warp = fbm(wx / 18, wy / 18, seed, 2) * 12;
  const ripple = Math.sin((wx * 0.36 + wy * 0.9 + warp) * 0.85);
  let t = 0.45 + fbm(wx / 14, wy / 14, seed + 4, 2) * 0.3 + (ripple > 0.8 ? 0.2 : ripple < -0.65 ? -0.16 : 0);
  t += emboss(tx, ty, 1.5 * s, seed + 6) * 0.35;
  if (hash2(tx, ty, seed) < 0.01) t -= 0.35;
  return tone(P.sand, t, tx, ty);
}

function ground(cell: Cell, wx: number, wy: number, tx: number, ty: number, d: number, s: number): RGB {
  switch (cell.terrain) {
    case "wood":
      return forestFloor(wx, wy, tx, ty, cell.seed);
    case "sheep":
      return meadow(wx, wy, tx, ty, cell.seed, 0.12);
    case "wheat":
      return field(cell, wx, wy, tx, ty, d, s);
    case "brick":
      return clayGround(cell, wx, wy, tx, ty, s);
    case "ore":
      return rockGround(cell, wx, wy, tx, ty, s);
    default:
      return sandGround(wx, wy, tx, ty, cell.seed, s);
  }
}

/* ---------- the island ---------- */

export function paintIsland(board: Board, s = 2): IslandArt {
  const seed = boardSeed(board);
  const cells = new Map<string, Cell>();
  for (const h of Object.values(board.hexes)) {
    const p = pointyHexToPixel(h, HEX);
    const cs = (seed ^ Math.imul(h.q + 50, 73856093) ^ Math.imul(h.r + 50, 19349663)) >>> 0;
    const cell: Cell = { q: h.q, r: h.r, x: p.x, y: p.y, terrain: h.terrain, seed: cs % 100000, holes: [], rowAngle: 0 };
    if (h.terrain === "brick") {
      const a = hash2(1, 1, cs) * Math.PI * 2;
      cell.holes.push({ x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 26, rx: 14, ry: 9 });
      cell.holes.push({ x: p.x + Math.cos(a + 2.6) * 31, y: p.y + Math.sin(a + 2.6) * 25, rx: 11, ry: 7 });
    }
    cell.rowAngle = (Math.floor(hash2(2, 2, cs) * 3) * Math.PI) / 3 + Math.PI / 6;
    cells.set(`${h.q},${h.r}`, cell);
  }
  const cellAt = (q: number, r: number) => cells.get(`${q},${r}`);

  // coast segments, for a smooth shoreline
  const coast: Array<{ ax: number; ay: number; bx: number; by: number; cell: Cell }> = [];
  for (const c of cells.values()) {
    for (let i = 0; i < 6; i++) {
      if (cellAt(c.q + HEX_DIRS[i]!.q, c.r + HEX_DIRS[i]!.r)) continue;
      const a = hexCorner(c, HEX, i);
      const b = hexCorner(c, HEX, (i + 1) % 6);
      coast.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, cell: c });
    }
  }

  const xs = [...cells.values()].map((c) => c.x);
  const ys = [...cells.values()].map((c) => c.y);
  const minX = Math.floor(Math.min(...xs) - HEX - 30);
  const maxX = Math.ceil(Math.max(...xs) + HEX + 30);
  const minY = Math.floor(Math.min(...ys) - HEX - 56);
  const maxY = Math.ceil(Math.max(...ys) + HEX + CLIFF_DEPTH + 26);
  const W = (maxX - minX) * s;
  const H = (maxY - minY) * s;
  const r = new Raster(W, H);
  const land = new Uint8Array(W * H);

  for (let ty = 0; ty < H; ty++) {
    const wy = minY + (ty + 0.5) / s;
    for (let tx = 0; tx < W; tx++) {
      const wx = minX + (tx + 0.5) / s;
      // signed distance to the shore: positive on land
      const home = axialRound(wx, wy);
      const onLand = Boolean(cellAt(home.q, home.r));
      let best = Infinity;
      let owner: Cell | null = null;
      for (const sg of coast) {
        if (Math.abs((sg.ax + sg.bx) / 2 - wx) > 60 || Math.abs((sg.ay + sg.by) / 2 - wy) > 60) continue;
        const dd = segDist(wx, wy, sg.ax, sg.ay, sg.bx, sg.by);
        if (dd < best) {
          best = dd;
          owner = sg.cell;
        }
      }
      const sd = onLand ? best : -best;
      const grow = 5 + (fbm(wx / 22, wy / 22, seed + 11, 3) - 0.5) * 26;
      const shore = sd + grow;
      if (shore <= 0) continue;
      land[ty * W + tx] = 1;

      // biome borders wobble: look the cell up through a warped position
      const ux = wx + (fbm(wx / 30, wy / 30, seed + 1, 2) - 0.5) * 22;
      const uy = wy + (fbm(wx / 30, wy / 30, seed + 2, 2) - 0.5) * 22;
      const at = axialRound(ux, uy);
      let cell = cellAt(at.q, at.r) ?? cellAt(home.q, home.r) ?? owner!;
      const { d, edge } = inset(ux - cell.x, uy - cell.y);
      const other = cellAt(cell.q + HEX_DIRS[edge]!.q, cell.r + HEX_DIRS[edge]!.r);
      // speckled blend across the border
      const band = 9;
      if (other && other.terrain !== cell.terrain && d < band) {
        const k = 0.5 * (1 - d / band);
        const n = noise(tx / (2.2 * s), ty / (2.2 * s), seed + 3) * 0.7 + bayer(tx, ty) * 0.3;
        if (n < k) cell = other;
      }
      let c = ground(cell, wx, wy, tx, ty, d, s);
      // beach and wet sand along the water
      const sandW = 3 + noise(wx / 10, wy / 10, seed + 4) * 4;
      if (shore < sandW) {
        c = shore < 1.6 ? tone(P.wetSand, 0.4 + noise(tx / 2, ty / 2, 6) * 0.5, tx, ty) : sandGround(wx, wy, tx, ty, seed, s);
      } else if (shore < sandW + 2.5 && bayer(tx, ty) > (shore - sandW) / 2.5) {
        c = sandGround(wx, wy, tx, ty, seed, s);
      }
      r.set(tx, ty, c);
    }
  }

  paintCliff(r, land, W, H, s, seed);

  // props, painted back to front so canopies and peaks overlap naturally
  const props: Array<{ y: number; draw: () => void }> = [];
  const toTx = (wx: number) => Math.round((wx - minX) * s);
  const toTy = (wy: number) => Math.round((wy - minY) * s);
  const isLand = (wx: number, wy: number) => {
    const tx = toTx(wx);
    const ty = toTy(wy);
    return tx >= 0 && ty >= 0 && tx < W && ty < H && land[ty * W + tx] === 1;
  };
  for (const cell of cells.values()) planProps(cell, props, { toTx, toTy, isLand, r, s, cells: cellAt });
  props.sort((a, b) => a.y - b.y);
  for (const p of props) p.draw();

  // Painted at s texels per world pixel, kept at one: the same pixel grid as
  // the robber, with each pixel the average of finer paint.
  const out = s > 1 ? downsample(r, s) : r;
  grade(out, seed);
  return { raster: out, x: minX, y: minY, scale: 1 };
}

/** Earth strata under the south shore, surf, and the island's shadow. */
function paintCliff(r: Raster, land: Uint8Array, W: number, H: number, s: number, seed: number): void {
  const D = CLIFF_DEPTH * s;
  const solid = new Uint8Array(W * H);
  for (let tx = 0; tx < W; tx++) {
    let run = Infinity;
    let lip: RGB | null = null;
    const lipLen = Math.round(s * (1 + noise(tx / (3 * s), 0, seed + 7) * 3));
    const wobble = (noise(tx / (8 * s), 1, seed + 8) - 0.5) * 3 * s;
    for (let ty = 0; ty < H; ty++) {
      const i = ty * W + tx;
      if (land[i]) {
        run = 0;
        lip = r.get(tx, ty);
        solid[i] = 1;
        continue;
      }
      run += 1;
      if (run <= lipLen && lip) {
        r.set(tx, ty, mix(lip, P.ink, 0.35));
        solid[i] = 1;
      } else if (run <= D) {
        const k = (run + wobble) / s;
        let c: RGB;
        if (k < 6) c = tone(P.soil.slice(0, 4), 0.55 - k / 14 + (noise(tx / 2, ty / 2, 3) - 0.5) * 0.4, tx, ty);
        else if (k < 11) c = tone(P.clay.slice(1, 5), 0.5 + (noise(tx / (2 * s), ty / s, 4) - 0.5) * 0.6, tx, ty);
        else c = tone(P.stone.slice(0, 4), 0.5 + (noise(tx / (2 * s), ty / (1.5 * s), 5) - 0.5) * 0.8 - (k - 11) / 14, tx, ty);
        // pebbles, roots, seams
        const h = hash2(tx >> 1, ty >> 1, seed);
        if (h < 0.05) c = mix(c, [255, 236, 200], 0.25);
        else if (h > 0.95) c = mix(c, P.ink, 0.45);
        if (k < 5 && hash2(tx, 0, seed) < 0.06 && run < 4 * s) c = P.trunk[1]!;
        if (Math.abs(k - 6) < 0.5 / s || Math.abs(k - 11) < 0.5 / s) c = mix(c, P.ink, 0.3);
        r.set(tx, ty, c);
        solid[i] = 1;
      } else if (run <= D + 2 * s && run !== Infinity) {
        const foam = noise(tx / (2 * s), ty / s, seed + 9);
        if (foam > 0.35) r.set(tx, ty, foam > 0.6 ? P.water[5]! : P.water[4]!, 220);
      } else if (run <= D + 11 * s && run !== Infinity) {
        if (bayer(tx, ty) < 0.7 - (run - D) / (11 * s)) r.set(tx, ty, P.water[0]!, 150);
      }
    }
  }
  // surf hugging the north and side shores
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const i = ty * W + tx;
      if (solid[i] || r.alpha(tx, ty)) continue;
      let near = 0;
      for (let k = 1; k <= 3 * s && !near; k++) {
        if ((ty + k < H && solid[i + k * W]) || (tx + k < W && solid[i + k]) || (tx - k >= 0 && solid[i - k])) near = k;
      }
      if (!near) continue;
      const foam = noise(tx / (2 * s), ty / (2 * s), seed + 10);
      if (near <= s * 1.5 && foam > 0.3) r.set(tx, ty, P.water[5]!, 200);
      else if (foam > 0.55) r.set(tx, ty, P.water[4]!, 150);
    }
  }
}

interface Ctx {
  toTx: (x: number) => number;
  toTy: (y: number) => number;
  isLand: (x: number, y: number) => boolean;
  r: Raster;
  s: number;
  cells: (q: number, r: number) => Cell | undefined;
}

/** Spots inside the hex that leave the token, corners and road lines readable. */
function spots(cell: Cell, count: number, minDist: number, pad: number, ctx: Ctx, extra?: (x: number, y: number) => boolean) {
  const out: Array<{ x: number; y: number }> = [];
  const corners = Array.from({ length: 6 }, (_, i) => hexCorner(cell, HEX, i));
  for (let i = 0; i < 2000 && out.length < count; i++) {
    const x = cell.x + (hash2(i, 11, cell.seed) - 0.5) * 2 * HEX;
    const y = cell.y + (hash2(i, 12, cell.seed) - 0.5) * 2 * HEX;
    const { d } = inset(x - cell.x, y - cell.y);
    if (d < 4 + pad) continue;
    if (Math.hypot(x - cell.x, y - cell.y) < 22 + pad) continue;
    if (corners.some((c) => Math.hypot(x - c.x, y - c.y) < 12 + pad)) continue;
    if (!ctx.isLand(x, y + 2)) continue;
    if (extra && !extra(x, y)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < minDist)) continue;
    out.push({ x, y });
  }
  return out;
}

const FOREST_MIX: Array<keyof typeof TREE_KINDS> = ["autumn", "oak", "gold", "rust", "pine", "autumn", "oak", "gold"];

function planProps(cell: Cell, props: Array<{ y: number; draw: () => void }>, ctx: Ctx): void {
  const { toTx, toTy, r, s } = ctx;
  const add = (wy: number, draw: () => void) => props.push({ y: wy, draw });
  const seed = cell.seed;
  // small things are drawn a bit larger than life so they read at table zoom
  const big = s * 1.35;

  switch (cell.terrain) {
    case "wood": {
      for (const [i, p] of spots(cell, 34, 7.5, 0, ctx).entries()) {
        const kind = FOREST_MIX[Math.floor(hash2(i, 3, seed) * FOREST_MIX.length)]!;
        const size = 6 + hash2(i, 4, seed) * 3.5;
        add(p.y, () => tree(r, toTx(p.x), toTy(p.y), size, TREE_KINDS[kind], seed + i * 7, s));
      }
      for (const [i, p] of spots(cell, 6, 6, -2, ctx).entries()) {
        add(p.y, () => bush(r, toTx(p.x), toTy(p.y), 3, TREE_KINDS[i % 2 ? "oak" : "autumn"], seed + 99 + i, s));
      }
      break;
    }
    case "sheep": {
      const flock = spots(cell, 6, 11, 2, ctx);
      flock.forEach((p, i) => {
        if (i === 0) add(p.y, () => fence(r, toTx(p.x - 11), toTy(p.y), 4, big, hash2(1, i, seed) > 0.5 ? 1 : -1));
        else add(p.y, () => sheep(r, toTx(p.x), toTy(p.y), hash2(i, 5, seed) > 0.5 ? 1 : -1, big, seed + i));
      });
      for (const [i, p] of spots(cell, 4, 14, 0, ctx, (x, y) => flock.every((f) => Math.hypot(f.x - x, f.y - y) > 9)).entries()) {
        if (i === 0) add(p.y, () => tree(r, toTx(p.x), toTy(p.y), 7, TREE_KINDS.autumn, seed + 3, s));
        else add(p.y, () => bush(r, toTx(p.x), toTy(p.y), 3.5, TREE_KINDS[i % 2 ? "oak" : "gold"], seed + 40 + i, s));
      }
      grassTufts(cell, props, ctx, 40);
      break;
    }
    case "wheat": {
      const stacks = spots(cell, 3, 18, 3, ctx);
      stacks.forEach((p, i) => {
        if (i === 2) add(p.y, () => scarecrow(r, toTx(p.x), toTy(p.y), big));
        else add(p.y, () => haystack(r, toTx(p.x), toTy(p.y), big, seed + i));
      });
      for (const [i, p] of spots(cell, 2, 30, -3, ctx, (x, y) => inset(x - cell.x, y - cell.y).d < 9).entries()) {
        add(p.y, () => tree(r, toTx(p.x), toTy(p.y), 6.5, TREE_KINDS[i ? "gold" : "rust"], seed + 70 + i, s));
      }
      break;
    }
    case "brick": {
      const free = (x: number, y: number) => cell.holes.every((h) => Math.hypot((x - h.x) / (h.rx + 6), (y - h.y) / (h.ry + 7)) > 1);
      spots(cell, 4, 15, 3, ctx, free).forEach((p, i) => {
        if (i === 0) add(p.y, () => kiln(r, toTx(p.x), toTy(p.y), big));
        else add(p.y, () => brickStack(r, toTx(p.x), toTy(p.y), big));
      });
      for (const [i, p] of spots(cell, 3, 12, 0, ctx, free).entries()) {
        add(p.y, () => bush(r, toTx(p.x), toTy(p.y), 3, TREE_KINDS[i % 2 ? "rust" : "oak"], seed + 50 + i, s));
      }
      grassTufts(cell, props, ctx, 14);
      break;
    }
    case "ore": {
      // a small range: two tall peaks behind the token, foothills in front
      const lean = hash2(4, 4, seed) > 0.5 ? 1 : -1;
      const peaks = [
        { x: cell.x + 4 * lean, y: cell.y - 30, w: 15, h: 30 },
        { x: cell.x - 23 * lean, y: cell.y - 12, w: 21, h: 52 },
        { x: cell.x + 21 * lean, y: cell.y - 15, w: 18, h: 44 },
        { x: cell.x - 10 * lean, y: cell.y + 41, w: 16, h: 25 },
        { x: cell.x + 27 * lean, y: cell.y + 30, w: 10, h: 16 },
      ];
      peaks.forEach((p, i) => add(p.y, () => peak(r, toTx(p.x), toTy(p.y), p.w * s, p.h * s, seed + i * 31, s)));
      add(cell.y - 14, () => mine(r, toTx(cell.x + 26 * lean), toTy(cell.y - 14.5), s));
      for (const [i, p] of spots(cell, 7, 8, 0, ctx, (x, y) => peaks.every((k) => Math.hypot(x - k.x, (y - k.y) * 1.6) > k.w)).entries()) {
        add(p.y, () => rock(r, toTx(p.x), toTy(p.y), 2 + hash2(i, 6, seed) * 2, P.stone, seed + i, s));
      }
      break;
    }
    default: {
      spots(cell, 9, 11, 2, ctx).forEach((p, i) => {
        const k = i % 4;
        if (k === 0) add(p.y, () => cactus(r, toTx(p.x), toTy(p.y), big, seed + i));
        else if (k === 1) add(p.y, () => rock(r, toTx(p.x), toTy(p.y), 2.5 + hash2(i, 8, seed) * 1.5, P.soil.slice(1), seed + i, s));
        else if (k === 2) add(p.y, () => dryBush(r, toTx(p.x), toTy(p.y), s, seed + i));
        else add(p.y, () => skull(r, toTx(p.x), toTy(p.y), big));
      });
    }
  }
}

function grassTufts(cell: Cell, props: Array<{ y: number; draw: () => void }>, ctx: Ctx, n: number): void {
  for (const [i, p] of spots(cell, n, 4, -3, ctx).entries()) {
    props.push({ y: p.y, draw: () => grassClump(ctx.r, ctx.toTx(p.x), ctx.toTy(p.y), ctx.s, cell.seed + i) });
  }
}
