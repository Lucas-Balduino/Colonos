import { useCallback, useSyncExternalStore } from "react";
import { useTick } from "@pixi/react";

const listeners = new Set<() => void>();
let frame = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getFrame() {
  return frame;
}

export function AnimClockProvider({ children }: { children: React.ReactNode }) {
  const tick = useCallback(() => {
    const next = Math.floor(performance.now() / 83);
    if (next === frame) return;
    frame = next;
    for (const listener of listeners) listener();
  }, []);
  useTick(tick);
  return children;
}

export function useAnimFrame(): number {
  return useSyncExternalStore(subscribe, getFrame, getFrame);
}

export function animFrameNow(): number {
  return Math.floor(performance.now() / 83);
}

/**
 * The robber's two-frame beat (about 380 ms per frame). Pieces share it; a
 * `phase` of 1 puts a piece on the off beat so the table does not blink in step.
 */
export function useIdleBeat(phase = 0): 0 | 1 {
  const get = useCallback(() => ((Math.floor((frame * 83) / 380) + phase) % 2) as 0 | 1, [phase]);
  return useSyncExternalStore(subscribe, get, get);
}
