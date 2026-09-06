export const HEX_SIZE = 48;
export const SPRITE_SIZE = 32;

export const FACTION_ID: Record<string, FactionId> = {
  "#c44536": "red",
  "#2b6cb0": "blue",
  "#d97706": "orange",
  "#e8e0d0": "ivory",
};

export type FactionId = "red" | "blue" | "orange" | "ivory";

export const TERRAIN_SPRITE: Record<string, string> = {
  wood: "/sprites/hex-wood.png",
  brick: "/sprites/hex-brick.png",
  sheep: "/sprites/hex-sheep.png",
  wheat: "/sprites/hex-wheat.png",
  ore: "/sprites/hex-ore.png",
  desert: "/sprites/hex-desert.png",
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
  ...Object.values(TERRAIN_SPRITE),
  "/sprites/hex-sea.png",
  "/sprites/robber-0.png",
  "/sprites/robber-1.png",
  "/sprites/token.png",
  "/sprites/port-any.png",
  "/sprites/port-2.png",
  ...["red", "blue", "orange", "ivory"].flatMap((id) => [
    `/sprites/settlement-${id}.png`,
    `/sprites/city-${id}.png`,
    `/sprites/road-${id}.png`,
  ]),
];
