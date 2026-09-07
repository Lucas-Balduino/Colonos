import { Assets, Texture } from "pixi.js";
import { ALL_SPRITE_URLS } from "./assets.ts";

let cache: Record<string, Texture> | null = null;
let inflight: Promise<Record<string, Texture>> | null = null;
const listeners = new Set<(p: number) => void>();

export function preloadSprites(onProgress?: (p: number) => void): Promise<Record<string, Texture>> {
  if (onProgress) {
    listeners.add(onProgress);
    if (cache) onProgress(1);
  }
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = Assets.load(ALL_SPRITE_URLS, (p: number) => {
      listeners.forEach((fn) => fn(p));
    }).then((loaded) => {
      const next: Record<string, Texture> = {};
      const bag = loaded as Record<string, Texture> | Texture[];
      for (let i = 0; i < ALL_SPRITE_URLS.length; i++) {
        const url = ALL_SPRITE_URLS[i]!;
        const tex = Array.isArray(bag) ? bag[i] : bag[url];
        if (tex) {
          tex.source.scaleMode = "nearest";
          next[url] = tex;
        }
      }
      cache = next;
      listeners.forEach((fn) => fn(1));
      return next;
    });
  }
  return inflight;
}
