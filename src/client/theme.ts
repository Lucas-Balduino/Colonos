export const PALETTE = {
  night: 0x1a1520,
  wood: 0x3d2a1f,
  panel: 0x2a2133,
  parchment: 0xf4e8c8,
  gold: 0xd4a017,
  goldDark: 0x8a6410,
  forest: 0x2f6b32,
  pasture: 0x6db35c,
  wheat: 0xe0b33a,
  brick: 0xb24a32,
  stone: 0x5c6573,
  sand: 0xc2a366,
  sea: 0x16344a,
  foam: 0x9ad1e5,
} as const;

export const FACTION_HEX: Record<string, number> = {
  "#c44536": 0xc44536,
  "#2b6cb0": 0x2b6cb0,
  "#d97706": 0xd97706,
  "#e8e0d0": 0xe8e0d0,
};

export const TERRAIN_COLOR: Record<string, number> = {
  wood: PALETTE.forest,
  brick: PALETTE.brick,
  sheep: PALETTE.pasture,
  wheat: PALETTE.wheat,
  ore: PALETTE.stone,
  desert: PALETTE.sand,
};

export { HEX_SIZE, SPRITE_SIZE } from "./assets.ts";

/** Darkens (k < 0) or lightens (k > 0) a 0xRRGGBB color by a 0..1 factor. */
export function shade(color: number, k: number): number {
  const ch = (shift: number) => {
    const c = (color >> shift) & 0xff;
    const v = k < 0 ? c * (1 + k) : c + (255 - c) * k;
    return Math.max(0, Math.min(255, Math.round(v))) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}
