import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { botDelayMs, botTradeDelayMs, nextBotAction, pendingBotTrades, whoseTurn } from "../ai/bot.ts";
import { createGame, reduce } from "../core/reduce.ts";
import { projectStateFor } from "../core/view.ts";
import type { Action, CreateGameOptions, GameEvent, GameState, PlayerId, PublicView } from "../core/types.ts";
import { fxRemainingMs, type EventBatch } from "./fx/batch.ts";
import { clearSoloSave, writeSoloSave } from "./solo-save.ts";

export function useLocalGame(opts: CreateGameOptions, viewerId: PlayerId, initial?: GameState, persist = false) {
  const [state, setState] = useState<GameState>(() => initial ?? createGame(opts));
  const [events, setEvents] = useState<EventBatch>({ seq: 0, events: [] });
  const stateRef = useRef(state);
  const seqRef = useRef(0);
  const tradeArmed = useRef(new Set<string>());
  const tradeTimers = useRef<number[]>([]);
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
    const timers = tradeTimers.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (state.phase.type === "gameOver") return;
    for (const key of tradeArmed.current) {
      const offerId = key.slice(0, key.indexOf(":"));
      if (!state.tradeOffers.some((offer) => offer.id === offerId)) tradeArmed.current.delete(key);
    }
    for (const act of pendingBotTrades(state)) {
      if (act.type !== "ACCEPT_TRADE" && act.type !== "REJECT_TRADE") continue;
      const offer = state.tradeOffers.find((item) => item.id === act.offerId);
      const status = offer?.responses[act.playerId] ?? "pending";
      const key = `${act.offerId}:${act.playerId}:${status}`;
      if (tradeArmed.current.has(key)) continue;
      tradeArmed.current.add(key);
      const timer = window.setTimeout(() => {
        const current = stateRef.current;
        const offerNow = current.tradeOffers.find((item) => item.id === act.offerId);
        if ((offerNow?.responses[act.playerId] ?? "pending") !== status) return;
        const fresh = pendingBotTrades(current).find(
          (item) => item.type === act.type && item.offerId === act.offerId && item.playerId === act.playerId,
        );
        if (!fresh) return;
        const result = reduce(current, fresh);
        if (result.ok) publish(result.state, result.events);
      }, botTradeDelayMs());
      tradeTimers.current.push(timer);
    }

    const actor = state.players.find((player) => player.id === whoseTurn(state));
    if (!actor?.isBot) return;
    const act = nextBotAction(state);
    if (!act || act.type === "ACCEPT_TRADE" || act.type === "REJECT_TRADE") return;
    const setupPiece = state.phase.type === "setupSettlement" || state.phase.type === "setupRoad";
    const remaining = fxRemainingMs();
    const delay = setupPiece ? 900 : remaining > 0 ? Math.min(900, remaining) : Math.min(900, botDelayMs());
    const timer = window.setTimeout(() => {
      const current = nextBotAction(stateRef.current);
      if (!current || current.type === "ACCEPT_TRADE" || current.type === "REJECT_TRADE") return;
      const result = reduce(stateRef.current, current);
      if (result.ok) publish(result.state, result.events);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state, publish]);

  useEffect(() => {
    if (!persist) return;
    if (state.phase.type === "gameOver") {
      clearSoloSave();
      return;
    }
    writeSoloSave({ state, opts });
  }, [persist, state, opts]);

  const view: PublicView = projectStateFor(state, viewerId);
  return { state, view, dispatch, viewerId, setState, events };
}
