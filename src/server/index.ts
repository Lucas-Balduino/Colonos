import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { createGame, reduce } from "../core/reduce.ts";
import { projectStateFor } from "../core/view.ts";
import { nextBotAction } from "../ai/bot.ts";
import type { ClientMsg, ServerMsg } from "../protocol.ts";
import type { GameState, PlayerId } from "../core/types.ts";

const PROD = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || (PROD ? 43123 : 43124));
const DIST = join(process.cwd(), "dist");
const COLORS = ["#c44536", "#2b6cb0", "#d97706", "#e8e0d0"];
const BOT_NAMES = ["Marinheiro", "Lenhadora", "Mineiro"];

interface Seat {
  id: PlayerId;
  name: string;
  color: string;
  isBot: boolean;
  token?: string;
}

interface Room {
  code: string;
  hostId: PlayerId;
  seats: Seat[];
  setup: "beginner" | "random";
  state: GameState | null;
  sockets: Map<PlayerId, WebSocket>;
  botTimer?: ReturnType<typeof setTimeout>;
}

const rooms = new Map<string, Room>();

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function code(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function broadcastLobby(room: Room): void {
  const msg: ServerMsg = {
    type: "lobby",
    code: room.code,
    hostId: room.hostId,
    players: room.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })),
  };
  for (const [pid, ws] of room.sockets) {
    if (!room.seats.find((s) => s.id === pid)?.isBot) send(ws, msg);
  }
}

function broadcastViews(room: Room): void {
  if (!room.state) return;
  for (const [pid, ws] of room.sockets) {
    send(ws, { type: "view", view: projectStateFor(room.state, pid) });
  }
}

function scheduleBots(room: Room): void {
  if (room.botTimer) clearTimeout(room.botTimer);
  if (!room.state || room.state.phase.type === "gameOver") return;
  const act = nextBotAction(room.state);
  if (!act) return;
  room.botTimer = setTimeout(() => {
    if (!room.state) return;
    const next = nextBotAction(room.state);
    if (!next) return;
    const r = reduce(room.state, next);
    if (!r.ok) return;
    room.state = r.state;
    broadcastViews(room);
    scheduleBots(room);
  }, 520);
}

function handle(ws: WebSocket, raw: string, ctx: { playerId?: PlayerId; room?: Room; token?: string }): void {
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw) as ClientMsg;
  } catch {
    send(ws, { type: "error", message: "Mensagem inválida." });
    return;
  }

  if (msg.type === "create") {
    const c = code();
    const hostId = "p1";
    const token = `${c}-p1-${Math.random().toString(36).slice(2, 8)}`;
    const seats: Seat[] = [
      { id: hostId, name: msg.name || "Anfitrião", color: COLORS[0]!, isBot: false, token },
    ];
    for (let i = 0; i < msg.bots && seats.length < 4; i++) {
      seats.push({
        id: `p${seats.length + 1}`,
        name: BOT_NAMES[i] ?? `Bot ${i + 1}`,
        color: COLORS[seats.length]!,
        isBot: true,
      });
    }
    const room: Room = {
      code: c,
      hostId,
      seats,
      setup: msg.setup,
      state: null,
      sockets: new Map([[hostId, ws]]),
    };
    rooms.set(c, room);
    ctx.playerId = hostId;
    ctx.room = room;
    ctx.token = token;
    send(ws, { type: "joined", code: c, token, playerId: hostId, host: true });
    broadcastLobby(room);
    return;
  }

  if (msg.type === "join") {
    const room = rooms.get(msg.code.toUpperCase());
    if (!room) {
      send(ws, { type: "error", message: "Sala não encontrada." });
      return;
    }
    if (msg.token) {
      const seat = room.seats.find((s) => s.token === msg.token);
      if (seat) {
        room.sockets.set(seat.id, ws);
        ctx.playerId = seat.id;
        ctx.room = room;
        ctx.token = seat.token;
        send(ws, { type: "joined", code: room.code, token: seat.token!, playerId: seat.id, host: seat.id === room.hostId });
        if (room.state) send(ws, { type: "view", view: projectStateFor(room.state, seat.id) });
        else broadcastLobby(room);
        return;
      }
    }
    if (room.state) {
      send(ws, { type: "error", message: "A partida já começou." });
      return;
    }
    if (room.seats.filter((s) => !s.isBot).length >= 4 || room.seats.length >= 4) {
      send(ws, { type: "error", message: "Sala cheia." });
      return;
    }
    const id = `p${room.seats.length + 1}` as PlayerId;
    const token = `${room.code}-${id}-${Math.random().toString(36).slice(2, 8)}`;
    room.seats.push({
      id,
      name: msg.name || "Colonista",
      color: COLORS[room.seats.length]!,
      isBot: false,
      token,
    });
    room.sockets.set(id, ws);
    ctx.playerId = id;
    ctx.room = room;
    ctx.token = token;
    send(ws, { type: "joined", code: room.code, token, playerId: id, host: false });
    broadcastLobby(room);
    return;
  }

  const room = ctx.room;
  const pid = ctx.playerId;
  if (!room || !pid) {
    send(ws, { type: "error", message: "Entre numa sala primeiro." });
    return;
  }

  if (msg.type === "start") {
    if (pid !== room.hostId) {
      send(ws, { type: "error", message: "Só o anfitrião inicia." });
      return;
    }
    while (room.seats.length < 3) {
      room.seats.push({
        id: `p${room.seats.length + 1}`,
        name: BOT_NAMES[room.seats.length] ?? "Bot",
        color: COLORS[room.seats.length]!,
        isBot: true,
      });
    }
    room.state = createGame({
      setup: room.setup,
      seed: Date.now() >>> 0,
      players: room.seats.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        isBot: s.isBot,
      })),
    });
    broadcastViews(room);
    scheduleBots(room);
    return;
  }

  if (msg.type === "action") {
    if (!room.state) {
      send(ws, { type: "error", message: "A partida ainda não começou." });
      return;
    }
    if (msg.action.playerId !== pid) {
      send(ws, { type: "error", message: "Ação de outro jogador." });
      return;
    }
    const r = reduce(room.state, msg.action);
    if (!r.ok) {
      send(ws, { type: "error", message: r.error.message });
      return;
    }
    room.state = r.state;
    broadcastViews(room);
    scheduleBots(room);
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  if (!PROD) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Colonos WS " + PORT);
    return;
  }
  let path = req.url?.split("?")[0] || "/";
  if (path === "/") path = "/index.html";
  const file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    const fallback = join(DIST, "index.html");
    if (existsSync(fallback)) {
      res.writeHead(200, { "content-type": MIME[".html"] });
      res.end(readFileSync(fallback));
      return;
    }
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  const ctx: { playerId?: PlayerId; room?: Room; token?: string } = {};
  ws.on("message", (data) => handle(ws, String(data), ctx));
  ws.on("close", () => {
    if (ctx.room && ctx.playerId) ctx.room.sockets.delete(ctx.playerId);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Colonos server em :${PORT} (${PROD ? "prod" : "dev ws"})`);
});
