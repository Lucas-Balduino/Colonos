/**
 * Lobby poster: the beginner island painted by the same code as the table,
 * floating on the sea at dusk, with lit homesteads.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createBeginnerBoard } from "../../src/core/board.ts";
import { hexCorner, pointyHexToPixel } from "../../src/core/hex.ts";
import { paintIsland } from "../../src/art/world.ts";
import { Raster, hex, mix } from "./raster.ts";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } };
};

function loadPng(file: string): Raster {
  const png = PNG.sync.read(readFileSync(file));
  const r = new Raster(png.width, png.height);
  r.data.set(png.data);
  return r;
}

/** Draws `src` scaled by an integer `k` with its alpha. */
function blit(r: Raster, src: Raster, x0: number, y0: number, k = 1): void {
  for (let y = 0; y < src.h * k; y++) {
    for (let x = 0; x < src.w * k; x++) {
      const sx = Math.floor(x / k);
      const sy = Math.floor(y / k);
      const a = src.alpha(sx, sy);
      if (a === 0) continue;
      const c = src.get(sx, sy)!;
      const under = r.get(x0 + x, y0 + y);
      r.set(x0 + x, y0 + y, under && a < 255 ? mix(under, c, a / 255) : c);
    }
  }
}

export function poster(spriteDir: string, sea: Raster): Raster {
  const board = createBeginnerBoard();
  const art = paintIsland(board, 2);
  // the poster shows every texel as 2x2, like the table at zoom 2
  const s = 2 / art.scale;
  const W = 1600;
  const H = 1120;
  const r = new Raster(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) r.set(x, y, sea.get((x >> 1) % sea.w, (y >> 1) % sea.h)!);
  const ox = Math.round((W - art.raster.w * s) / 2);
  const oy = Math.round((H - art.raster.h * s) / 2) - 10;
  blit(r, art.raster, ox, oy, s);

  const toPx = (wx: number, wy: number) => ({ x: ox + (wx - art.x) * s, y: oy + (wy - art.y) * s });
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
    const c = hexCorner(pointyHexToPixel({ q, r: rr }, 56), 56, i);
    const p = toPx(c.x, c.y);
    const img = loadPng(join(spriteDir, `${sprite}.png`));
    // footprint center sits 8 px above the sprite's bottom (PIECE_ANCHOR)
    blit(r, img, Math.round(p.x - img.w), Math.round(p.y - (img.h - 8) * 2), 2);
    lights.push({ x: p.x, y: p.y - 26 });
  }
  const boat = loadPng(join(spriteDir, "port-2.png"));
  blit(r, boat, W - 300, H - 230, 2);
  blit(r, boat, 170, 210, 2);

  // dusk: cool everything, then warm it again around the lanterns
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = mix(r.get(x, y)!, hex("#1c1838"), 0.34);
      let warm = 0;
      for (const l of lights) {
        const d = Math.hypot(x - l.x, (y - l.y) * 1.2);
        if (d < 110) warm += (1 - d / 110) * 0.7;
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
