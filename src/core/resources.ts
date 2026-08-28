import { RESOURCES, type Resource, type ResourceMap } from "./types.ts";

export function emptyResources(): ResourceMap {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function fullBank(n = 19): ResourceMap {
  return { wood: n, brick: n, sheep: n, wheat: n, ore: n };
}

export function cloneResources(r: ResourceMap): ResourceMap {
  return { ...r };
}

export function countResources(r: ResourceMap): number {
  return RESOURCES.reduce((sum, k) => sum + r[k], 0);
}

export function addTo(target: ResourceMap, add: Partial<ResourceMap>): void {
  for (const k of RESOURCES) {
    if (add[k]) target[k] += add[k]!;
  }
}

export function subFrom(target: ResourceMap, sub: Partial<ResourceMap>): boolean {
  for (const k of RESOURCES) {
    const n = sub[k] ?? 0;
    if (target[k] < n) return false;
  }
  for (const k of RESOURCES) {
    const n = sub[k] ?? 0;
    target[k] -= n;
  }
  return true;
}

export function hasAtLeast(r: ResourceMap, need: Partial<ResourceMap>): boolean {
  for (const k of RESOURCES) {
    if (r[k] < (need[k] ?? 0)) return false;
  }
  return true;
}

export function resourceList(r: ResourceMap): Resource[] {
  const list: Resource[] = [];
  for (const k of RESOURCES) {
    for (let i = 0; i < r[k]; i++) list.push(k);
  }
  return list;
}

export const COSTS = {
  road: { wood: 1, brick: 1 } as Partial<ResourceMap>,
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 } as Partial<ResourceMap>,
  city: { wheat: 2, ore: 3 } as Partial<ResourceMap>,
  dev: { sheep: 1, wheat: 1, ore: 1 } as Partial<ResourceMap>,
};

export const TERRAIN_RESOURCE: Record<Exclude<import("./types.ts").Terrain, "desert">, Resource> = {
  wood: "wood",
  brick: "brick",
  sheep: "sheep",
  wheat: "wheat",
  ore: "ore",
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: "Madeira",
  brick: "Tijolo",
  sheep: "Lã",
  wheat: "Trigo",
  ore: "Minério",
};

export const TERRAIN_LABEL: Record<import("./types.ts").Terrain, string> = {
  wood: "Floresta",
  brick: "Colina",
  sheep: "Pasto",
  wheat: "Campo",
  ore: "Montanha",
  desert: "Deserto",
};
