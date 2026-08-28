import { RESOURCES } from "./types.ts";
import type { Action, GameState, Player, PlayerId, ResourceMap } from "./types.ts";
import { COSTS, emptyResources, hasAtLeast } from "./resources.ts";
import {
  bestBankRatio,
  canAfford,
  currentPlayer,
  distanceOk,
  mustDiscard,
  roadTouchesNetwork,
  robberVictims,
} from "./rules.ts";

function cloneGive(partial: Partial<ResourceMap>): ResourceMap {
  const r = emptyResources();
  for (const k of RESOURCES) r[k] = partial[k] ?? 0;
  return r;
}

export function legalActions(state: GameState, playerId: PlayerId): Action[] {
  const actions: Action[] = [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return actions;
  const phase = state.phase;
  const isCurrent = currentPlayer(state).id === playerId;

  if (phase.type === "gameOver") return actions;

  if (phase.type === "discard") {
    if (phase.queue[0] !== playerId) return actions;
    const n = mustDiscard(player);
    for (const combo of discardCombos(player.resources, n)) {
      actions.push({ type: "DISCARD", playerId, resources: combo });
    }
    return actions;
  }

  if (phase.type === "steal" && isCurrent) {
    for (const from of robberVictims(state, phase.hexId, playerId)) {
      actions.push({ type: "STEAL", playerId, from });
    }
    return actions;
  }

  if (phase.type === "moveRobber" && isCurrent) {
    for (const hex of Object.values(state.board.hexes)) {
      if (hex.id === state.board.robberHexId) continue;
      const victims = robberVictims(state, hex.id, playerId);
      if (victims.length === 0) {
        actions.push({ type: "MOVE_ROBBER", playerId, hexId: hex.id });
      } else {
        for (const v of victims) {
          actions.push({ type: "MOVE_ROBBER", playerId, hexId: hex.id, stealFrom: v });
        }
      }
    }
    return actions;
  }

  if (phase.type === "setupSettlement" && isCurrent) {
    for (const v of Object.values(state.board.vertices)) {
      if (distanceOk(state, v.id)) {
        actions.push({ type: "PLACE_SETTLEMENT", playerId, vertexId: v.id });
      }
    }
    return actions;
  }

  if (phase.type === "setupRoad" && isCurrent) {
    const settlement = state.board.vertices[phase.settlement];
    if (settlement) {
      for (const eid of settlement.edges) {
        const e = state.board.edges[eid];
        if (e && !e.road) actions.push({ type: "PLACE_ROAD", playerId, edgeId: eid });
      }
    }
    return actions;
  }

  if (phase.type === "freeRoads" && isCurrent) {
    for (const e of Object.values(state.board.edges)) {
      if (!e.road && player.roadsLeft > 0 && roadTouchesNetwork(state, player, e.id)) {
        actions.push({ type: "PLACE_ROAD", playerId, edgeId: e.id });
      }
    }
    if (actions.length === 0) {
      // nothing to place; caller should END via a noop — expose skip as empty
    }
    return actions;
  }

  if (phase.type === "roll" && isCurrent) {
    actions.push({ type: "ROLL", playerId });
    addDevPlays(state, player, actions, true);
    return actions;
  }

  if (phase.type === "main" && isCurrent) {
    for (const e of Object.values(state.board.edges)) {
      if (!e.road && player.roadsLeft > 0 && canAfford(player, COSTS.road) && roadTouchesNetwork(state, player, e.id)) {
        actions.push({ type: "BUILD_ROAD", playerId, edgeId: e.id });
      }
    }
    for (const v of Object.values(state.board.vertices)) {
      if (
        player.settlementsLeft > 0 &&
        canAfford(player, COSTS.settlement) &&
        distanceOk(state, v.id) &&
        v.edges.some((eid) => state.board.edges[eid]?.road === player.id)
      ) {
        actions.push({ type: "BUILD_SETTLEMENT", playerId, vertexId: v.id });
      }
      if (
        v.building?.owner === player.id &&
        v.building.type === "settlement" &&
        player.citiesLeft > 0 &&
        canAfford(player, COSTS.city)
      ) {
        actions.push({ type: "BUILD_CITY", playerId, vertexId: v.id });
      }
    }
    if (state.devDeck.length > 0 && canAfford(player, COSTS.dev)) {
      actions.push({ type: "BUY_DEV", playerId });
    }
    for (const give of RESOURCES) {
      const ratio = bestBankRatio(state, player, give);
      if (player.resources[give] >= ratio) {
        for (const take of RESOURCES) {
          if (take === give) continue;
          if (state.bank[take] > 0) {
            actions.push({ type: "TRADE_BANK", playerId, give, take });
          }
        }
      }
    }
    addDevPlays(state, player, actions, false);
    actions.push({ type: "END_TURN", playerId });
  }

  if (phase.type === "main") {
    for (const offer of state.tradeOffers) {
      if (offer.from === playerId) {
        actions.push({ type: "CANCEL_TRADE", playerId, offerId: offer.id });
      } else if (hasAtLeast(player.resources, offer.want)) {
        actions.push({ type: "ACCEPT_TRADE", playerId, offerId: offer.id });
        actions.push({ type: "REJECT_TRADE", playerId, offerId: offer.id });
      }
    }
  }

  return actions;
}

function addDevPlays(state: GameState, player: Player, actions: Action[], knightOnly: boolean): void {
  if (state.playedDevThisTurn) return;
  const pid = player.id;
  if (player.devCards.some((c) => c.playable && c.type === "knight")) {
    actions.push({ type: "PLAY_KNIGHT", playerId: pid });
  }
  if (knightOnly) return;
  if (player.devCards.some((c) => c.playable && c.type === "roadBuilding") && player.roadsLeft > 0) {
    actions.push({ type: "PLAY_ROAD_BUILDING", playerId: pid });
  }
  if (player.devCards.some((c) => c.playable && c.type === "yearOfPlenty")) {
    for (const a of RESOURCES) {
      for (const b of RESOURCES) {
        const need = a === b ? { [a]: 2 } : { [a]: 1, [b]: 1 };
        if (hasAtLeast(state.bank, need)) {
          actions.push({ type: "PLAY_YEAR_OF_PLENTY", playerId: pid, resources: [a, b] });
        }
      }
    }
  }
  if (player.devCards.some((c) => c.playable && c.type === "monopoly")) {
    for (const r of RESOURCES) {
      actions.push({ type: "PLAY_MONOPOLY", playerId: pid, resource: r });
    }
  }
}

/** Combinations of resources summing to n (capped for bot/UI). */
export function discardCombos(res: ResourceMap, n: number): ResourceMap[] {
  if (n <= 0) return [emptyResources()];
  const results: ResourceMap[] = [];
  const keys = RESOURCES;
  const rec = (i: number, left: number, cur: ResourceMap) => {
    if (left === 0) {
      results.push({ ...cur });
      return;
    }
    if (i >= keys.length) return;
    const k = keys[i]!;
    const max = Math.min(res[k], left);
    for (let c = 0; c <= max; c++) {
      cur[k] = c;
      rec(i + 1, left - c, cur);
      if (results.length > 80) return;
    }
    cur[k] = 0;
  };
  rec(0, n, emptyResources());
  return results.length > 0 ? results : [greedyDiscard(res, n)];
}

function greedyDiscard(res: ResourceMap, n: number): ResourceMap {
  const out = emptyResources();
  let left = n;
  const order = [...RESOURCES].sort((a, b) => res[b] - res[a]);
  for (const k of order) {
    const take = Math.min(res[k], left);
    out[k] = take;
    left -= take;
    if (left === 0) break;
  }
  return out;
}

export function cloneGiveMap(partial: Partial<ResourceMap>): ResourceMap {
  return cloneGive(partial);
}
