#!/usr/bin/env node
/**
 * Palette-locked pixel atlas for Colonos — Ilha das Lanternas.
 * 18 colors from the identity plan; nearest-neighbor PNG, no anti-alias.
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "sprites");
mkdirSync(outDir, { recursive: true });

const C = {
  night: [26, 21, 32],
  wood: [61, 42, 31],
  panel: [42, 33, 51],
  parchment: [244, 232, 200],
  gold: [212, 160, 23],
  goldDark: [138, 100, 16],
  forest: [47, 107, 50],
  pasture: [109, 179, 92],
  wheat: [224, 179, 58],
  brick: [178, 74, 50],
  stone: [92, 101, 115],
  sand: [194, 163, 102],
  sea: [22, 52, 74],
  foam: [154, 209, 229],
  red: [196, 69, 54],
  blue: [43, 108, 176],
  orange: [217, 119, 6],
  ivory: [232, 224, 208],
  clear: [0, 0, 0, 0],
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4);
  }
  set(x, y, col) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a = col[3] ?? 255;
    this.data[i] = col[0];
    this.data[i + 1] = col[1];
    this.data[i + 2] = col[2];
    this.data[i + 3] = a;
  }
  fill(x, y, w, h, col) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, col);
  }
  save(name) {
    writeFileSync(join(outDir, name), encodePng(this.w, this.h, this.data));
  }
}

function hash(x, y, s = 0) {
  return ((x * 374761393 + y * 668265263 + s * 1274126177) >>> 0) % 100;
}

function inPointyHex(x, y, cx, cy, size) {
  const dx = x - cx + 0.5;
  const dy = y - cy + 0.5;
  const q = ((Math.sqrt(3) / 3) * dx - (1 / 3) * dy) / size;
  const r = ((2 / 3) * dy) / size;
  const s = -q - r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 1;
}

function paintHex(pix, painter) {
  const cx = (pix.w - 1) / 2;
  const cy = (pix.h - 1) / 2;
  const size = pix.h / 2 - 1;
  for (let y = 0; y < pix.h; y++) {
    for (let x = 0; x < pix.w; x++) {
      const inner = inPointyHex(x, y, cx, cy, size - 1.2);
      const rim = inPointyHex(x, y, cx, cy, size) && !inPointyHex(x, y, cx, cy, size - 1.2);
      if (rim) pix.set(x, y, C.night);
      else if (inner) painter(x, y, cx, cy);
    }
  }
}

function hexWood() {
  const pix = new Pix(84, 96);
  paintHex(pix, (x, y, cx, cy) => {
    pix.set(x, y, hash(x, y) < 18 ? C.wood : C.forest);
    if ((x + y * 2) % 7 === 0 && hash(x, y, 3) < 40) pix.set(x, y, C.pasture);
  });
  for (let i = 0; i < 14; i++) {
    const tx = 18 + (i % 5) * 12 + (i > 9 ? 6 : 0);
    const ty = 22 + Math.floor(i / 5) * 18;
    pine(pix, tx, ty);
  }
  pix.save("hex-wood.png");
}

function pine(pix, x, y) {
  pix.set(x, y + 6, C.wood);
  pix.set(x, y + 5, C.wood);
  for (const [dx, dy] of [
    [0, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [-2, 2],
    [-1, 2],
    [0, 2],
    [1, 2],
    [2, 2],
    [-2, 3],
    [-1, 3],
    [0, 3],
    [1, 3],
    [2, 3],
    [-1, 4],
    [0, 4],
    [1, 4],
  ]) {
    pix.set(x + dx, y + dy, dy < 2 ? C.pasture : C.forest);
  }
}

function hexBrick() {
  const pix = new Pix(84, 96);
  paintHex(pix, (x, y) => {
    const band = Math.floor(y / 4) % 2;
    const brickW = 7;
    const ox = band ? 3 : 0;
    const grout = (x + ox) % brickW === 0 || y % 4 === 0;
    pix.set(x, y, grout ? C.wood : hash(x, y) < 12 ? C.goldDark : C.brick);
  });
  pix.save("hex-brick.png");
}

function hexSheep() {
  const pix = new Pix(84, 96);
  paintHex(pix, (x, y) => {
    pix.set(x, y, hash(x, y) < 22 ? C.forest : C.pasture);
  });
  for (const [sx, sy] of [
    [28, 40],
    [48, 36],
    [38, 56],
    [56, 54],
    [24, 58],
  ])
    sheep(pix, sx, sy);
  pix.save("hex-sheep.png");
}

function sheep(pix, x, y) {
  pix.fill(x, y, 5, 3, C.ivory);
  pix.set(x + 4, y + 1, C.night);
  pix.set(x + 1, y + 3, C.wood);
  pix.set(x + 3, y + 3, C.wood);
}

function hexWheat() {
  const pix = new Pix(84, 96);
  paintHex(pix, (x, y) => {
    const row = (x + Math.floor(y / 3)) % 3;
    pix.set(x, y, row === 0 ? C.goldDark : row === 1 ? C.wheat : C.gold);
  });
  pix.save("hex-wheat.png");
}

function hexOre() {
  const pix = new Pix(84, 96);
  paintHex(pix, (x, y, cx, cy) => {
    const d = Math.abs(x - cx) + Math.abs(y - cy) * 0.7;
    if (d < 10) pix.set(x, y, C.foam);
    else if (d < 18) pix.set(x, y, C.stone);
    else pix.set(x, y, hash(x, y) < 20 ? C.panel : C.stone);
    if (hash(x, y, 9) < 6) pix.set(x, y, C.night);
  });
  pix.save("hex-ore.png");
}

function hexDesert() {
  const pix = new Pix(84, 96);
  paintHex(pix, (x, y) => {
    const dune = Math.sin(x * 0.3 + y * 0.08);
    pix.set(x, y, dune > 0.4 ? C.parchment : dune < -0.3 ? C.goldDark : C.sand);
  });
  cactus(pix, 40, 48);
  pix.save("hex-desert.png");
}

function cactus(pix, x, y) {
  pix.fill(x, y, 2, 10, C.forest);
  pix.fill(x - 3, y + 3, 3, 2, C.forest);
  pix.fill(x + 2, y + 5, 3, 2, C.forest);
  pix.set(x, y, C.pasture);
}

function hexSea() {
  const pix = new Pix(84, 96);
  paintHex(pix, (x, y) => {
    pix.set(x, y, hash(x, y, y) < 8 ? C.foam : hash(x + y, 2) < 18 ? C.panel : C.sea);
  });
  pix.save("hex-sea.png");
}

function robber(frame) {
  const pix = new Pix(16, 20);
  const ox = frame === 1 ? 1 : 0;
  pix.fill(4 + ox, 4, 8, 12, C.panel);
  pix.fill(5 + ox, 2, 6, 5, C.night);
  pix.fill(6 + ox, 4, 4, 3, C.sand);
  pix.set(7 + ox, 5, C.gold);
  pix.set(9 + ox, 5, C.gold);
  pix.fill(9 + ox, 8, 5, 6, C.wood);
  pix.fill(5 + ox, 16, 3, 3, C.forest);
  pix.fill(9 + ox, 16, 3, 3, C.forest);
  if (frame === 1) pix.set(8 + ox, 12, C.gold);
  pix.save(`robber-${frame}.png`);
}

const FACTIONS = {
  red: { roof: C.red, body: C.wood, trim: C.goldDark },
  blue: { roof: C.blue, body: C.stone, trim: C.foam },
  orange: { roof: C.orange, body: C.brick, trim: C.gold },
  ivory: { roof: C.ivory, body: C.parchment, trim: C.sand },
};

function settlement(id) {
  const f = FACTIONS[id];
  const pix = new Pix(16, 16);
  const roof = [
    [7, 2],
    [6, 3],
    [8, 3],
    [5, 4],
    [7, 4],
    [9, 4],
    [4, 5],
    [6, 5],
    [8, 5],
    [10, 5],
    [3, 6],
    [5, 6],
    [7, 6],
    [9, 6],
    [11, 6],
  ];
  for (const [x, y] of roof) pix.set(x, y, f.roof);
  pix.fill(4, 7, 8, 7, f.body);
  pix.fill(4, 13, 8, 1, C.night);
  pix.fill(6, 9, 2, 3, C.night);
  pix.set(10, 8, f.trim);
  pix.set(11, 8, C.gold);
  pix.save(`settlement-${id}.png`);
}

function city(id) {
  const f = FACTIONS[id];
  const pix = new Pix(20, 20);
  pix.fill(2, 10, 8, 8, f.body);
  pix.fill(9, 6, 9, 12, f.body);
  for (let x = 2; x <= 10; x++) pix.set(x, 9 - Math.abs(x - 6), f.roof);
  for (let x = 9; x <= 17; x++) pix.set(x, 5 - Math.abs(x - 13), f.roof);
  pix.fill(4, 12, 2, 3, C.night);
  pix.fill(12, 10, 2, 3, C.night);
  pix.fill(15, 10, 2, 3, C.night);
  pix.set(16, 3, C.gold);
  pix.set(16, 2, C.gold);
  pix.fill(2, 17, 16, 1, C.night);
  pix.save(`city-${id}.png`);
}

function road(id) {
  const f = FACTIONS[id];
  const pix = new Pix(24, 8);
  pix.fill(0, 2, 24, 4, f.body);
  pix.fill(0, 1, 24, 1, f.roof);
  pix.fill(0, 6, 24, 1, C.night);
  for (let x = 2; x < 24; x += 5) pix.fill(x, 2, 1, 4, C.night);
  pix.save(`road-${id}.png`);
}

function dice(n) {
  const pix = new Pix(16, 16);
  pix.fill(1, 1, 14, 14, C.parchment);
  pix.fill(0, 0, 16, 1, C.night);
  pix.fill(0, 15, 16, 1, C.night);
  pix.fill(0, 0, 1, 16, C.night);
  pix.fill(15, 0, 1, 16, C.night);
  pix.fill(2, 2, 12, 1, C.ivory);
  pix.fill(13, 3, 1, 11, C.goldDark);
  const pip = C.wood;
  const spots = {
    1: [[7, 7]],
    2: [
      [4, 4],
      [10, 10],
    ],
    3: [
      [4, 4],
      [7, 7],
      [10, 10],
    ],
    4: [
      [4, 4],
      [10, 4],
      [4, 10],
      [10, 10],
    ],
    5: [
      [4, 4],
      [10, 4],
      [7, 7],
      [4, 10],
      [10, 10],
    ],
    6: [
      [4, 4],
      [10, 4],
      [4, 7],
      [10, 7],
      [4, 10],
      [10, 10],
    ],
  };
  for (const [x, y] of spots[n]) pix.fill(x, y, 2, 2, pip);
  pix.save(`dice-${n}.png`);
}

function card(name, painter) {
  const pix = new Pix(20, 28);
  pix.fill(0, 0, 20, 28, C.night);
  pix.fill(1, 1, 18, 26, C.goldDark);
  pix.fill(2, 2, 16, 24, C.parchment);
  painter(pix);
  pix.save(`card-${name}.png`);
}

function cardWood(pix) {
  pine(pix, 9, 8);
  pine(pix, 5, 12);
  pine(pix, 13, 12);
}
function cardBrick(pix) {
  pix.fill(4, 10, 12, 10, C.brick);
  for (let y = 10; y < 20; y += 3) pix.fill(4, y, 12, 1, C.wood);
}
function cardSheep(pix) {
  pix.fill(3, 16, 14, 6, C.pasture);
  sheep(pix, 7, 12);
  sheep(pix, 11, 14);
}
function cardWheat(pix) {
  for (let i = 0; i < 5; i++) pix.fill(5 + i * 2, 8, 1, 12, C.wheat);
  pix.fill(5, 8, 9, 2, C.gold);
}
function cardOre(pix) {
  pix.fill(4, 14, 12, 8, C.stone);
  pix.fill(7, 8, 6, 8, C.stone);
  pix.fill(9, 6, 2, 4, C.foam);
}

function cardKnight(pix) {
  pix.fill(8, 6, 4, 4, C.sand);
  pix.fill(7, 10, 6, 8, C.red);
  pix.fill(6, 18, 8, 2, C.night);
  pix.set(6, 12, C.gold);
}
function cardVictory(pix) {
  const star = [
    [10, 6],
    [9, 9],
    [6, 9],
    [8, 11],
    [7, 14],
    [10, 12],
    [13, 14],
    [12, 11],
    [14, 9],
    [11, 9],
  ];
  for (const [x, y] of star) pix.set(x, y, C.gold);
}
function cardRoads(pix) {
  pix.fill(3, 12, 14, 3, C.wood);
  pix.fill(3, 16, 14, 3, C.brick);
}
function cardPlenty(pix) {
  pix.fill(6, 8, 8, 10, C.gold);
  pix.fill(8, 6, 4, 4, C.wheat);
  pix.set(7, 12, C.forest);
  pix.set(12, 13, C.brick);
}
function cardMonopoly(pix) {
  pix.fill(5, 10, 4, 8, C.gold);
  pix.fill(11, 10, 4, 8, C.gold);
  pix.fill(7, 14, 6, 2, C.goldDark);
}

function port(kind) {
  const pix = new Pix(16, 16);
  pix.fill(2, 10, 12, 3, C.wood);
  pix.fill(7, 4, 2, 7, C.wood);
  pix.fill(8, 2, 5, 6, kind === "any" ? C.foam : C.gold);
  pix.fill(4, 12, 8, 2, C.sea);
  pix.save(`port-${kind}.png`);
}

function wordmark() {
  const pix = new Pix(160, 32);
  pix.fill(0, 0, 160, 32, C.clear);
  const glyphs = {
    C: ["01110", "10001", "10000", "10000", "10001", "01110"],
    O: ["01110", "10001", "10001", "10001", "10001", "01110"],
    L: ["10000", "10000", "10000", "10000", "10000", "11111"],
    N: ["10001", "11001", "10101", "10011", "10001", "10001"],
    S: ["01111", "10000", "01110", "00001", "00001", "11110"],
  };
  const text = "COLONOS";
  let x0 = 8;
  for (const ch of text) {
    const g = glyphs[ch];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 5; x++) {
        if (g[y][x] === "1") {
          pix.fill(x0 + x * 3, 6 + y * 3, 3, 3, C.gold);
          pix.fill(x0 + x * 3 + 1, 7 + y * 3 + 1, 2, 2, C.goldDark);
        }
      }
    }
    x0 += 20;
  }
  pix.fill(74, 8, 2, 4, C.gold);
  pix.fill(73, 12, 4, 5, C.goldDark);
  pix.set(75, 14, C.wheat);
  pix.save("wordmark.png");
}

function token() {
  const pix = new Pix(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      if (dx * dx + dy * dy <= 49) pix.set(x, y, C.parchment);
      if (dx * dx + dy * dy <= 49 && dx * dx + dy * dy > 36) pix.set(x, y, C.goldDark);
    }
  }
  pix.save("token.png");
}

hexWood();
hexBrick();
hexSheep();
hexWheat();
hexOre();
hexDesert();
hexSea();
robber(0);
robber(1);
for (const id of Object.keys(FACTIONS)) {
  settlement(id);
  city(id);
  road(id);
}
for (let n = 1; n <= 6; n++) dice(n);
card("wood", cardWood);
card("brick", cardBrick);
card("sheep", cardSheep);
card("wheat", cardWheat);
card("ore", cardOre);
card("knight", cardKnight);
card("victory", cardVictory);
card("roads", cardRoads);
card("plenty", cardPlenty);
card("monopoly", cardMonopoly);
port("any");
port("2");
wordmark();
token();

const ai = "/opt/cursor/artifacts/assets";
const copies = [
  ["poster-ilha.png", "poster.png"],
  ["wordmark-colonos.png", "wordmark-hero.png"],
];
for (const [src, dest] of copies) {
  const p = join(ai, src);
  if (existsSync(p)) copyFileSync(p, join(outDir, dest));
}

console.log("sprites written to", outDir);
