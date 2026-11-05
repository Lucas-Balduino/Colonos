/** Node side of the art: writes rasters as PNG files. */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createRequire } from "node:module";
import type { Raster } from "../../src/art/raster.ts";

export * from "../../src/art/raster.ts";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  PNG: { new (o: { width: number; height: number }): { data: Buffer }; sync: { write(p: unknown): Buffer } };
};

export function writePng(r: Raster, file: string): void {
  const png = new PNG({ width: r.w, height: r.h });
  png.data.set(r.data);
  writeFileSync(file, PNG.sync.write(png));
}

export function scaleUp(src: Raster, k: number): Raster {
  const out = new (src.constructor as new (w: number, h: number) => Raster)(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const c = src.get(Math.floor(x / k), Math.floor(y / k));
      if (c) out.set(x, y, c, src.alpha(Math.floor(x / k), Math.floor(y / k)));
    }
  }
  return out;
}

/* ---------- indexed PNG (for the big poster) ---------- */


const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  let crc = 0xffffffff;
  for (const b of body) crc = CRC_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}

/** Median cut down to 256 colors, then an 8-bit palette PNG. Opaque images only. */
export function writeIndexedPng(r: Raster, file: string): void {
  const counts = new Map<number, number>();
  for (let i = 0; i < r.w * r.h; i++) {
    const k = (r.data[i * 4]! << 16) | (r.data[i * 4 + 1]! << 8) | r.data[i * 4 + 2]!;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  type Entry = [number, number, number, number];
  let boxes: Entry[][] = [[...counts].map(([k, n]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255, n] as Entry)];
  while (boxes.length < 256) {
    let pick = -1;
    let spread = 0;
    let axis = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let a = 0; a < 3; a++) {
        let lo = 255;
        let hi = 0;
        for (const e of box) {
          lo = Math.min(lo, e[a]!);
          hi = Math.max(hi, e[a]!);
        }
        if (hi - lo > spread) {
          spread = hi - lo;
          pick = i;
          axis = a;
        }
      }
    });
    if (pick < 0) break;
    const box = boxes[pick]!.sort((p, q) => p[axis]! - q[axis]!);
    const total = box.reduce((s, e) => s + e[3], 0);
    let acc = 0;
    let cut = 1;
    for (; cut < box.length - 1; cut++) {
      acc += box[cut - 1]![3];
      if (acc >= total / 2) break;
    }
    boxes = [...boxes.slice(0, pick), box.slice(0, cut), box.slice(cut), ...boxes.slice(pick + 1)];
  }
  const palette = boxes.map((box) => {
    const n = box.reduce((s, e) => s + e[3], 0);
    return [0, 1, 2].map((a) => Math.round(box.reduce((s, e) => s + e[a]! * e[3], 0) / n));
  });
  const index = new Map<number, number>();
  for (const k of counts.keys()) {
    const c = [(k >> 16) & 255, (k >> 8) & 255, k & 255];
    let best = 0;
    let bestD = Infinity;
    palette.forEach((p, i) => {
      const d = (p[0]! - c[0]!) ** 2 + (p[1]! - c[1]!) ** 2 + (p[2]! - c[2]!) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    index.set(k, best);
  }
  const raw = Buffer.alloc((r.w + 1) * r.h);
  for (let y = 0; y < r.h; y++) {
    raw[y * (r.w + 1)] = 0;
    for (let x = 0; x < r.w; x++) {
      const i = (y * r.w + x) * 4;
      raw[y * (r.w + 1) + 1 + x] = index.get((r.data[i]! << 16) | (r.data[i + 1]! << 8) | r.data[i + 2]!)!;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(r.w, 0);
  ihdr.writeUInt32BE(r.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("PLTE", Buffer.from(palette.flat())),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
