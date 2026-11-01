import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Action, PublicView } from "../core/types.ts";
import type { ClientMsg, LobbySeat, ServerMsg } from "../protocol.ts";
import type { EventBatch } from "./fx/batch.ts";

/** The seat this browser holds in an online room, kept across reloads. */
export interface NetSession {
  code: string;
  token: string;
  playerId: string;
}

const SESSION_KEY = "colonos-sala-v1";

/**
 * "tab" is this tab's own seat (survives a reload, never shared between tabs).
 * "any" also finds the last seat used in this browser, for the lobby button.
 */
export function readNetSession(scope: "tab" | "any" = "any"): NetSession | null {
  const read = (store: Storage) => {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as NetSession;
      return s?.code && s.token && s.playerId ? s : null;
    } catch {
      return null;
    }
  };
  return read(sessionStorage) ?? (scope === "any" ? read(localStorage) : null);
}

function writeNetSession(s: NetSession | null): void {
  for (const store of [sessionStorage, localStorage]) {
    try {
      if (s) store.setItem(SESSION_KEY, JSON.stringify(s));
      else store.removeItem(SESSION_KEY);
    } catch {
      /* storage blocked: the seat just won't survive a reload */
    }
  }
}

export type NetIntent =
  | { mode: "host"; name: string; bots: number; setup: "beginner" | "random" }
  | { mode: "join"; name: string; code: string }
  | { mode: "resume"; session: NetSession };

export type NetStatus = "connecting" | "online" | "reconnecting" | "gone";

export interface NetLobby {
  code: string;
  hostId: string;
  setup: "beginner" | "random";
  players: LobbySeat[];
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
}

/**
 * One online seat. Reconnects on its own with growing waits, and always
 * rejoins with the saved token, so a reload or a dropped Wi-Fi lands back on
 * the same seat.
 */
export function useNetGame(intent: NetIntent) {
  const [view, setView] = useState<PublicView | null>(null);
  const [events, setEvents] = useState<EventBatch>({ seq: 0, events: [] });
  const [lobby, setLobby] = useState<NetLobby | null>(null);
  const [session, setSession] = useState<NetSession | null>(intent.mode === "resume" ? intent.session : null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [status, setStatus] = useState<NetStatus>("connecting");
  const [goneReason, setGoneReason] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef(session);
  const doneRef = useRef(false);
  const triesRef = useRef(0);
  const timerRef = useRef(0);
  const seqRef = useRef(0);
  sessionRef.current = session;

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const connect = useCallback(() => {
    if (doneRef.current) return;
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      triesRef.current = 0;
      const s = sessionRef.current;
      if (s) ws.send(JSON.stringify({ type: "join", code: s.code, name: "", token: s.token } satisfies ClientMsg));
      else if (intent.mode === "host")
        ws.send(JSON.stringify({ type: "create", name: intent.name, bots: intent.bots, setup: intent.setup } satisfies ClientMsg));
      else if (intent.mode === "join")
        ws.send(JSON.stringify({ type: "join", code: intent.code, name: intent.name } satisfies ClientMsg));
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      if (msg.type === "joined") {
        const s = { code: msg.code, token: msg.token, playerId: msg.playerId };
        writeNetSession(s);
        setSession(s);
        setStatus("online");
      } else if (msg.type === "lobby") {
        setLobby({ code: msg.code, hostId: msg.hostId, setup: msg.setup, players: msg.players });
        setHostId(msg.hostId);
        setView(null);
      } else if (msg.type === "view") {
        setView(msg.view);
        setHostId(msg.hostId);
        seqRef.current += 1;
        setEvents({ seq: seqRef.current, events: msg.events ?? [] });
      } else if (msg.type === "error") {
        if (msg.code === "room-gone" || msg.code === "replaced" || msg.code === "full" || msg.code === "started") {
          if (msg.code !== "replaced") writeNetSession(null);
          doneRef.current = true;
          setGoneReason(msg.message);
          setStatus("gone");
          ws.close();
          return;
        }
        toast.error(msg.message);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws || doneRef.current) return;
      setStatus("reconnecting");
      const wait = Math.min(8000, 500 * 2 ** triesRef.current);
      triesRef.current += 1;
      timerRef.current = window.setTimeout(connect, wait);
    };
    // intent is fixed for the life of this hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    doneRef.current = false;
    connect();
    return () => {
      doneRef.current = true;
      window.clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Coming back to a sleeping tab: don't wait for the backoff.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== "visible" || doneRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        window.clearTimeout(timerRef.current);
        connect();
      }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [connect]);

  const leave = useCallback(() => {
    send({ type: "leave" });
    writeNetSession(null);
    doneRef.current = true;
    window.setTimeout(() => wsRef.current?.close(), 50);
  }, [send]);

  const start = useCallback(() => send({ type: "start" }), [send]);
  const dispatch = useCallback(
    (action: Action) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        toast.error("Sem conexão. Tentando reconectar…");
        return false;
      }
      send({ type: "action", action });
      return true;
    },
    [send],
  );

  return {
    view,
    events,
    lobby,
    session,
    isHost: Boolean(session && hostId === session.playerId),
    status,
    goneReason,
    start,
    leave,
    dispatch,
  };
}
