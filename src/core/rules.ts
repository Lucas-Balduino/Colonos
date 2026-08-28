import type { Action, GameState, Player, PlayerId, Resource, ResourceMap, VertexId } from "./types.ts";
import { COSTS, countResources, hasAtLeast } from "./resources.ts";
import { totalVictoryPoints } from "./scoring.ts";

export class RuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "RuleError";
  }
}

export function currentPlayer(state: GameState): Player {
  const p = state.players[state.currentPlayerIndex];
  if (!p) throw new RuleError("no-player", "Jogador atual inexistente.");
  return p;
}

export function playerById(state: GameState, id: PlayerId): Player {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new RuleError("no-player", "Jogador não encontrado.");
  return p;
}

export function assertCurrent(state: GameState, playerId: PlayerId): Player {
  const p = currentPlayer(state);
  if (p.id !== playerId) {
    throw new RuleError("not-your-turn", "Não é o seu turno.");
  }
  return p;
}

export function distanceOk(state: GameState, vertexId: VertexId): boolean {
  const v = state.board.vertices[vertexId];
  if (!v) return false;
  if (v.building) return false;
  for (const n of v.neighbors) {
    if (state.board.vertices[n]?.building) return false;
  }
  return true;
}

export function roadTouchesNetwork(state: GameState, player: Player, edgeId: string): boolean {
  const e = state.board.edges[edgeId];
  if (!e || e.road) return false;
  for (const vid of e.vertices) {
    const v = state.board.vertices[vid]!;
    if (v.building?.owner === player.id) return true;
    for (const eid of v.edges) {
      if (eid !== edgeId && state.board.edges[eid]?.road === player.id) return true;
    }
  }
  return false;
}

export function bestBankRatio(state: GameState, player: Player, resource: Resource): 2 | 3 | 4 {
  let best: 2 | 3 | 4 = 4;
  const owned = new Set([...player.settlements, ...player.cities]);
  for (const port of state.board.ports) {
    if (!port.vertices.some((v) => owned.has(v))) continue;
    if (port.resource === "any" && port.ratio < best) best = port.ratio;
    if (port.resource === resource && port.ratio < best) best = port.ratio;
  }
  return best;
}

export function canAfford(player: Player, cost: Partial<ResourceMap>): boolean {
  return hasAtLeast(player.resources, cost);
}

export function robberVictims(state: GameState, hexId: string, thief: PlayerId): PlayerId[] {
  const hex = state.board.hexes[hexId];
  if (!hex) return [];
  const ids = new Set<PlayerId>();
  for (const vid of hex.vertices) {
    const owner = state.board.vertices[vid]?.building?.owner;
    if (owner && owner !== thief) {
      const p = state.players.find((x) => x.id === owner);
      if (p && countResources(p.resources) > 0) ids.add(owner);
    }
  }
  return [...ids];
}

export function mustDiscard(player: Player): number {
  const n = countResources(player.resources);
  return n > 7 ? Math.floor(n / 2) : 0;
}

export function consumeDev(player: Player, type: Action["type"] | string): void {
  const idx = player.devCards.findIndex(
    (c) =>
      c.playable &&
      ((type === "PLAY_KNIGHT" && c.type === "knight") ||
        (type === "PLAY_ROAD_BUILDING" && c.type === "roadBuilding") ||
        (type === "PLAY_YEAR_OF_PLENTY" && c.type === "yearOfPlenty") ||
        (type === "PLAY_MONOPOLY" && c.type === "monopoly")),
  );
  if (idx < 0) throw new RuleError("no-card", "Você não tem essa carta jogável.");
  player.devCards.splice(idx, 1);
}

export function checkVictory(state: GameState, player: Player): void {
  const vp = totalVictoryPoints(player, state.longestRoadPlayerId, state.largestArmyPlayerId);
  if (vp >= 10) {
    state.phase = { type: "gameOver", winner: player.id };
    state.log.push({ text: `${player.name} venceu com ${vp} pontos!`, playerId: player.id });
  }
}

export function emptyCost(): Partial<ResourceMap> {
  return {};
}

export { COSTS };
