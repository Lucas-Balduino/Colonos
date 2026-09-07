#!/usr/bin/env node
/**
 * Chroma-key generated 16-bit tiles into transparent board sprites.
 * Magenta #FF00FF outside the piece; nearest-neighbor downscale; no AA.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { PNG } = createRequire(import.meta.url)("pngjs");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = "/opt/cursor/artifacts/assets";
const outDir = join(root, "public", "sprites");
mkdirSync(outDir, { recursive: true });

export const HEX_SIZE = 56;
const HEX_W = Math.round(Math.sqrt(3) * HEX_SIZE);
const FACE_H = HEX_SIZE * 2;
const CLIFF = 44;
const HEX_CANVAS_W = HEX_W + 8;
const HEX_CANVAS_H = FACE_H + CLIFF;
const HEX_PAD_Y = 4;
const HEX_ANCHOR_Y = (HEX_PAD_Y + HEX_SIZE) / HEX_CANVAS_H;

const tmpDir = "/tmp/colonos-art";
mkdirSync(tmpDir, { recursive: true });

function toPngFile(file) {
  const dest = join(tmpDir, `${Buffer.from(file).toString("hex").slice(-24)}.png`);
  execSync(`ffmpeg -y -loglevel error -i ${JSON.stringify(file)} ${JSON.stringify(dest)}`);
  return dest;
}

function readPng(file) {
  const buf = readFileSync(file);
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    return PNG.sync.read(readFileSync(toPngFile(file)));
  }
  try {
    return PNG.sync.read(buf);
  } catch {
    return PNG.sync.read(readFileSync(toPngFile(file)));
  }
}

function writePng(name, png) {
  writeFileSync(join(outDir, name), PNG.sync.write(png));
}

function blank(w, h) {
  const png = new PNG({ width: w, height: h, colorType: 6 });
  png.data.fill(0);
  return png;
}

function hueSat(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, max, min };
}

function isKeyed(r, g, b, a) {
  if (a < 10) return true;
  const { h, s, max } = hueSat(r, g, b);
  const magDist = Math.hypot(r - 255, g - 0, b - 255);
  if (magDist < 95) return true;
  if (h > 268 && h < 338 && s > 0.38 && max > 70) return true;
  if (r > 145 && b > 145 && g < 110 && Math.min(r, b) - g > 35) return true;
  return false;
}

function chromaKey(png) {
  floodKeyBackground(png);
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];
    if (a < 8) continue;
    if (isKeyed(r, g, b, a)) {
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = 0;
      continue;
    }
    const spill = Math.min(r, b) - g;
    if (spill > 24 && r > 80 && b > 80) {
      png.data[i] = Math.max(0, r - Math.round(spill * 0.85));
      png.data[i + 2] = Math.max(0, b - Math.round(spill * 0.85));
    }
  }
}

function floodKeyBackground(png) {
  const w = png.width;
  const h = png.height;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    const i = idx * 4;
    if (!isKeyed(png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3])) return;
    seen[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % w;
    const y = (idx / w) | 0;
    const i = idx * 4;
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

function bboxOf(png, minA = 18) {
  let minX = png.width;
  let minY = png.height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > minA) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }
  if (!count) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1, count };
}

function crop(png, box, pad = 1) {
  const x0 = Math.max(0, box.minX - pad);
  const y0 = Math.max(0, box.minY - pad);
  const x1 = Math.min(png.width - 1, box.maxX + pad);
  const y1 = Math.min(png.height - 1, box.maxY + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * png.width + (x0 + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

function scaleNN(src, dw, dh) {
  const out = blank(dw, dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.height - 1, Math.floor(((y + 0.5) * src.height) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.width - 1, Math.floor(((x + 0.5) * src.width) / dw));
      const si = (sy * src.width + sx) * 4;
      const di = (y * dw + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    const dy = oy + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = ox + x;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      if (src.data[si + 3] < 8) continue;
      const di = (dy * dst.width + dx) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

function inPointyHex(x, y, cx, cy, size) {
  const dx = x - cx;
  const dy = y - cy;
  const q = ((Math.sqrt(3) / 3) * dx - (1 / 3) * dy) / size;
  const r = ((2 / 3) * dy) / size;
  const s = -q - r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 1.02;
}

/** Keep the hex face, trees/peaks above it, and the south 3D cliff. Punch square corners. */
function maskHexTile(png) {
  const cx = (png.width - 1) / 2;
  const cy = HEX_PAD_Y + HEX_SIZE;
  const size = HEX_SIZE + 6;
  const halfW = HEX_W * 0.52;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] < 8) continue;
      if (inPointyHex(x, y, cx, cy, size)) continue;
      if (y <= cy + 4 && Math.abs(x - cx) <= halfW) continue;
      const t = Math.max(0, (y - (cy + HEX_SIZE * 0.42)) / (CLIFF + HEX_SIZE * 0.6));
      const half = halfW * (1 - Math.min(0.28, t * 0.28));
      if (y > cy && y < png.height && Math.abs(x - cx) <= half) continue;
      png.data[i + 3] = 0;
    }
  }
}

function fitWidth(src, targetW) {
  const dh = Math.max(1, Math.round((src.height * targetW) / src.width));
  return scaleNN(src, targetW, dh);
}

function fitMax(src, maxW, maxH) {
  const s = Math.min(maxW / src.width, maxH / src.height, 1) || 1;
  const dw = Math.max(1, Math.round(src.width * s));
  const dh = Math.max(1, Math.round(src.height * s));
  return scaleNN(src, dw, dh);
}

function connectedComponents(png, minPixels = 80) {
  const w = png.width;
  const h = png.height;
  const seen = new Uint8Array(w * h);
  const blobs = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (seen[idx] || png.data[idx * 4 + 3] < 20) continue;
      const stack = [[x, y]];
      seen[idx] = 1;
      const pixels = [];
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        pixels.push([cx, cy]);
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nidx = ny * w + nx;
          if (seen[nidx] || png.data[nidx * 4 + 3] < 20) continue;
          seen[nidx] = 1;
          stack.push([nx, ny]);
        }
      }
      if (pixels.length < minPixels) continue;
      blobs.push({ minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1, pixels });
    }
  }
  blobs.sort((a, b) => a.minX - b.minX || a.minY - b.minY);
  return blobs;
}

function extractBlob(png, blob, pad = 2) {
  const box = {
    minX: blob.minX,
    minY: blob.minY,
    maxX: blob.maxX,
    maxY: blob.maxY,
  };
  return crop(png, box, pad);
}

function loadKeyed(name) {
  const p = join(srcDir, name);
  if (!existsSync(p)) throw new Error(`missing art ${p}`);
  const png = readPng(p);
  chromaKey(png);
  return png;
}

function keyDarkBackdrop(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const lum = (r + g + b) / 3;
    const purple = b > r + 8 && b > g + 8 && lum < 70;
    if (lum < 28 || purple) {
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = 0;
    }
  }
}

function processHex(srcName, destName) {
  const png = loadKeyed(srcName);
  const box = bboxOf(png);
  if (!box) throw new Error(`empty hex ${srcName}`);
  const cropped = crop(png, box, 2);
  const scaled = fitWidth(cropped, HEX_W);
  const canvas = blank(HEX_CANVAS_W, HEX_CANVAS_H);
  const ox = Math.floor((HEX_CANVAS_W - scaled.width) / 2);
  const oy = HEX_PAD_Y;
  blit(canvas, scaled, ox, oy);
  maskHexTile(canvas);
  writePng(destName, canvas);
}

function processSingle(srcName, destName, maxW, maxH) {
  const png = loadKeyed(srcName);
  const box = bboxOf(png);
  if (!box) throw new Error(`empty ${srcName}`);
  const cropped = crop(png, box, 2);
  const scaled = fitMax(cropped, maxW, maxH);
  writePng(destName, scaled);
}

function processSheet(srcName, destNames, maxW, maxH, minPixels = 200) {
  const png = loadKeyed(srcName);
  let blobs = connectedComponents(png, minPixels);
  if (blobs.length !== destNames.length) {
    const hist = new Array(png.width).fill(0);
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3] > 20) hist[x] += 1;
      }
    }
    const gapThresh = 4;
    const ranges = [];
    let start = -1;
    for (let x = 0; x < hist.length; x++) {
      if (hist[x] > gapThresh) {
        if (start < 0) start = x;
      } else if (start >= 0) {
        ranges.push([start, x - 1]);
        start = -1;
      }
    }
    if (start >= 0) ranges.push([start, hist.length - 1]);
    ranges.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    const picked = ranges
      .slice(0, destNames.length)
      .sort((a, b) => a[0] - b[0]);
    blobs = picked.map(([minX, maxX]) => {
      let minY = png.height;
      let maxY = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (png.data[(y * png.width + x) * 4 + 3] > 20) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1, pixels: [] };
    });
  }
  if (blobs.length < destNames.length) {
    throw new Error(`${srcName}: expected ${destNames.length} blobs, got ${blobs.length}`);
  }
  destNames.forEach((name, i) => {
    const piece = extractBlob(png, blobs[i], 2);
    writePng(name, fitMax(piece, maxW, maxH));
  });
}

const hexes = [
  ["hex-wood-tile.png", "hex-wood.png"],
  ["hex-wheat-tile.png", "hex-wheat.png"],
  ["hex-brick-tile.png", "hex-brick.png"],
  ["hex-sheep-tile.png", "hex-sheep.png"],
  ["hex-ore-tile.png", "hex-ore.png"],
  ["hex-desert-tile.png", "hex-desert.png"],
  ["hex-sea-tile.png", "hex-sea.png"],
];
for (const [src, dest] of hexes) processHex(src, dest);

processSheet(
  "settlements-hi.png",
  ["settlement-red.png", "settlement-blue.png", "settlement-orange.png", "settlement-ivory.png"],
  44,
  52,
  400,
);
processSheet(
  "cities-hi.png",
  ["city-red.png", "city-blue.png", "city-orange.png", "city-ivory.png"],
  40,
  58,
  400,
);
processSheet("robber-hi.png", ["robber-0.png", "robber-1.png"], 36, 50, 300);
processSheet(
  "dice-sheet.png",
  ["dice-1.png", "dice-2.png", "dice-3.png", "dice-4.png", "dice-5.png", "dice-6.png"],
  28,
  28,
  200,
);

processSingle("token-hi.png", "token.png", 30, 30);
processSingle("lantern-marker.png", "lantern.png", 18, 28);

const port = loadKeyed("port-hi.png");
const portBlobs = connectedComponents(port, 250);
if (portBlobs.length >= 2) {
  writePng("port-any.png", fitMax(extractBlob(port, portBlobs[0]), 40, 36));
  writePng("port-2.png", fitMax(extractBlob(port, portBlobs[1]), 40, 36));
} else {
  processSingle("port-hi.png", "port-any.png", 40, 36);
  processSingle("port-hi.png", "port-2.png", 40, 36);
}

const roads = [
  ["road-red-tile.png", "road-red.png"],
  ["road-blue-tile.png", "road-blue.png"],
  ["road-orange-tile.png", "road-orange.png"],
  ["road-ivory-tile.png", "road-ivory.png"],
];
for (const [src, dest] of roads) processSingle(src, dest, 64, 28);

function processCardSheet(srcName, destNames) {
  const p = join(srcDir, srcName);
  if (!existsSync(p)) return;
  const png = readPng(p);
  keyDarkBackdrop(png);
  chromaKey(png);
  processSheetFromPng(png, destNames, 40, 56, 400);
}

function processSheetFromPng(png, destNames, maxW, maxH, minPixels) {
  let blobs = connectedComponents(png, minPixels);
  if (blobs.length !== destNames.length) {
    const hist = new Array(png.width).fill(0);
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3] > 20) hist[x] += 1;
      }
    }
    const ranges = [];
    let start = -1;
    for (let x = 0; x < hist.length; x++) {
      if (hist[x] > 6) {
        if (start < 0) start = x;
      } else if (start >= 0) {
        ranges.push([start, x - 1]);
        start = -1;
      }
    }
    if (start >= 0) ranges.push([start, hist.length - 1]);
    const picked = ranges
      .filter((r) => r[1] - r[0] > 20)
      .sort((a, b) => a[0] - b[0])
      .slice(0, destNames.length);
    blobs = picked.map(([minX, maxX]) => {
      let minY = png.height;
      let maxY = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (png.data[(y * png.width + x) * 4 + 3] > 20) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return { minX, minY, maxX, maxY };
    });
  }
  destNames.forEach((name, i) => {
    if (!blobs[i]) return;
    writePng(name, fitMax(extractBlob(png, blobs[i], 1), maxW, maxH));
  });
}

const poster = join(srcDir, "poster-ilha.png");
if (existsSync(poster)) copyFileSync(poster, join(outDir, "poster.png"));
const wordmark = join(srcDir, "wordmark-colonos.png");
if (existsSync(wordmark)) copyFileSync(wordmark, join(outDir, "wordmark-hero.png"));

writeFileSync(
  join(outDir, "meta.json"),
  JSON.stringify(
    {
      hexSize: HEX_SIZE,
      sprite: { w: HEX_CANVAS_W, h: HEX_CANVAS_H },
      anchor: { x: 0.5, y: Number(HEX_ANCHOR_Y.toFixed(4)) },
    },
    null,
    2,
  ),
);

console.log("processed art →", outDir, { HEX_CANVAS_W, HEX_CANVAS_H, HEX_ANCHOR_Y });
