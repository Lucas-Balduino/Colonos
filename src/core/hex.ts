import type { Axial, HexId } from "./types.ts";

export const HEX_DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

export function hexId(q: number, r: number): HexId {
  return `${q},${r}`;
}

export function parseHexId(id: HexId): Axial {
  const [q, r] = id.split(",").map(Number);
  return { q, r };
}

export function cubeDistance(a: Axial, b: Axial = { q: 0, r: 0 }): number {
  const as = -a.q - a.r;
  const bs = -b.q - b.r;
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(as - bs)) / 2;
}

export function addAxial(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function scaleAxial(a: Axial, k: number): Axial {
  return { q: a.q * k, r: a.r * k };
}

export function landHexes(radius = 2): Axial[] {
  const out: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (cubeDistance({ q, r }) <= radius) out.push({ q, r });
    }
  }
  return out;
}

/** Outer ring first, counterclockwise, ending at center. */
export function spiralOuterFirst(radius = 2): Axial[] {
  const out: Axial[] = [];
  for (let ring = radius; ring >= 1; ring--) {
    let hex = scaleAxial(HEX_DIRS[4], ring);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < ring; j++) {
        out.push({ ...hex });
        hex = addAxial(hex, HEX_DIRS[i]);
      }
    }
  }
  out.push({ q: 0, r: 0 });
  return out;
}

export function pointyHexToPixel(hex: Axial, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (hex.q + hex.r / 2),
    y: size * (3 / 2) * hex.r,
  };
}

export function hexCorner(center: { x: number; y: number }, size: number, i: number) {
  const angle = ((60 * i - 30) * Math.PI) / 180;
  return {
    x: center.x + size * Math.cos(angle),
    y: center.y + size * Math.sin(angle),
  };
}
