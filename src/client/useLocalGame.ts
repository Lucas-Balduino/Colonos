import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { botDelayMs, nextBotAction } from "../ai/bot.ts";
import { createGame, reduce } from "../core/reduce.ts";
import { projectStateFor } from "../core/view.ts";
import type { Action, CreateGameOptions, GameEvent, GameState, PlayerId, PublicView } from "../core/types.ts";
import { fxRemainingMs, type EventBatch } from "./fx/batch.ts";

export function useLocalGame(opts: CreateGameOptions, viewerId: PlayerId, initial?: GameState) {
  const [state, setState] = useState<GameState>(() => initial ?? createGame(opts));
  const [events, setEvents] = useState<EventBatch>({ seq: 0, events: [] });
  const stateRef = useRef(state);
  const seqRef = useRef(0);
  stateRef.current = state;

  const publish = useCallback((next: GameState, evts: GameEvent[]) => {
    stateRef.current = next;
    seqRef.current += 1;
    setState(next);
    setEvents({ seq: seqRef.current, events: evts });
  }, []);

  const dispatch = useCallback(
    (action: Action) => {
      const r = reduce(stateRef.current, action);
      if (!r.ok) {
        toast.error(r.error.message);
        return false;
      }
      publish(r.state, r.events);
      return true;
    },
    [publish],
  );

  useEffect(() => {
    if (state.phase.type === "gameOver") return;
    const act = nextBotAction(state);
    if (!act) return;
    const remaining = fxRemainingMs();
    const delay = remaining > 0 ? Math.min(900, remaining) : Math.min(900, botDelayMs());
    const t = window.setTimeout(() => {
      const current = nextBotAction(stateRef.current);
      if (!current) return;
      const r = reduce(stateRef.current, current);
      if (r.ok) publish(r.state, r.events);
    }, delay);
    return () => window.clearTimeout(t);
  }, [state, publish]);

  const view: PublicView = projectStateFor(state, viewerId);
  return { state, view, dispatch, viewerId, setState, events };
}
