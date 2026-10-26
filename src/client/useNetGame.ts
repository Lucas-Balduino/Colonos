import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Action, PublicView } from "../core/types.ts";
import type { ClientMsg, ServerMsg } from "../protocol.ts";
import type { EventBatch } from "./fx/batch.ts";

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
}

export function useNetGame() {
  const wsRef = useRef<WebSocket | null>(null);
  const [view, setView] = useState<PublicView | null>(null);
  const [events, setEvents] = useState<EventBatch>({ seq: 0, events: [] });
  const seqRef = useRef(0);
  const [lobby, setLobby] = useState<{
    code: string;
    playerId: string;
    token: string;
    host: boolean;
    players: Array<{ id: string; name: string; isBot: boolean }>;
  } | null>(null);
  const [connected, setConnected] = useState(false);

  const send = useCallback((msg: ClientMsg) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return wsRef.current;
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      if (msg.type === "error") toast.error(msg.message);
      if (msg.type === "joined") {
        setLobby({
          code: msg.code,
          playerId: msg.playerId,
          token: msg.token,
          host: msg.host,
          players: [],
        });
        localStorage.setItem("colonos-token", msg.token);
        localStorage.setItem("colonos-code", msg.code);
      }
      if (msg.type === "lobby") {
        setLobby((prev) =>
          prev
            ? { ...prev, code: msg.code, players: msg.players }
            : prev,
        );
      }
      if (msg.type === "view") {
        setView(msg.view);
        seqRef.current += 1;
        setEvents({ seq: seqRef.current, events: msg.events ?? [] });
      }
    };
    return ws;
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  const create = (name: string, bots: number, setup: "beginner" | "random") => {
    const ws = connect();
    const go = () => send({ type: "create", name, bots, setup });
    if (ws.readyState === WebSocket.OPEN) go();
    else ws.addEventListener("open", go, { once: true });
  };

  const join = (code: string, name: string, token?: string) => {
    const ws = connect();
    const go = () => send({ type: "join", code, name, token });
    if (ws.readyState === WebSocket.OPEN) go();
    else ws.addEventListener("open", go, { once: true });
  };

  const start = () => send({ type: "start" });
  const dispatch = (action: Action) => send({ type: "action", action });

  return { view, lobby, connected, create, join, start, dispatch, events };
}
