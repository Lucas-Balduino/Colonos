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
    inflight = (async () => {
      const next: Record<string, Texture> = {};
      let done = 0;
      const total = ALL_SPRITE_URLS.length;
      await Promise.all(
        ALL_SPRITE_URLS.map(async (url) => {
          try {
            const tex = (await Assets.load(url)) as Texture;
            // every sprite is drawn one texel per world pixel, like the robber
            tex.source.scaleMode = "nearest";
            next[url] = tex;
          } catch {
            /* optional slice missing */
          } finally {
            done += 1;
            listeners.forEach((fn) => fn(done / total));
          }
        }),
      );
      cache = next;
      listeners.forEach((fn) => fn(1));
      return next;
    })();
  }
  return inflight;
}
