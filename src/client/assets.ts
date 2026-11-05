export const HEX_SIZE = 56;
export const SPRITE_SIZE = 32;
export const HEX_SPRITE_ANCHOR = { x: 0.5, y: 0.5 } as const;

export const FACTION_ID: Record<string, FactionId> = {
  "#c44536": "red",
  "#2b6cb0": "blue",
  "#d97706": "orange",
  "#e8e0d0": "ivory",
};

export type FactionId = "red" | "blue" | "orange" | "ivory";

export const CHIP_SPRITE: Record<string, string> = {
  wood: "/sprites/chip-wood.png",
  brick: "/sprites/chip-brick.png",
  sheep: "/sprites/chip-sheep.png",
  wheat: "/sprites/chip-wheat.png",
  ore: "/sprites/chip-ore.png",
};

export const CARD_SPRITE: Record<string, string> = {
  wood: "/sprites/card-wood.png",
  brick: "/sprites/card-brick.png",
  sheep: "/sprites/card-sheep.png",
  wheat: "/sprites/card-wheat.png",
  ore: "/sprites/card-ore.png",
  knight: "/sprites/card-knight.png",
  victory: "/sprites/card-victory.png",
  roadBuilding: "/sprites/card-roads.png",
  yearOfPlenty: "/sprites/card-plenty.png",
  monopoly: "/sprites/card-monopoly.png",
};

export function settlementSprite(color: string): string {
  return `/sprites/settlement-${FACTION_ID[color] ?? "ivory"}.png`;
}

export function citySprite(color: string): string {
  return `/sprites/city-${FACTION_ID[color] ?? "ivory"}.png`;
}

export function roadSprite(color: string): string {
  return `/sprites/road-${FACTION_ID[color] ?? "ivory"}.png`;
}

export function diceSprite(n: number): string {
  return `/sprites/dice-${Math.min(6, Math.max(1, n))}.png`;
}

export const BOARD_URLS = [
  "/sprites/sea-tile.png",
  "/sprites/robber-0.png",
  "/sprites/robber-1.png",
  "/sprites/token.png",
  "/sprites/port-any.png",
  "/sprites/port-2.png",
  "/sprites/settlement-ghost.png",
  "/sprites/city-ghost.png",
  ...["red", "blue", "orange", "ivory"].flatMap((id) => [
    `/sprites/settlement-${id}.png`,
    `/sprites/city-${id}.png`,
    `/sprites/road-${id}.png`,
  ]),
];

export const HUD_URLS = [
  ...Object.values(CARD_SPRITE),
  ...Object.values(CHIP_SPRITE),
  ...[1, 2, 3, 4, 5, 6].map((n) => `/sprites/dice-${n}.png`),
];

export const ALL_SPRITE_URLS = [...new Set([...BOARD_URLS, ...HUD_URLS])];
