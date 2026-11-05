/**
 * Lobby poster: the beginner island as a floating diorama at dusk, with the
 * real tiles, the same earth strata as the board, and lit houses.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createBeginnerBoard } from "../../src/core/board.ts";
import { Raster, hex, mix, type RGB } from "./raster.ts";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } };
};

const R = 56;
const SQ3 = Math.sqrt(3);

function inHex(x: number, y: number, cx: number, cy: number, r = R + 0.65): boolean {
  const dx = Math.abs(x + 0.5 - cx);
  const dy = Math.abs(y + 0.5 - cy);
  return dx <= (SQ3 / 2) * r && dy * (SQ3 / 2) + dx / 2 <= (r * SQ3) / 2;
}

function fillHex(r: Raster, cx: number, cy: number, color: (x: number, y: number) => RGB, size = R + 0.65): void {
  for (let y = Math.floor(cy - size); y <= cy + size; y++) {
    for (let x = Math.floor(cx - size); x <= cx + size; x++) {
      if (inHex(x, y, cx, cy, size)) r.set(x, y, color(x, y));
    }
  }
}

function blit(r: Raster, src: Raster, x0: number, y0: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const a = src.alpha(x, y);
      if (a < 128) continue;
      r.set(x0 + x, y0 + y, src.get(x, y)!);
    }
  }
}

function loadPng(file: string): Raster {
  const png = PNG.sync.read(readFileSync(file));
  const r = new Raster(png.width, png.height);
  r.data.set(png.data);
  return r;
}

export function poster(spriteDir: string, tiles: Record<string, Raster>, sea: Raster): Raster {
  const W = 800;
  const H = 560;
  const r = new Raster(W, H);
  const ox = W / 2;
  const oy = H / 2 - 18;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) r.set(x, y, sea.get(x % sea.w, y % sea.h)!);

  const board = createBeginnerBoard();
  const hexes = Object.values(board.hexes).map((h) => ({
    ...h,
    x: ox + R * SQ3 * (h.q + h.r / 2),
    y: oy + R * 1.5 * h.r,
  }));

  for (const h of hexes) fillHex(r, h.x + 6, h.y + 24, () => hex("#0b3046"), R + 3);
  for (const h of hexes) fillHex(r, h.x, h.y + 18, () => hex("#8fd0de"), R + 1.5);
  const bands: Array<[number, string]> = [
    [16, "#2e2a33"],
    [12, "#463f45"],
    [8, "#5a3a22"],
    [4, "#76512e"],
  ];
  for (const [at, color] of bands) {
    for (const h of hexes) {
      fillHex(r, h.x, h.y + at, (x, y) => {
        const c = hex(color);
        const speck = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        return speck % 17 === 0 ? mix(c, [0, 0, 0], 0.35) : speck % 23 === 0 ? mix(c, [255, 230, 190], 0.18) : c;
      });
    }
  }
  for (const h of [...hexes].sort((a, b) => a.y - b.y)) {
    const tile = tiles[h.terrain];
    if (tile) blit(r, tile, Math.round(h.x - tile.w / 2), Math.round(h.y - tile.h / 2));
  }

  // a few lit homesteads
  const corner = (h: (typeof hexes)[number], i: number) => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return { x: h.x + R * Math.cos(a), y: h.y + R * Math.sin(a) };
  };
  const byId = (q: number, rr: number) => hexes.find((h) => h.q === q && h.r === rr)!;
  const homes: Array<[number, number, number, string]> = [
    [0, -1, 1, "settlement-red"],
    [1, 0, 2, "city-blue"],
    [-1, 1, 5, "settlement-orange"],
    [0, 1, 1, "settlement-ivory"],
    [-1, 0, 3, "city-red"],
    [1, -2, 2, "settlement-blue"],
  ];
  const lights: Array<{ x: number; y: number }> = [];
  for (const [q, rr, i, sprite] of homes) {
    const p = corner(byId(q, rr), i);
    const img = loadPng(join(spriteDir, `${sprite}.png`));
    blit(r, img, Math.round(p.x - img.w / 2), Math.round(p.y - img.h * 0.9));
    lights.push({ x: p.x, y: p.y - 14 });
  }
  const boat = loadPng(join(spriteDir, "port-2.png"));
  blit(r, boat, ox + 270, oy + 150);
  blit(r, boat, ox - 330, oy - 120);

  // dusk: cool the whole picture, then warm it again around the lanterns
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = r.get(x, y)!;
      c = mix(c, hex("#1c1838"), 0.38);
      let warm = 0;
      for (const l of lights) {
        const d = Math.hypot(x - l.x, (y - l.y) * 1.2);
        if (d < 60) warm += (1 - d / 60) * 0.7;
      }
      if (warm > 0) {
        const step = Math.min(0.6, Math.round(warm * 6) / 6);
        c = [Math.min(255, c[0] + 120 * step), Math.min(255, c[1] + 70 * step), Math.min(255, c[2] + 20 * step)];
      }
      r.set(x, y, c);
    }
  }
  return r;
}
