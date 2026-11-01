import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { createRoomServer, type RoomOptions } from "../src/server/rooms.ts";
import type { ClientMsg, ServerMsg } from "../src/protocol.ts";

type View = Extract<ServerMsg, { type: "view" }>;

const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

async function startServer(opts: Partial<RoomOptions> = {}) {
  const rooms = createRoomServer({ botDelayMs: 5, autopilotMs: 80, lobbyGraceMs: 80, ...opts });
  const wss = new WebSocketServer({ port: 0 });
  wss.on("connection", (ws) => rooms.attach(ws));
  await new Promise<void>((r) => wss.once("listening", () => r()));
  const port = (wss.address() as AddressInfo).port;
  cleanup.push(() => {
    rooms.close();
    for (const c of wss.clients) c.terminate();
    wss.close();
  });
  return { rooms, url: `ws://127.0.0.1:${port}` };
}

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  private waiters: Array<() => void> = [];
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (d) => {
      this.msgs.push(JSON.parse(String(d)) as ServerMsg);
      for (const w of this.waiters.splice(0)) w();
    });
    cleanup.push(() => this.ws.terminate());
  }
  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((r) => this.ws.once("open", () => r()));
  }
  send(msg: ClientMsg) {
    this.ws.send(JSON.stringify(msg));
  }
  async waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, ms = 3000): Promise<T>;
  async waitFor(pred: (m: ServerMsg) => boolean, ms?: number): Promise<ServerMsg>;
  async waitFor(pred: (m: ServerMsg) => boolean, ms = 3000): Promise<ServerMsg> {
    const deadline = Date.now() + ms;
    for (;;) {
      const hit = [...this.msgs].reverse().find(pred);
      if (hit) return hit;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timeout; last: ${JSON.stringify(this.msgs.at(-1))?.slice(0, 200)}`);
      await new Promise<void>((r) => {
        const t = setTimeout(r, left);
        this.waiters.push(() => {
          clearTimeout(t);
          r();
        });
      });
    }
  }
  lastView(): View | undefined {
    return [...this.msgs].reverse().find((m): m is View => m.type === "view");
  }
  clear() {
    this.msgs = [];
  }
}

const isJoined = (m: ServerMsg): m is Extract<ServerMsg, { type: "joined" }> => m.type === "joined";
const isView = (m: ServerMsg): m is View => m.type === "view";

async function twoPlayerRoom(url: string, bots = 1) {
  const a = new Client(url);
  await a.open();
  a.send({ type: "create", name: "Ana", bots, setup: "beginner" });
  const ja = await a.waitFor(isJoined);
  const b = new Client(url);
  await b.open();
  b.send({ type: "join", code: ja.code, name: "Bia" });
  const jb = await b.waitFor(isJoined);
  return { a, b, ja, jb };
}

describe("salas online", () => {
  it("cria, entra e começa; cada um vê só a própria mão", async () => {
    const { url } = await startServer();
    const { a, b, ja, jb } = await twoPlayerRoom(url);
    a.send({ type: "start" });
    const va = await a.waitFor(isView);
    const vb = await b.waitFor(isView);
    expect(va.view.players).toHaveLength(3);
    expect(va.view.you).toBe(ja.playerId);
    expect(vb.view.you).toBe(jb.playerId);
    const otherInA = va.view.players.find((p) => p.id === jb.playerId)!;
    expect(otherInA.resources).toBeUndefined();
    expect(va.view.presence?.[jb.playerId]).toBe("online");
  });

  it("recusa jogada em nome de outra pessoa", async () => {
    const { url } = await startServer();
    const { a, b, ja } = await twoPlayerRoom(url);
    a.send({ type: "start" });
    await b.waitFor(isView);
    b.clear();
    b.send({ type: "action", action: { type: "ROLL", playerId: ja.playerId } });
    const err = await b.waitFor((m) => m.type === "error");
    expect(err.type).toBe("error");
  });

  it("quem recarrega volta ao mesmo lugar com o token", async () => {
    const { url } = await startServer({ autopilotMs: 5000 });
    const { a, b, ja, jb } = await twoPlayerRoom(url);
    a.send({ type: "start" });
    await b.waitFor(isView);
    b.ws.close();
    await a.waitFor((m) => isView(m) && m.view.presence?.[jb.playerId] === "away");

    const again = new Client(url);
    await again.open();
    again.send({ type: "join", code: ja.code, name: "Bia", token: jb.token });
    const j = await again.waitFor(isJoined);
    expect(j.playerId).toBe(jb.playerId);
    const v = await again.waitFor(isView);
    expect(v.view.you).toBe(jb.playerId);
    await a.waitFor((m) => isView(m) && m.view.presence?.[jb.playerId] === "online");
  });

  it("um bot assume a vez de quem caiu, e devolve quando a pessoa volta", async () => {
    const { url } = await startServer({ autopilotMs: 60 });
    const { a, b, ja } = await twoPlayerRoom(url);
    a.send({ type: "start" });
    await a.waitFor(isView);
    // Ana starts the setup and drops before placing anything.
    a.ws.close();
    const later = await b.waitFor(
      (m) => isView(m) && m.view.players.find((p) => p.id === ja.playerId)!.settlementCount > 0,
    );
    expect((later as View).view.presence?.[ja.playerId]).toBe("autopilot");
    expect((later as View).view.log.some((l) => l.text.includes("Um bot joga por Ana"))).toBe(true);

    const back = new Client(url);
    await back.open();
    back.send({ type: "join", code: ja.code, name: "Ana", token: ja.token });
    const v = await back.waitFor(isView);
    expect(v.view.presence?.[ja.playerId]).toBe("online");
  });

  it("a mesma mesa aberta em outra aba fecha a antiga", async () => {
    const { url } = await startServer();
    const { a, ja } = await twoPlayerRoom(url);
    const twin = new Client(url);
    await twin.open();
    twin.send({ type: "join", code: ja.code, name: "Ana", token: ja.token });
    await twin.waitFor(isJoined);
    const err = await a.waitFor((m) => m.type === "error");
    expect(err.type === "error" && err.code).toBe("replaced");
  });

  it("sala inexistente avisa para esquecer o lugar salvo", async () => {
    const { url } = await startServer();
    const c = new Client(url);
    await c.open();
    c.send({ type: "join", code: "ZZZZZZ", name: "Ana", token: "x" });
    const err = await c.waitFor((m) => m.type === "error");
    expect(err.type === "error" && err.code).toBe("room-gone");
  });

  it("quem sai do saguão libera o lugar e o anfitrião passa adiante", async () => {
    const { url } = await startServer();
    const { a, b, jb } = await twoPlayerRoom(url, 0);
    a.send({ type: "leave" });
    const lobby = await b.waitFor((m) => m.type === "lobby" && m.players.length === 1);
    expect(lobby.type === "lobby" && lobby.hostId).toBe(jb.playerId);
  });

  it("o anfitrião começa outra partida quando a anterior acaba", async () => {
    const { url, rooms } = await startServer();
    const { a, b, ja } = await twoPlayerRoom(url);
    a.send({ type: "start" });
    await b.waitFor(isView);
    const room = rooms.rooms.get(ja.code)!;
    room.state = { ...room.state!, phase: { type: "gameOver", winner: ja.playerId } };
    b.clear();
    a.send({ type: "start" });
    const v = await b.waitFor((m) => isView(m) && m.view.phase.type === "setupSettlement");
    expect(v.type).toBe("view");
  });
});
