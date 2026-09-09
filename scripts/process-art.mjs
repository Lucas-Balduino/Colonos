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
const HEX_CANVAS_W = HEX_W;
const HEX_CANVAS_H = FACE_H;
const HEX_ANCHOR_Y = 0.5;
/** Slightly past HEX_SIZE so the six vertex pixels stay opaque and tiles overlap 1px. */
const HEX_CLIP = HEX_SIZE + 0.65;

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

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function mixRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Keep the cottage/city silhouette; push red vs orange apart on roof + plaster. */
function punchFactionColor(fileName, faction) {
  const p = join(outDir, fileName);
  if (!existsSync(p)) return;
  const png = PNG.sync.read(readFileSync(p));
  const roofHue = faction === "red" ? 4 : 38;
  const wall = faction === "red" ? [198, 44, 42] : [242, 138, 22];
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 16) continue;
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    const goldWindow = h > 42 && h < 58 && s > 0.5 && l > 0.45 && b < 120;
    const timber = l < 0.28 || (h > 18 && h < 42 && s > 0.18 && l < 0.38);
    const stone = s < 0.16 && l > 0.22 && l < 0.58;
    const smoke = l > 0.7 && s < 0.35;
    if (goldWindow || timber || stone || smoke) continue;
    const beigePlaster = l > 0.5 && h > 12 && h < 52 && b > 90;
    const warmRoof = s > 0.28 && l < 0.64 && (h < 48 || h > 330) && !beigePlaster;
    if (warmRoof) {
      const [nr, ng, nb] = hslToRgb(roofHue, Math.min(0.92, s + 0.22), faction === "orange" ? Math.min(0.58, l + 0.05) : Math.max(0.28, l - 0.04));
      png.data[i] = nr;
      png.data[i + 1] = ng;
      png.data[i + 2] = nb;
      continue;
    }
    if (beigePlaster) {
      const [nr, ng, nb] = mixRgb([r, g, b], wall, faction === "red" ? 0.62 : 0.7);
      png.data[i] = nr;
      png.data[i + 1] = ng;
      png.data[i + 2] = nb;
    }
  }
  writePng(fileName, png);
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

function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 30) * Math.PI) / 180;
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0001) + xi) inside = !inside;
  }
  return inside;
}

/** Clip to a pointy-top hex aligned with Pixi anchor 0.5 / game HEX_SIZE. */
function maskHexClip(png, size = HEX_CLIP) {
  const cx = png.width / 2;
  const cy = png.height / 2;
  const outer = hexCorners(cx, cy, size);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      if (!inPoly(x + 0.5, y + 0.5, outer)) {
        png.data[i] = 0;
        png.data[i + 1] = 0;
        png.data[i + 2] = 0;
        png.data[i + 3] = 0;
      }
    }
  }
}

/** Paint holes inside the hex from neighbouring opaque pixels so seams stay solid. */
function fillHexInterior(png, fallback = [109, 179, 92]) {
  const cx = png.width / 2;
  const cy = png.height / 2;
  const outer = hexCorners(cx, cy, HEX_CLIP);
  const w = png.width;
  const h = png.height;
  const inside = (x, y) => inPoly(x + 0.5, y + 0.5, outer);
  const queue = [];
  const seen = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const i = (y * w + x) * 4;
      if (png.data[i + 3] < 18) continue;
      const idx = y * w + x;
      seen[idx] = 1;
      queue.push(idx);
    }
  }
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const x = idx % w;
    const y = (idx / w) | 0;
    const si = idx * 4;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!inside(nx, ny)) continue;
      const nidx = ny * w + nx;
      if (seen[nidx]) continue;
      const ni = nidx * 4;
      if (png.data[ni + 3] >= 18) {
        seen[nidx] = 1;
        queue.push(nidx);
        continue;
      }
      png.data[ni] = png.data[si];
      png.data[ni + 1] = png.data[si + 1];
      png.data[ni + 2] = png.data[si + 2];
      png.data[ni + 3] = 255;
      seen[nidx] = 1;
      queue.push(nidx);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const i = (y * w + x) * 4;
      if (png.data[i + 3] >= 18) continue;
      png.data[i] = fallback[0];
      png.data[i + 1] = fallback[1];
      png.data[i + 2] = fallback[2];
      png.data[i + 3] = 255;
    }
  }
}

function makeChipFromHex(canvas, destName) {
  const chip = blank(36, 36);
  const cx = Math.floor(canvas.width / 2);
  const cy = Math.floor(canvas.height / 2);
  for (let y = 0; y < 36; y++) {
    for (let x = 0; x < 36; x++) {
      const sx = cx - 18 + x;
      const sy = cy - 18 + y;
      const dx = x - 17.5;
      const dy = y - 17.5;
      if (dx * dx + dy * dy > 17.5 * 17.5) continue;
      if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
      const si = (sy * canvas.width + sx) * 4;
      const di = (y * 36 + x) * 4;
      chip.data[di] = canvas.data[si];
      chip.data[di + 1] = canvas.data[si + 1];
      chip.data[di + 2] = canvas.data[si + 2];
      chip.data[di + 3] = canvas.data[si + 3];
    }
  }
  writePng(destName.replace("hex-", "chip-"), chip);
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

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.001) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const CONNECTOR_EARTH = [194, 163, 102];
const CONNECTOR_EARTH_DK = [138, 104, 64];
const CONNECTOR_MEADOW = [109, 179, 92];

/** Shared edge meadow + corner house-plots so every land hex snaps to its neighbors. */
function paintConnectors(png) {
  const cx = png.width / 2;
  const cy = png.height / 2;
  const corners = hexCorners(cx, cy, HEX_SIZE);
  const CORNER_R = 13;
  const EDGE_BAND = 7.5;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] < 18) continue;
      const px = x + 0.5;
      const py = y + 0.5;
      let cornerD = Infinity;
      for (const [qx, qy] of corners) {
        cornerD = Math.min(cornerD, Math.hypot(px - qx, py - qy));
      }
      let edgeD = Infinity;
      for (let k = 0; k < 6; k++) {
        const a = corners[k];
        const b = corners[(k + 1) % 6];
        edgeD = Math.min(edgeD, distToSeg(px, py, a[0], a[1], b[0], b[1]));
      }
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (cornerD < CORNER_R) {
        const t = Math.pow(1 - cornerD / CORNER_R, 1.05) * (cornerD < 4.5 ? 1 : 0.92);
        const earth = cornerD < 5.5 ? CONNECTOR_EARTH : CONNECTOR_EARTH_DK;
        png.data[i] = Math.round(r + (earth[0] - r) * t);
        png.data[i + 1] = Math.round(g + (earth[1] - g) * t);
        png.data[i + 2] = Math.round(b + (earth[2] - b) * t);
        continue;
      }
      if (edgeD < EDGE_BAND) {
        const t = Math.pow(1 - edgeD / EDGE_BAND, 0.7) * (edgeD < 2.4 ? 1 : 0.78);
        png.data[i] = Math.round(r + (CONNECTOR_MEADOW[0] - r) * t);
        png.data[i + 1] = Math.round(g + (CONNECTOR_MEADOW[1] - g) * t);
        png.data[i + 2] = Math.round(b + (CONNECTOR_MEADOW[2] - b) * t);
      }
    }
  }
}

function finishLandHex(canvas, destName, sea) {
  maskHexClip(canvas);
  fillHexInterior(canvas, sea ? [22, 52, 74] : CONNECTOR_MEADOW);
  if (!sea) paintConnectors(canvas);
  writePng(destName, canvas);
  makeChipFromHex(canvas, destName);
}

function processKeyedHex(srcName, destName, sea = false) {
  const p = join(srcDir, srcName);
  if (!existsSync(p)) return false;
  const png = loadKeyed(srcName);
  const box = bboxOf(png);
  if (!box) throw new Error(`empty hex ${srcName}`);
  const cropped = crop(png, box, 0);
  const scale = Math.max(HEX_W / cropped.width, FACE_H / cropped.height);
  const dw = Math.max(1, Math.round(cropped.width * scale));
  const dh = Math.max(1, Math.round(cropped.height * scale));
  const scaled = scaleNN(cropped, dw, dh);
  const canvas = blank(HEX_CANVAS_W, HEX_CANVAS_H);
  blit(canvas, scaled, Math.round((HEX_CANVAS_W - dw) / 2), Math.round((HEX_CANVAS_H - dh) / 2));
  finishLandHex(canvas, destName, sea);
  return true;
}

function processFieldHex(srcName, destName, sea = false) {
  const p = join(srcDir, srcName);
  if (!existsSync(p)) return false;
  const png = readPng(p);
  const sampleW = Math.min(png.width, Math.max(HEX_CANVAS_W * 4, Math.round(png.width * 0.58)));
  const sampleH = Math.min(png.height, Math.round(sampleW * (FACE_H / HEX_W)));
  const sx = Math.floor((png.width - sampleW) / 2);
  const sy = Math.floor((png.height - sampleH) / 2);
  const sample = crop(png, {
    minX: Math.max(0, sx),
    minY: Math.max(0, sy),
    maxX: Math.min(png.width - 1, sx + sampleW - 1),
    maxY: Math.min(png.height - 1, sy + sampleH - 1),
  }, 0);
  const scaled = scaleNN(sample, HEX_CANVAS_W, HEX_CANVAS_H);
  finishLandHex(scaled, destName, sea);
  return true;
}

function processHex(srcName, destName) {
  const sea = destName.includes("sea");
  const connectName = destName.replace(".png", "-connect.png");
  if (processKeyedHex(connectName, destName, sea)) return;
  if (processFieldHex(srcName.replace("hex-", "field-").replace("-tile.png", ".png"), destName, sea)) {
    return;
  }
  const png = loadKeyed(srcName);
  const box = bboxOf(png);
  if (!box) throw new Error(`empty hex ${srcName}`);
  const cropped = crop(png, box, 0);
  const scale = Math.max(HEX_W / cropped.width, FACE_H / cropped.height);
  const dw = Math.max(1, Math.round(cropped.width * scale));
  const dh = Math.max(1, Math.round(cropped.height * scale));
  const scaled = scaleNN(cropped, dw, dh);
  const canvas = blank(HEX_CANVAS_W, HEX_CANVAS_H);
  blit(canvas, scaled, Math.round((HEX_CANVAS_W - dw) / 2), Math.round((HEX_CANVAS_H - dh) / 2));
  finishLandHex(canvas, destName, sea);
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

processSingle("token-hi.png", "token.png", 48, 48);
processSingle("lantern-marker.png", "lantern.png", 18, 28);

punchFactionColor("settlement-red.png", "red");
punchFactionColor("settlement-orange.png", "orange");
punchFactionColor("city-red.png", "red");
punchFactionColor("city-orange.png", "orange");

function sliceSheet(srcName, destNames, maxW, maxH) {
  const p = join(srcDir, srcName);
  if (!existsSync(p)) return false;
  const png = readPng(p);
  keyDarkBackdrop(png);
  chromaKey(png);
  const n = destNames.length;
  const sliceW = Math.floor(png.width / n);
  destNames.forEach((name, i) => {
    const piece = crop(png, {
      minX: i * sliceW + 4,
      minY: 4,
      maxX: (i + 1) * sliceW - 5,
      maxY: png.height - 5,
    });
    const box = bboxOf(piece);
    const tight = box ? crop(piece, box, 1) : piece;
    writePng(name, fitMax(tight, maxW, maxH));
  });
  return true;
}

sliceSheet("cards-resource.png", [
  "card-wood.png",
  "card-brick.png",
  "card-sheep.png",
  "card-wheat.png",
  "card-ore.png",
], 52, 72);
sliceSheet("cards-dev.png", [
  "card-knight.png",
  "card-victory.png",
  "card-roads.png",
  "card-plenty.png",
  "card-monopoly.png",
], 52, 72);

function makeGhost(srcName, destName) {
  const png = PNG.sync.read(readFileSync(join(outDir, srcName)));
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 12) continue;
    const l = png.data[i] * 0.3 + png.data[i + 1] * 0.55 + png.data[i + 2] * 0.15;
    const g = Math.round(l * 0.7 + 48);
    png.data[i] = g;
    png.data[i + 1] = g;
    png.data[i + 2] = Math.min(255, g + 4);
    png.data[i + 3] = Math.round(png.data[i + 3] * 0.85);
  }
  writePng(destName, png);
}
makeGhost("settlement-ivory.png", "settlement-ghost.png");
makeGhost("city-ivory.png", "city-ghost.png");

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
for (const [src, dest] of roads) processSingle(src, dest, 96, 32);

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
