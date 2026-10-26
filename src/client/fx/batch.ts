import type { GameEvent } from "../../core/types.ts";

export interface EventBatch {
  seq: number;
  events: GameEvent[];
}

export function motionMs(ms: number): number {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return 83;
  }
  return ms;
}

let until = 0;

export function holdFx(ms: number): void {
  until = Math.max(until, performance.now() + ms);
}

export function fxRemainingMs(): number {
  return Math.max(0, until - performance.now());
}

export function eventDuration(event: GameEvent): number {
  switch (event.type) {
    case "produced":
      return motionMs(420);
    case "built":
      return motionMs(event.kind === "road" ? 240 : 180);
    case "stole":
      return motionMs(360);
    case "award":
      return motionMs(249);
    case "robberMoved":
      return motionMs(90);
    default:
      return 0;
  }
}
