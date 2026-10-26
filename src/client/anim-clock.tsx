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
