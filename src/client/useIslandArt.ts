import { useEffect, useState } from "react";
import { CanvasSource, Texture } from "pixi.js";
import { paintIsland } from "../art/world.ts";
import type { Board } from "../core/types.ts";

export interface IslandTexture {
  texture: Texture;
  x: number;
  y: number;
  scale: number;
}

interface Painted {
  data: Uint8ClampedArray;
  w: number;
  h: number;
  x: number;
  y: number;
  scale: number;
}

const SCALE = 2;
const cache = new Map<string, Promise<IslandTexture>>();

function boardKey(board: Board): string {
  return Object.values(board.hexes)
    .map((h) => `${h.id}:${h.terrain}`)
    .sort()
    .join("|");
}

function paint(board: Board): Promise<Painted> {
  if (typeof Worker === "undefined") {
    const art = paintIsland(board, SCALE);
    return Promise.resolve({ data: art.raster.data, w: art.raster.w, h: art.raster.h, x: art.x, y: art.y, scale: art.scale });
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../art/island.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<Painted>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = (event) => {
      reject(event);
      worker.terminate();
    };
    worker.postMessage({ board, scale: SCALE });
  });
}

function toTexture(p: Painted): IslandTexture {
  const canvas = document.createElement("canvas");
  canvas.width = p.w;
  canvas.height = p.h;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: "linear" });
  return { texture: new Texture({ source }), x: p.x, y: p.y, scale: p.scale };
}

/** The island picture for this map, painted once per layout off the main thread. */
export function useIslandArt(board: Board): IslandTexture | null {
  const key = boardKey(board);
  const [art, setArt] = useState<{ key: string; art: IslandTexture } | null>(null);
  useEffect(() => {
    let live = true;
    let job = cache.get(key);
    if (!job) {
      job = paint(board).then(toTexture);
      cache.set(key, job);
      if (cache.size > 3) cache.delete(cache.keys().next().value!);
    }
    job.then(
      (done) => {
        if (live) setArt({ key, art: done });
      },
      () => cache.delete(key),
    );
    return () => {
      live = false;
    };
    // the key captures everything the picture depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return art?.key === key ? art.art : null;
}
