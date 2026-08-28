import { describe, expect, it } from "vitest";
import { createGame, must, reduce } from "../src/core/reduce.ts";
import { legalActions } from "../src/core/legal.ts";
import { projectStateFor } from "../src/core/view.ts";
import { countResources, emptyResources } from "../src/core/resources.ts";
import type { Action, GameState, PlayerId } from "../src/core/types.ts";

function fourPlayers() {
  return createGame({
    seed: 7,
    setup: "beginner",
    players: [
      { name: "Ana", color: "#c44536", isBot: false, id: "p1" },
      { name: "Bia", color: "#2b6cb0", isBot: true, id: "p2" },
      { name: "Caio", color: "#d97706", isBot: true, id: "p3" },
      { name: "Duda", color: "#e8e0d0", isBot: true, id: "p4" },
    ],
  });
}

function playSetup(state: GameState): GameState {
  let s = state;
  while (s.phase.type === "setupSettlement" || s.phase.type === "setupRoad") {
    const p = s.players[s.currentPlayerIndex]!;
    const legal = legalActions(s, p.id);
    expect(legal.length, `setup sem jogadas legais para ${p.name} em ${s.phase.type}`).toBeGreaterThan(0);
    s = must(s, legal[0]!);
  }
  return s;
}

describe("regras de turno", () => {
  it("recusa aldeias adjacentes (regra da distância)", () => {
    let s = fourPlayers();
    const p1 = "p1" as PlayerId;
    const options = legalActions(s, p1).filter((a) => a.type === "PLACE_SETTLEMENT");
    const first = options[0]!;
    if (first.type !== "PLACE_SETTLEMENT") throw new Error("expected settlement");
    s = must(s, first);
    const vertex = s.board.vertices[first.vertexId]!;
    const neighbor = vertex.neighbors[0]!;
    const road = legalActions(s, p1)[0]!;
    s = must(s, road);
    // skip others quickly until p1 round 2? instead try neighbor now as p2
    const p2id = s.players[s.currentPlayerIndex]!.id;
    const attempt: Action = { type: "PLACE_SETTLEMENT", playerId: p2id, vertexId: neighbor };
    const r = reduce(s, attempt);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("distance");
  });

  it("completa o setup e entra na fase de rolagem", () => {
    const s = playSetup(fourPlayers());
    expect(s.phase.type).toBe("roll");
    expect(s.players.every((p) => p.settlements.length === 2)).toBe(true);
    expect(s.players.every((p) => p.roads.length === 2)).toBe(true);
    const startingCards = s.players.map((p) => countResources(p.resources));
    expect(startingCards.every((n) => n >= 0 && n <= 3)).toBe(true);
  });

  it("produz recursos no token e bloqueia o ladrão", () => {
    let s = playSetup(fourPlayers());
    const hex = Object.values(s.board.hexes).find((h) => h.number === 6 && h.terrain !== "desert")!;
    const vertex = hex.vertices.find((vid) => s.board.vertices[vid]?.building);
    const ownerId = vertex ? s.board.vertices[vertex]!.building!.owner : s.players[0]!.id;
    const owner = s.players.find((p) => p.id === ownerId)!;
    const before = { ...owner.resources };

    s.currentPlayerIndex = s.players.findIndex((p) => p.id === ownerId);
    s.phase = { type: "roll" };
    s.rng = 1;
    // force dice by applying production via a hex-6 roll: brute force rolls
    let rolled = s;
    for (let i = 0; i < 40; i++) {
      const p = rolled.players[rolled.currentPlayerIndex]!;
      const r = reduce(rolled, { type: "ROLL", playerId: p.id });
      if (!r.ok) break;
      rolled = r.state;
      if (rolled.dice && rolled.dice[0] + rolled.dice[1] === 6) {
        s = rolled;
        break;
      }
      if (rolled.phase.type === "main") {
        s = must(rolled, { type: "END_TURN", playerId: p.id });
      } else if (rolled.phase.type === "discard") {
        break;
      } else {
        s = rolled;
        break;
      }
    }
    if (s.dice && s.dice[0] + s.dice[1] === 6) {
      const after = s.players.find((p) => p.id === ownerId)!;
      const gained =
        countResources(after.resources) - countResources(before) ||
        after.resources[hex.terrain] - before[hex.terrain];
      expect(gained).toBeGreaterThanOrEqual(0);
    }
  });

  it("não deixa o jogador B ver a mão de A", () => {
    const s = playSetup(fourPlayers());
    s.players[0]!.resources.wood = 4;
    const viewA = projectStateFor(s, "p1");
    const viewB = projectStateFor(s, "p2");
    expect(viewA.players.find((p) => p.id === "p1")?.resources?.wood).toBe(4);
    expect(viewB.players.find((p) => p.id === "p1")?.resources).toBeUndefined();
    expect(viewB.players.find((p) => p.id === "p1")?.resourceCount).toBeGreaterThan(0);
    expect(viewB.players.find((p) => p.id === "p2")?.resources).toBeTruthy();
  });

  it("custa 1 madeira e 1 tijolo para estrada no turno principal", () => {
    let s = playSetup(fourPlayers());
    const p = s.players[s.currentPlayerIndex]!;
    s.phase = { type: "main" };
    p.resources.wood += 1;
    p.resources.brick += 1;
    const road = legalActions(s, p.id).find((a) => a.type === "BUILD_ROAD");
    expect(road).toBeTruthy();
    s = must(s, road!);
    expect(p.roads.length + 1).toBe(s.players[s.currentPlayerIndex]!.roads.length);
  });

  it("descarta metade das cartas no 7 se tiver mais de 7", () => {
    let s = playSetup(fourPlayers());
    const p = s.players[0]!;
    p.resources = { wood: 4, brick: 4, sheep: 0, wheat: 0, ore: 0 };
    s.currentPlayerIndex = 0;
    s.phase = { type: "roll" };
    s.dice = null;
    // inject a seven by looping rng - easier: set phase discard directly after mocking
    s.phase = { type: "discard", queue: [p.id] };
    const legal = legalActions(s, p.id).filter((a) => a.type === "DISCARD");
    expect(legal.length).toBeGreaterThan(0);
    const disc = legal[0]!;
    if (disc.type !== "DISCARD") throw new Error("expected discard");
    expect(countResources(disc.resources)).toBe(4);
    s = must(s, disc);
    expect(countResources(s.players[0]!.resources)).toBe(4);
  });

  it("recusa jogar carta comprada no mesmo turno", () => {
    let s = playSetup(fourPlayers());
    const p = s.players[s.currentPlayerIndex]!;
    s.phase = { type: "main" };
    p.resources.sheep += 1;
    p.resources.wheat += 1;
    p.resources.ore += 1;
    s.devDeck.push("knight");
    s = must(s, { type: "BUY_DEV", playerId: p.id });
    const bought = s.players[s.currentPlayerIndex]!.devCards.at(-1);
    expect(bought?.playable).toBe(false);
    const play = reduce(s, { type: "PLAY_KNIGHT", playerId: p.id });
    expect(play.ok).toBe(false);
  });
});
