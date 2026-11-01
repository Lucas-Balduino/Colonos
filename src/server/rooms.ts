import type { WebSocket } from "ws";
import { createGame, reduce } from "../core/reduce.ts";
import { projectEventsFor, projectStateFor } from "../core/view.ts";
import { nextBotAction, staleBotOffer, type BotSeat } from "../ai/bot.ts";
import type { ClientMsg, ErrorCode, ServerMsg } from "../protocol.ts";
import type { GameEvent, GameState, PlayerId, Presence } from "../core/types.ts";
import { parseClientMsg } from "./validate.ts";

/**
 * In-memory rooms. A seat belongs to whoever holds its token, so a reload or
 * a dropped connection can come back to the same seat. A human who stays away
 * during a game is played by a bot until they return.
 */

export interface RoomOptions {
  /** How long a dropped player keeps their turn before a bot takes over. */
  autopilotMs: number;
  /** How long a dropped player keeps their seat in a room that hasn't started. */
  lobbyGraceMs: number;
  botDelayMs: number;
  /** A bot's offer that only people still have to answer is withdrawn after this. */
  staleOfferMs: number;
  /** A room nobody is connected to is deleted after this. */
  idleRoomMs: number;
  heartbeatMs: number;
}

const DEFAULTS: RoomOptions = {
  autopilotMs: 60_000,
  lobbyGraceMs: 60_000,
  botDelayMs: 520,
  staleOfferMs: 15_000,
  idleRoomMs: 30 * 60_000,
  heartbeatMs: 15_000,
};

const COLORS = ["#c44536", "#2b6cb0", "#d97706", "#e8e0d0"];
const BOT_NAMES = ["Marinheiro", "Lenhadora", "Mineiro", "Pescadora"];

interface Seat {
  id: PlayerId;
  name: string;
  color: string;
  isBot: boolean;
  token?: string;
  socket: WebSocket | null;
  autopilot: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

interface Room {
  code: string;
  hostId: PlayerId;
  setup: "beginner" | "random";
  seats: Seat[];
  state: GameState | null;
  botTimer?: ReturnType<typeof setTimeout>;
  lastActive: number;
  nextSeat: number;
}

interface Binding {
  room: Room;
  seat: Seat;
}

export function createRoomServer(options: Partial<RoomOptions> = {}) {
  const o: RoomOptions = { ...DEFAULTS, ...options };
  const rooms = new Map<string, Room>();
  const bindings = new Map<WebSocket, Binding>();
  const alive = new Map<WebSocket, boolean>();

  // ---------- sending ----------

  function send(ws: WebSocket | null, msg: ServerMsg): void {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  function fail(ws: WebSocket, message: string, code?: ErrorCode): void {
    send(ws, { type: "error", message, code });
  }

  function presence(seat: Seat): Presence {
    if (seat.isBot) return "bot";
    if (seat.autopilot) return "autopilot";
    return seat.socket ? "online" : "away";
  }

  function broadcastLobby(room: Room): void {
    const msg: ServerMsg = {
      type: "lobby",
      code: room.code,
      hostId: room.hostId,
      setup: room.setup,
      players: room.seats.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        isBot: s.isBot,
        online: s.isBot || Boolean(s.socket),
      })),
    };
    for (const seat of room.seats) send(seat.socket, msg);
  }

  function viewFor(room: Room, seat: Seat, events: GameEvent[]): ServerMsg | null {
    if (!room.state) return null;
    const view = projectStateFor(room.state, seat.id);
    view.presence = Object.fromEntries(room.seats.map((s) => [s.id, presence(s)]));
    return { type: "view", view, events: projectEventsFor(events, seat.id), hostId: room.hostId };
  }

  function broadcast(room: Room, events: GameEvent[] = []): void {
    if (!room.state) {
      broadcastLobby(room);
      return;
    }
    for (const seat of room.seats) {
      if (!seat.socket) continue;
      const msg = viewFor(room, seat, events);
      if (msg) send(seat.socket, msg);
    }
  }

  // ---------- bots ----------

  function botSeat(room: Room): BotSeat {
    return (player) => {
      const seat = room.seats.find((s) => s.id === player.id);
      return Boolean(seat && (seat.isBot || seat.autopilot));
    };
  }

  function scheduleBots(room: Room): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = undefined;
    if (!room.state || room.state.phase.type === "gameOver") return;
    const isBot = botSeat(room);
    const act = nextBotAction(room.state, isBot);
    const stale = act ? null : staleBotOffer(room.state, isBot);
    if (!act && !stale) return;
    room.botTimer = setTimeout(
      () => {
        room.botTimer = undefined;
        if (!room.state) return;
        const next = act ? nextBotAction(room.state, isBot) : staleBotOffer(room.state, isBot);
        if (!next) return;
        const r = reduce(room.state, next);
        if (!r.ok) return;
        room.state = r.state;
        broadcast(room, r.events);
        scheduleBots(room);
      },
      act ? o.botDelayMs : o.staleOfferMs,
    );
  }

  function note(room: Room, text: string, playerId?: PlayerId): void {
    if (!room.state) return;
    room.state = { ...room.state, log: [...room.state.log, { text, playerId }].slice(-80) };
  }

  // ---------- seats ----------

  function humans(room: Room): Seat[] {
    return room.seats.filter((s) => !s.isBot);
  }

  function passHost(room: Room): void {
    const host = room.seats.find((s) => s.id === room.hostId);
    if (host && host.socket && !host.autopilot) return;
    const next = humans(room).find((s) => s.socket && !s.autopilot);
    if (next) room.hostId = next.id;
  }

  function closeRoom(room: Room): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    for (const seat of room.seats) if (seat.timer) clearTimeout(seat.timer);
    rooms.delete(room.code);
  }

  function bind(ws: WebSocket, room: Room, seat: Seat): void {
    unbind(ws, false);
    if (seat.socket && seat.socket !== ws) {
      const old = seat.socket;
      bindings.delete(old);
      fail(old, "Esta mesa foi aberta em outra aba.", "replaced");
      old.close();
    }
    if (seat.timer) clearTimeout(seat.timer);
    seat.timer = undefined;
    const returning = seat.autopilot;
    seat.socket = ws;
    seat.autopilot = false;
    bindings.set(ws, { room, seat });
    room.lastActive = Date.now();
    if (returning) note(room, `${seat.name} voltou à mesa.`, seat.id);
    passHost(room);
  }

  /** The socket stops speaking for its seat (closed, or used for another room). */
  function unbind(ws: WebSocket, closing: boolean): void {
    const b = bindings.get(ws);
    if (!b) return;
    bindings.delete(ws);
    const { room, seat } = b;
    if (seat.socket !== ws) return;
    seat.socket = null;
    room.lastActive = Date.now();
    if (seat.timer) clearTimeout(seat.timer);

    if (!room.state) {
      seat.timer = setTimeout(() => {
        if (seat.socket) return;
        room.seats = room.seats.filter((s) => s !== seat);
        if (humans(room).length === 0) return closeRoom(room);
        passHost(room);
        broadcastLobby(room);
      }, o.lobbyGraceMs);
      broadcastLobby(room);
      return;
    }

    seat.timer = setTimeout(() => {
      if (seat.socket || !room.state) return;
      seat.autopilot = true;
      note(room, `${seat.name} saiu da conexão. Um bot joga por ${seat.name} até a volta.`, seat.id);
      passHost(room);
      broadcast(room);
      scheduleBots(room);
    }, o.autopilotMs);
    if (closing) broadcast(room);
  }

  function newCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (;;) {
      let s = "";
      for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      if (!rooms.has(s)) return s;
    }
  }

  function freeColor(room: Room): string {
    return COLORS.find((c) => !room.seats.some((s) => s.color === c)) ?? COLORS[0]!;
  }

  function addSeat(room: Room, name: string, isBot: boolean): Seat {
    const seat: Seat = {
      id: `p${room.nextSeat++}`,
      name,
      color: freeColor(room),
      isBot,
      token: isBot ? undefined : crypto.randomUUID(),
      socket: null,
      autopilot: false,
    };
    room.seats.push(seat);
    return seat;
  }

  function botName(room: Room): string {
    return BOT_NAMES.find((n) => !room.seats.some((s) => s.name === n)) ?? "Bot";
  }

  /** "Você" is the lobby's placeholder; online it would read as someone else's "you". */
  function cleanName(room: Room, name: string, fallback: string): string {
    const trimmed = name.trim().replace(/\s+/g, " ");
    const base = trimmed.length > 0 && !/^voc[eê]$/i.test(trimmed) ? trimmed : fallback;
    let out = base;
    for (let n = 2; room.seats.some((s) => s.name === out); n++) out = `${base.slice(0, 13)} ${n}`;
    return out;
  }

  // ---------- messages ----------

  function handle(ws: WebSocket, msg: ClientMsg): void {
    if (msg.type === "create") {
      const room: Room = {
        code: newCode(),
        hostId: "",
        setup: msg.setup,
        seats: [],
        state: null,
        lastActive: Date.now(),
        nextSeat: 1,
      };
      const host = addSeat(room, cleanName(room, msg.name, "Anfitrião"), false);
      room.hostId = host.id;
      for (let i = 0; i < msg.bots && room.seats.length < 4; i++) addSeat(room, botName(room), true);
      rooms.set(room.code, room);
      bind(ws, room, host);
      send(ws, { type: "joined", code: room.code, token: host.token!, playerId: host.id, host: true });
      broadcastLobby(room);
      return;
    }

    if (msg.type === "join") {
      const room = rooms.get(msg.code);
      if (!room) return fail(ws, "Essa sala não existe mais.", "room-gone");
      const mine = msg.token ? room.seats.find((s) => s.token === msg.token) : undefined;
      if (mine) {
        bind(ws, room, mine);
        send(ws, { type: "joined", code: room.code, token: mine.token!, playerId: mine.id, host: room.hostId === mine.id });
        broadcast(room);
        scheduleBots(room);
        return;
      }
      if (room.state) return fail(ws, "A partida dessa sala já começou.", "started");
      if (room.seats.length >= 4) return fail(ws, "A sala está cheia.", "full");
      const seat = addSeat(room, cleanName(room, msg.name, "Colonista"), false);
      bind(ws, room, seat);
      send(ws, { type: "joined", code: room.code, token: seat.token!, playerId: seat.id, host: false });
      broadcastLobby(room);
      return;
    }

    const b = bindings.get(ws);
    if (!b) return fail(ws, "Entre numa sala primeiro.");
    const { room, seat } = b;
    room.lastActive = Date.now();

    if (msg.type === "leave") {
      bindings.delete(ws);
      seat.socket = null;
      if (seat.timer) clearTimeout(seat.timer);
      seat.token = undefined;
      if (!room.state) {
        room.seats = room.seats.filter((s) => s !== seat);
        if (humans(room).length === 0) return closeRoom(room);
        passHost(room);
        broadcastLobby(room);
        return;
      }
      seat.autopilot = true;
      note(room, `${seat.name} deixou a mesa. Um bot assume o lugar.`, seat.id);
      if (humans(room).every((s) => !s.socket)) return closeRoom(room);
      passHost(room);
      broadcast(room);
      scheduleBots(room);
      return;
    }

    if (msg.type === "start") {
      if (seat.id !== room.hostId) return fail(ws, "Só quem criou a sala começa a partida.");
      if (room.state && room.state.phase.type !== "gameOver") return fail(ws, "A partida já começou.");
      while (room.seats.length < 3) addSeat(room, botName(room), true);
      room.state = createGame({
        setup: room.setup,
        seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
        players: room.seats.map((s) => ({ id: s.id, name: s.name, color: s.color, isBot: s.isBot })),
      });
      broadcast(room);
      scheduleBots(room);
      return;
    }

    if (msg.type === "action") {
      if (!room.state) return fail(ws, "A partida ainda não começou.");
      if (msg.action.playerId !== seat.id) return fail(ws, "Essa jogada é de outra pessoa.");
      const r = reduce(room.state, msg.action);
      if (!r.ok) return fail(ws, r.error.message);
      room.state = r.state;
      broadcast(room, r.events);
      scheduleBots(room);
    }
  }

  // ---------- sockets ----------

  function attach(ws: WebSocket): void {
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    ws.on("message", (data) => {
      try {
        const msg = parseClientMsg(String(data));
        if (!msg) return fail(ws, "Mensagem inválida.");
        handle(ws, msg);
      } catch (err) {
        console.error(err);
        fail(ws, "Erro no servidor. Tente de novo.");
      }
    });
    ws.on("error", (err) => console.error(err));
    ws.on("close", () => {
      alive.delete(ws);
      unbind(ws, true);
    });
  }

  // Dead connections (a phone that slept, a lost Wi-Fi) don't always close.
  // Ping them; whoever doesn't answer by the next round is dropped.
  const heartbeat = setInterval(() => {
    for (const [ws, ok] of alive) {
      if (!ok) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
    const now = Date.now();
    for (const room of rooms.values()) {
      const someone = room.seats.some((s) => s.socket);
      if (!someone && now - room.lastActive > o.idleRoomMs) closeRoom(room);
    }
  }, o.heartbeatMs);

  function close(): void {
    clearInterval(heartbeat);
    for (const room of [...rooms.values()]) closeRoom(room);
  }

  return { attach, close, rooms };
}
