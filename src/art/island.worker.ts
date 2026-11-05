/// <reference lib="webworker" />
import type { Board } from "../core/types.ts";
import { paintIsland } from "./world.ts";

self.onmessage = (event: MessageEvent<{ board: Board; scale: number }>) => {
  const art = paintIsland(event.data.board, event.data.scale);
  const data = art.raster.data;
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    { data, w: art.raster.w, h: art.raster.h, x: art.x, y: art.y, scale: art.scale },
    [data.buffer],
  );
};
