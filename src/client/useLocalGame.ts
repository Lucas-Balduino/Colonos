import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { botDelayMs, nextBotAction } from "../ai/bot.ts";
import { createGame, reduce } from "../core/reduce.ts";
import { projectStateFor } from "../core/view.ts";
import type { Action, CreateGameOptions, GameState, PlayerId, PublicView } from "../core/types.ts";

export function useLocalGame(opts: CreateGameOptions, viewerId: PlayerId, initial?: GameState) {
  const [state, setState] = useState<GameState>(() => initial ?? createGame(opts));
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback(
    (action: Action) => {
      const r = reduce(stateRef.current, action);
      if (!r.ok) {
        toast.error(r.error.message);
        return false;
      }
      stateRef.current = r.state;
      setState(r.state);
      return true;
    },
    [],
  );

  useEffect(() => {
    if (state.phase.type === "gameOver") return;
    const act = nextBotAction(state);
    if (!act) return;
    const t = window.setTimeout(() => {
      const r = reduce(stateRef.current, act);
      if (r.ok) {
        stateRef.current = r.state;
        setState(r.state);
      }
    }, botDelayMs());
    return () => window.clearTimeout(t);
  }, [state]);

  const view: PublicView = projectStateFor(state, viewerId);
  return { state, view, dispatch, viewerId, setState };
}
