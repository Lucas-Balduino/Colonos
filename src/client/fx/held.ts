import { useEffect, useMemo, useRef, useState } from "react";
import { emptyResources } from "../../core/resources.ts";
import { RESOURCES, type ResourceMap } from "../../core/types.ts";
import { motionMs, type EventBatch } from "./batch.ts";

export function useHeldResources(
  actual: ResourceMap,
  batch: EventBatch | undefined,
  viewerId: string | null,
): ResourceMap {
  const inflight = useRef(emptyResources());
  const seen = useRef(0);
  const viewer = useRef(viewerId);
  const timers = useRef<number[]>([]);
  const [tick, setTick] = useState(0);

  if (viewer.current !== viewerId) {
    viewer.current = viewerId;
    inflight.current = emptyResources();
    seen.current = batch?.seq ?? 0;
  }

  if (batch && batch.seq !== 0 && batch.seq !== seen.current) {
    seen.current = batch.seq;
    const add = emptyResources();
    for (const event of batch.events) {
      if (event.type !== "produced" || event.playerId !== viewerId || event.amount <= 0) continue;
      add[event.resource] += event.amount;
      inflight.current[event.resource] += event.amount;
    }
    if (RESOURCES.some((resource) => add[resource] > 0)) {
      const timer = window.setTimeout(() => {
        for (const resource of RESOURCES) {
          inflight.current[resource] = Math.max(0, inflight.current[resource] - add[resource]);
        }
        setTick((value) => value + 1);
      }, motionMs(420));
      timers.current.push(timer);
    }
  }

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  return useMemo(() => {
    const shown = emptyResources();
    for (const resource of RESOURCES) {
      shown[resource] = Math.max(0, actual[resource] - inflight.current[resource]);
    }
    return shown;
  }, [actual, tick]);
}
