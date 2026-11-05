/**
 * Resource icons (16x16, drawn at native size so the HUD shows them crisp)
 * and the resource cards built from them.
 */
import { P } from "./icon-palette.ts";
import { Raster, hex, mix, noise, ramp, type RGB } from "./raster.ts";

type Px = Map<string, RGB>;

function put(px: Px, x: number, y: number, c: RGB): void {
  px.set(`${Math.floor(x)},${Math.floor(y)}`, c);
}

/** Draws pixels with a dark 1px outline and a shadow under them. */
function stamp(r: Raster, px: Px, ox: number, oy: number, outline: RGB): void {
  const cells = [...px.keys()].map((k) => k.split(",").map(Number) as [number, number]);
  const has = (x: number, y: number) => px.has(`${x},${y}`);
  for (const [x, y] of cells) {
    if (!has(x, y + 1) && !has(x + 1, y + 1)) r.set(ox + x + 1, oy + y + 2, [0, 0, 0], 70);
  }
  for (const [x, y] of cells) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (!has(x + dx, y + dy)) r.set(ox + x + dx, oy + y + dy, outline);
    }
  }
  for (const [x, y] of cells) r.set(ox + x, oy + y, px.get(`${x},${y}`)!);
}

function ellipse(px: Px, cx: number, cy: number, rx: number, ry: number, color: (x: number, y: number, dx: number, dy: number) => RGB) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) put(px, x, y, color(x, y, dx, dy));
    }
  }
}

function logs(): Px {
  const px: Px = new Map();
  // three logs seen end on: bark ring, pale cut, a growth ring
  const end = (cx: number, cy: number) =>
    ellipse(px, cx, cy, 3.6, 3.6, (x, y, dx, dy) => {
      const d = Math.hypot(dx, dy);
      if (d > 0.72) return dx + dy < 0 ? P.trunk[2]! : P.trunk[1]!;
      if (d > 0.3 && d < 0.5) return P.sand[1]!;
      return dx + dy < 0 ? P.sand[4]! : P.sand[3]!;
    });
  end(4, 11);
  end(11.5, 11);
  end(7.75, 4.5);
  return px;
}

function bricks(): Px {
  const px: Px = new Map();
  const brick = (x0: number, y0: number) => {
    for (let y = y0; y < y0 + 5; y++) {
      for (let x = x0; x < x0 + 7; x++) {
        const top = y < y0 + 2;
        const side = x === x0 + 6;
        put(px, x, y, top ? (x === x0 ? P.clay[4]! : P.clay[5]!) : side ? P.clay[1]! : y === y0 + 4 ? P.clay[2]! : P.clay[3]!);
      }
    }
  };
  brick(0, 9);
  brick(8, 9);
  brick(4, 3);
  return px;
}

function wheat(): Px {
  const px: Px = new Map();
  const tie = { x: 7.5, y: 9 };
  const line = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) put(px, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  };
  const heads = [2, 5, 8, 11, 13];
  heads.forEach((hx, i) => line(tie.x, tie.y, hx, 5 - Math.abs(i - 2) * 0.5 + 1, P.wheat[1]!));
  [4, 6, 9, 11].forEach((bx) => line(tie.x, tie.y, bx, 15, P.wheat[2]!));
  heads.forEach((hx, i) => {
    const top = 1 + Math.abs(i - 2);
    for (let k = 0; k < 4; k++) {
      put(px, hx, top + k, k % 2 ? P.wheat[3]! : P.wheat[4]!);
      put(px, hx + 1, top + k, k % 2 ? P.wheat[4]! : P.wheat[2]!);
    }
  });
  for (let x = 6; x <= 9; x++) put(px, x, 9, P.trunk[2]!);
  for (let x = 6; x <= 9; x++) put(px, x, 10, P.trunk[1]!);
  return px;
}

function sheep(): Px {
  const px: Px = new Map();
  const head = hex("#34282a");
  put(px, 4, 12, head);
  put(px, 4, 13, head);
  put(px, 10, 12, head);
  put(px, 10, 13, head);
  ellipse(px, 8, 8, 6, 4.4, (x, y, dx, dy) => ramp(P.wool, 0.62 - dx * 0.2 - dy * 0.45 + noise(x, y, 7) * 0.2, x, y));
  for (let y = 5; y <= 9; y++) {
    put(px, 1, y, head);
    put(px, 2, y, head);
  }
  put(px, 3, 5, head);
  put(px, 1, 6, hex("#f2ece0"));
  return px;
}

function ore(): Px {
  const px: Px = new Map();
  ellipse(px, 6, 10, 5, 4, (x, y, dx, dy) => ramp(P.stone, 0.6 - dx * 0.35 - dy * 0.4, x, y));
  ellipse(px, 11, 11, 4, 3, (x, y, dx, dy) => ramp(P.stone, 0.5 - dx * 0.35 - dy * 0.4, x, y));
  ellipse(px, 9, 5.5, 3.5, 3.5, (x, y, dx, dy) => ramp(P.stone, 0.7 - dx * 0.35 - dy * 0.4, x, y));
  // glinting vein
  const vein = [hex("#6fb6d8"), hex("#bfe8f4"), hex("#ffffff")];
  put(px, 5, 9, vein[0]!);
  put(px, 6, 8, vein[1]!);
  put(px, 7, 9, vein[0]!);
  put(px, 9, 4, vein[2]!);
  put(px, 12, 10, vein[1]!);
  return px;
}

const STEEL = [hex("#3c4250"), hex("#68707e"), hex("#9aa2ae"), hex("#d6dbe2")];
const GLOW = [hex("#c8661c"), hex("#f0a03a"), hex("#ffd877"), hex("#fff4c8")];

function helmet(): Px {
  const px: Px = new Map();
  ellipse(px, 8, 8.5, 5.5, 6, (x, y, dx, dy) => ramp(STEEL, 0.6 - dx * 0.4 - dy * 0.3, x, y));
  for (let x = 4; x <= 12; x++) put(px, x, 14, STEEL[1]!);
  for (let x = 5; x <= 11; x++) put(px, x, 8, STEEL[0]!);
  for (const x of [6, 8, 10]) put(px, x, 10, STEEL[0]!);
  // plume
  const red = [hex("#7a1c16"), hex("#b8322a"), hex("#e2604a")];
  for (let k = 0; k < 6; k++) {
    put(px, 8 + Math.round(k * 0.9), 2 - Math.round(Math.sin(k / 2) * 1.5) + 1, red[k % 3]!);
    put(px, 8 + Math.round(k * 0.9), 3 - Math.round(Math.sin(k / 2) * 1.5) + 1, red[(k + 1) % 3]!);
  }
  return px;
}

function lantern(): Px {
  const px: Px = new Map();
  const iron = P.trunk[0]!;
  put(px, 7, 0, iron);
  put(px, 8, 0, iron);
  for (let x = 5; x <= 10; x++) put(px, x, 2, STEEL[1]!);
  for (let x = 6; x <= 9; x++) put(px, x, 1, STEEL[2]!);
  for (let y = 3; y <= 11; y++) {
    for (let x = 5; x <= 10; x++) {
      const frame = x === 5 || x === 10;
      const d = Math.hypot(x - 7.5, y - 7) / 4;
      put(px, x, y, frame ? STEEL[0]! : ramp(GLOW, 1 - d, x, y));
    }
  }
  for (let x = 4; x <= 11; x++) put(px, x, 12, STEEL[1]!);
  for (let x = 5; x <= 10; x++) put(px, x, 13, STEEL[0]!);
  return px;
}

function signpost(): Px {
  const px: Px = new Map();
  for (let y = 2; y <= 15; y++) {
    put(px, 7, y, P.trunk[1]!);
    put(px, 8, y, P.trunk[2]!);
  }
  const plank = (x0: number, y0: number, dir: 1 | -1) => {
    for (let x = 0; x < 9; x++) {
      for (let y = 0; y < 3; y++) {
        const tip = dir === 1 ? x === 8 && y !== 1 : x === 0 && y !== 1;
        if (!tip) put(px, x0 + x, y0 + y, y === 0 ? P.sand[3]! : P.soil[3]!);
      }
    }
  };
  plank(6, 3, 1);
  plank(1, 8, -1);
  return px;
}

function sack(): Px {
  const px: Px = new Map();
  ellipse(px, 8, 10, 6, 5.5, (x, y, dx, dy) => ramp(P.sand, 0.6 - dx * 0.35 - dy * 0.35, x, y));
  for (let x = 6; x <= 10; x++) put(px, x, 4, P.sand[2]!);
  for (let x = 6; x <= 10; x++) put(px, x, 5, P.trunk[1]!);
  // grain spilling over the top
  for (const [x, y] of [
    [6, 2],
    [7, 1],
    [8, 2],
    [9, 1],
    [10, 2],
    [7, 3],
    [9, 3],
    [8, 3],
  ] as const)
    put(px, x, y, (x + y) % 2 ? P.wheat[4]! : P.wheat[3]!);
  return px;
}

function crown(): Px {
  const px: Px = new Map();
  for (let y = 7; y <= 12; y++) for (let x = 2; x <= 13; x++) put(px, x, y, y === 12 ? P.gold[1]! : y === 7 ? P.gold[4]! : P.gold[3 - (x > 9 ? 1 : 0)]!);
  for (const cx of [2, 7, 13]) {
    for (let k = 1; k <= 4; k++) {
      put(px, cx, 7 - k, P.gold[3]!);
      if (cx === 7) put(px, 8, 7 - k, P.gold[2]!);
    }
  }
  put(px, 4, 6, P.gold[3]!);
  put(px, 11, 6, P.gold[3]!);
  put(px, 5, 9, hex("#c4352a"));
  put(px, 7, 9, hex("#3a7ad0"));
  put(px, 8, 9, hex("#3a7ad0"));
  put(px, 10, 9, hex("#c4352a"));
  return px;
}

export const ICONS = { wood: logs, brick: bricks, sheep, wheat, ore } as const;
export const DEV_ICONS = { knight: helmet, victory: lantern, roads: signpost, plenty: sack, monopoly: crown } as const;
export type IconName = keyof typeof ICONS;
export type DevIconName = keyof typeof DEV_ICONS;

const OUTLINE: Record<IconName | DevIconName, RGB> = {
  wood: P.trunk[0]!,
  brick: P.clay[0]!,
  sheep: hex("#3a3230"),
  wheat: P.wheat[0]!,
  ore: P.stone[0]!,
  knight: hex("#22252e"),
  victory: hex("#1c140e"),
  roads: P.trunk[0]!,
  plenty: P.soil[0]!,
  monopoly: P.gold[0]!,
};

export function icon(name: IconName | DevIconName): Raster {
  const r = new Raster(16, 16);
  const draw = name in ICONS ? ICONS[name as IconName] : DEV_ICONS[name as DevIconName];
  stamp(r, draw(), 0, 0, OUTLINE[name]);
  return r;
}

const DUSK = ["#1c1830", "#2a2448", "#3a3260", "#4c4278"].map(hex);

const SWATCH: Record<IconName | DevIconName, readonly RGB[]> = {
  knight: DUSK,
  victory: DUSK,
  roads: DUSK,
  plenty: DUSK,
  monopoly: DUSK,
  wood: P.floor,
  brick: P.clay.slice(2),
  sheep: P.meadow.slice(1),
  wheat: P.soil.slice(1),
  ore: P.stone.slice(2),
};

/** 24x34 card: ink border, gold frame, terrain swatch, icon on top. */
export function card(name: IconName | DevIconName): Raster {
  const W = 24;
  const H = 34;
  const r = new Raster(W, H);
  const gold = P.gold;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 1);
      if (corner) continue;
      if (edge === 0) r.set(x, y, P.ink);
      else if (edge === 1) r.set(x, y, x === 1 || y === 1 ? gold[4]! : gold[2]!);
      else r.set(x, y, mix(hex("#f4e8c8"), hex("#e2d0a0"), y / H));
    }
  }
  for (let y = 3; y < 25; y++) {
    for (let x = 3; x < W - 3; x++) {
      const t = 0.3 + noise(x / 3, y / 3, 3) * 0.5 + (y < 12 ? 0.1 : 0);
      r.set(x, y, ramp(SWATCH[name], t, x, y));
    }
  }
  for (let x = 3; x < W - 3; x++) r.set(x, 25, gold[1]!);
  const glyph = icon(name);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const a = glyph.alpha(x, y);
      if (!a) continue;
      const c = glyph.get(x, y)!;
      const tx = x + 4;
      const ty = y + 6;
      r.set(tx, ty, a === 255 ? c : mix(r.get(tx, ty)!, [0, 0, 0], 0.3));
    }
  }
  // three marks in the footer, like a stamp
  for (const x of [9, 11, 13]) r.set(x, 29, gold[1]!);
  return r;
}
