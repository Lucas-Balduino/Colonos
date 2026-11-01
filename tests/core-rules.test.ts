import { describe, expect, it } from "vitest";
import { createGame, must, reduce } from "../src/core/reduce.ts";
import { legalActions } from "../src/core/legal.ts";
import { emptyResources } from "../src/core/resources.ts";
import { refreshAwards, longestRoadLength } from "../src/core/scoring.ts";
import type { Board, GameState, ResourceMap, VertexId } from "../src/core/types.ts";

function bag(partial: Partial<ResourceMap> = {}): ResourceMap {
  return { ...emptyResources(), ...partial };
}

function game(setup: "beginner" | "random" = "beginner", seed = 7): GameState {
  return createGame({
    seed,
    setup,
    players: [
      { id: "p1", name: "Ana", color: "#c44536", isBot: false },
      { id: "p2", name: "Bia", color: "#2b6cb0", isBot: true },
      { id: "p3", name: "Caio", color: "#d97706", isBot: true },
    ],
  });
}

function mainPhase(): GameState {
  const s = game();
  s.phase = { type: "main" };
  s.turnNumber = 3;
  return s;
}

/** A simple path of `n` edges through the board, starting anywhere inland. */
function pathOfEdges(board: Board, n: number): { edges: string[]; vertices: VertexId[] } {
  for (const start of Object.keys(board.vertices)) {
    const vertices: VertexId[] = [start];
    const edges: string[] = [];
    let at = start;
    while (edges.length < n) {
      const next = board.vertices[at]!.edges.find((eid) => {
        const e = board.edges[eid]!;
        const other = e.vertices[0] === at ? e.vertices[1] : e.vertices[0];
        return !edges.includes(eid) && !vertices.includes(other);
      });
      if (!next) break;
      const e = board.edges[next]!;
      at = e.vertices[0] === at ? e.vertices[1] : e.vertices[0];
      edges.push(next);
      vertices.push(at);
    }
    if (edges.length === n) return { edges, vertices };
  }
  throw new Error("sem caminho");
}

function giveRoads(s: GameState, playerId: string, edges: string[]): void {
  const p = s.players.find((x) => x.id === playerId)!;
  for (const eid of edges) {
    s.board.edges[eid]!.road = playerId;
    p.roads.push(eid);
  }
}

describe("ações malformadas não passam pelo motor", () => {
  it("recusa descarte com número negativo", () => {
    const s = mainPhase();
    const p = s.players[0]!;
    p.resources = bag({ wood: 4, brick: 4 });
    s.phase = { type: "discard", queue: ["p1"] };
    const r = reduce(s, { type: "DISCARD", playerId: "p1", resources: bag({ wood: 4, brick: 4, sheep: -4 }) });
    expect(r.ok).toBe(false);
  });

  it("recusa recurso inexistente e frações", () => {
    const s = mainPhase();
    s.players[0]!.resources = bag({ wood: 4 });
    expect(reduce(s, { type: "TRADE_BANK", playerId: "p1", give: "gold" as never, take: "ore" }).ok).toBe(false);
    expect(reduce(s, { type: "PLAY_MONOPOLY", playerId: "p1", resource: "gold" as never }).ok).toBe(false);
    const half = { ...bag({ wood: 1 }), ore: 0.5 };
    expect(reduce(s, { type: "OFFER_TRADE", playerId: "p1", give: bag({ wood: 1 }), want: half }).ok).toBe(false);
  });

  it("recusa troca com o banco pelo mesmo recurso", () => {
    const s = mainPhase();
    s.players[0]!.resources = bag({ wood: 4 });
    expect(reduce(s, { type: "TRADE_BANK", playerId: "p1", give: "wood", take: "wood" }).ok).toBe(false);
  });

  it("recusa oferta que dá e pede o mesmo recurso", () => {
    const s = mainPhase();
    s.players[0]!.resources = bag({ wood: 2 });
    const r = reduce(s, { type: "OFFER_TRADE", playerId: "p1", give: bag({ wood: 1 }), want: bag({ wood: 1, ore: 1 }) });
    expect(r.ok).toBe(false);
  });

  it("devolve erro em vez de estourar com lixo", () => {
    const s = mainPhase();
    expect(reduce(s, null as never).ok).toBe(false);
    expect(reduce(s, { type: "NOPE", playerId: "p1" } as never).ok).toBe(false);
    expect(reduce(s, { type: "ROLL" } as never).ok).toBe(false);
  });
});

describe("portos", () => {
  for (const setup of ["beginner", "random"] as const) {
    it(`no mapa ${setup} cobrem a costa inteira sem dividir interseção`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const s = game(setup, seed);
        const ports = s.board.ports;
        expect(ports).toHaveLength(9);
        const seen = new Set<string>();
        for (const port of ports) {
          for (const v of port.vertices) {
            expect(seen.has(v)).toBe(false);
            seen.add(v);
          }
        }
        // Every one of the six sides of the island has at least one port.
        const sides = new Set(
          ports.map((port) => {
            const hex = s.board.hexes[s.board.edges[port.edgeId]!.hexes[0]!]!;
            const angle = Math.atan2(1.5 * hex.r, Math.sqrt(3) * (hex.q + hex.r / 2));
            return Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 6) % 6;
          }),
        );
        expect(sides.size).toBeGreaterThanOrEqual(5);
      }
    });
  }
});

describe("mapa aleatório", () => {
  it("nunca põe 6 e 8 lado a lado", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = game("random", seed);
      const hexes = Object.values(s.board.hexes);
      for (const a of hexes) {
        if (a.number !== 6 && a.number !== 8) continue;
        for (const b of hexes) {
          if (a === b || (b.number !== 6 && b.number !== 8)) continue;
          const dq = a.q - b.q;
          const dr = a.r - b.r;
          const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
          expect(dist, `semente ${seed}`).toBeGreaterThan(1);
        }
      }
    }
  });
});

describe("maior estrada", () => {
  it("vai para quem chega a 5 estradas e cai quando uma aldeia corta", () => {
    const s = mainPhase();
    const { edges, vertices } = pathOfEdges(s.board, 5);
    giveRoads(s, "p1", edges);
    refreshAwards(s.board, s.players, s);
    expect(longestRoadLength(s.board, s.players[0]!, s.players)).toBe(5);
    expect(s.longestRoadPlayerId).toBe("p1");

    // An opponent settlement in the middle of the road splits it into 2 + 3.
    const middle = vertices[2]!;
    s.board.vertices[middle]!.building = { type: "settlement", owner: "p2" };
    s.players[1]!.settlements.push(middle);
    refreshAwards(s.board, s.players, s);
    expect(longestRoadLength(s.board, s.players[0]!, s.players)).toBe(3);
    expect(s.longestRoadPlayerId).toBeNull();
  });

  it("empate mantém com quem já tinha", () => {
    const s = mainPhase();
    const a = pathOfEdges(s.board, 5);
    giveRoads(s, "p1", a.edges);
    refreshAwards(s.board, s.players, s);
    const used = new Set(a.vertices);
    // Second path that avoids the first one.
    const b = (() => {
      for (const start of Object.keys(s.board.vertices)) {
        if (used.has(start)) continue;
        const vs = [start];
        const es: string[] = [];
        let at = start;
        while (es.length < 5) {
          const next = s.board.vertices[at]!.edges.find((eid) => {
            const e = s.board.edges[eid]!;
            const other = e.vertices[0] === at ? e.vertices[1] : e.vertices[0];
            return !e.road && !es.includes(eid) && !vs.includes(other) && !used.has(other);
          });
          if (!next) break;
          const e = s.board.edges[next]!;
          at = e.vertices[0] === at ? e.vertices[1] : e.vertices[0];
          es.push(next);
          vs.push(at);
        }
        if (es.length === 5) return es;
      }
      throw new Error("sem segundo caminho");
    })();
    giveRoads(s, "p2", b);
    refreshAwards(s.board, s.players, s);
    expect(s.longestRoadPlayerId).toBe("p1");
  });
});

describe("maior exército e vitória", () => {
  it("o terceiro cavaleiro dá o maior exército", () => {
    const s = mainPhase();
    s.players[0]!.knightsPlayed = 2;
    s.players[0]!.devCards = [{ type: "knight", playable: true }];
    const r = must(s, { type: "PLAY_KNIGHT", playerId: "p1" });
    expect(r.largestArmyPlayerId).toBe("p1");
    expect(r.phase.type).toBe("moveRobber");
  });

  it("vence ao chegar a 10 pontos no próprio turno", () => {
    const s = mainPhase();
    const p = s.players[0]!;
    // 4 cities (8) + 1 victory card (1) = 9; a settlement makes 10.
    const free = Object.values(s.board.vertices).filter((v) => !v.building);
    const picks: string[] = [];
    for (const v of free) {
      if (picks.every((id) => !s.board.vertices[id]!.neighbors.includes(v.id))) picks.push(v.id);
      if (picks.length === 6) break;
    }
    for (const id of picks.slice(0, 4)) {
      s.board.vertices[id]!.building = { type: "city", owner: "p1" };
      p.cities.push(id);
    }
    p.citiesLeft = 0;
    p.devCards = [{ type: "victory", playable: false }];
    const spot = picks[4]!;
    const road = s.board.vertices[spot]!.edges[0]!;
    s.board.edges[road]!.road = "p1";
    p.roads.push(road);
    p.resources = bag({ wood: 1, brick: 1, sheep: 1, wheat: 1 });
    const r = must(s, { type: "BUILD_SETTLEMENT", playerId: "p1", vertexId: spot });
    expect(r.phase).toEqual({ type: "gameOver", winner: "p1" });
  });
});

describe("cartas de desenvolvimento antes de rolar", () => {
  it("Monopólio e Fartura valem antes dos dados", () => {
    const s = mainPhase();
    s.phase = { type: "roll" };
    s.players[0]!.devCards = [{ type: "monopoly", playable: true }];
    s.players[1]!.resources = bag({ ore: 3 });
    const legal = legalActions(s, "p1");
    expect(legal.some((a) => a.type === "PLAY_MONOPOLY")).toBe(true);
    const r = must(s, { type: "PLAY_MONOPOLY", playerId: "p1", resource: "ore" });
    expect(r.players[0]!.resources.ore).toBe(3);
    expect(r.phase.type).toBe("roll");
  });

  it("Construção de Estradas antes dos dados volta para a rolagem", () => {
    const s = mainPhase();
    s.phase = { type: "roll" };
    const { edges } = pathOfEdges(s.board, 1);
    giveRoads(s, "p1", edges);
    s.players[0]!.devCards = [{ type: "roadBuilding", playable: true }];
    let r = must(s, { type: "PLAY_ROAD_BUILDING", playerId: "p1" });
    expect(r.phase.type).toBe("freeRoads");
    for (let i = 0; i < 2; i++) {
      const place = legalActions(r, "p1").find((a) => a.type === "PLACE_ROAD")!;
      r = must(r, place);
    }
    expect(r.phase.type).toBe("roll");
  });
});

describe("troca entre jogadores", () => {
  it("só quem ofereceu fecha, e só com quem aceitou", () => {
    const s = mainPhase();
    s.players[0]!.resources = bag({ wood: 2 });
    s.players[1]!.resources = bag({ wheat: 1 });
    s.players[2]!.resources = bag({ wheat: 1 });
    let r = must(s, { type: "OFFER_TRADE", playerId: "p1", give: bag({ wood: 2 }), want: bag({ wheat: 1 }) });
    const id = r.tradeOffers[0]!.id;
    r = must(r, { type: "ACCEPT_TRADE", playerId: "p2", offerId: id });
    const legal = legalActions(r, "p1");
    expect(legal.filter((a) => a.type === "CONFIRM_TRADE")).toHaveLength(1);
    expect(reduce(r, { type: "CONFIRM_TRADE", playerId: "p1", offerId: id, with: "p3" }).ok).toBe(false);
    r = must(r, { type: "CONFIRM_TRADE", playerId: "p1", offerId: id, with: "p2" });
    expect(r.players[0]!.resources).toEqual(bag({ wheat: 1 }));
    expect(r.players[1]!.resources).toEqual(bag({ wood: 2 }));
    expect(r.tradeOffers).toHaveLength(0);
  });
});
