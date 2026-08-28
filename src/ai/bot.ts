import { legalActions } from "../core/legal.ts";
import { RESOURCES } from "../core/types.ts";
import type { Action, GameState, Player, PlayerId, Resource } from "../core/types.ts";
import { countResources } from "../core/resources.ts";
import { totalVictoryPoints } from "../core/scoring.ts";
import { currentPlayer } from "../core/rules.ts";

const PIP: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

function vertexScore(state: GameState, vertexId: string): number {
  const v = state.board.vertices[vertexId];
  if (!v) return 0;
  let pips = 0;
  const terrains = new Set<string>();
  for (const hid of v.hexes) {
    const h = state.board.hexes[hid];
    if (!h || h.terrain === "desert" || h.number === null) continue;
    pips += PIP[h.number] ?? 0;
    terrains.add(h.terrain);
  }
  let port = 0;
  for (const p of state.board.ports) {
    if (p.vertices.includes(vertexId)) port += p.ratio === 2 ? 1.5 : 0.6;
  }
  return pips * (1 + terrains.size * 0.15) + port;
}

function leaderId(state: GameState): PlayerId {
  let best = state.players[0]!;
  let bestVp = -1;
  for (const p of state.players) {
    const vp = totalVictoryPoints(p, state.longestRoadPlayerId, state.largestArmyPlayerId);
    if (vp > bestVp) {
      best = p;
      bestVp = vp;
    }
  }
  return best.id;
}

function missingFor(player: Player, kind: "city" | "settlement" | "dev" | "road"): number {
  const need =
    kind === "city"
      ? { wheat: 2, ore: 3 }
      : kind === "settlement"
        ? { wood: 1, brick: 1, sheep: 1, wheat: 1 }
        : kind === "dev"
          ? { sheep: 1, wheat: 1, ore: 1 }
          : { wood: 1, brick: 1 };
  let miss = 0;
  for (const [k, n] of Object.entries(need)) {
    const have = player.resources[k as Resource] ?? 0;
    if (have < n) miss += n - have;
  }
  return miss;
}

export function chooseBotAction(state: GameState, playerId: PlayerId): Action | null {
  const legal = legalActions(state, playerId);
  if (legal.length === 0) return null;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return legal[0]!;
  const onTurn = whoseTurn(state) === playerId;
  if (!onTurn) {
    const offers = legal.filter((a) => a.type === "ACCEPT_TRADE");
    for (const o of offers) {
      if (o.type !== "ACCEPT_TRADE") continue;
      const offer = state.tradeOffers.find((t) => t.id === o.offerId);
      if (!offer) continue;
      const after = { ...player.resources };
      for (const r of RESOURCES) {
        after[r] += offer.give[r];
        after[r] -= offer.want[r];
      }
      const fake = { ...player, resources: after };
      if (missingFor(fake, "city") < missingFor(player, "city")) return o;
      if (missingFor(fake, "settlement") < missingFor(player, "settlement")) return o;
    }
    return legal.find((a) => a.type === "REJECT_TRADE") ?? null;
  }

  if (state.phase.type === "setupSettlement") {
    const opts = legal.filter((a) => a.type === "PLACE_SETTLEMENT");
    opts.sort((a, b) => {
      if (a.type !== "PLACE_SETTLEMENT" || b.type !== "PLACE_SETTLEMENT") return 0;
      return vertexScore(state, b.vertexId) - vertexScore(state, a.vertexId);
    });
    return opts[0] ?? legal[0]!;
  }

  if (state.phase.type === "setupRoad" || state.phase.type === "freeRoads") {
    return legal[0]!;
  }

  if (state.phase.type === "discard") {
    const discards = legal.filter((a) => a.type === "DISCARD");
    const scored = discards.map((a) => {
      if (a.type !== "DISCARD") return { a, s: 0 };
      let s = 0;
      s += a.resources.ore * 3 + a.resources.wheat * 2;
      s -= a.resources.wood + a.resources.brick;
      return { a, s };
    });
    scored.sort((x, y) => x.s - y.s);
    return scored[0]?.a ?? legal[0]!;
  }

  if (state.phase.type === "moveRobber") {
    const leader = leaderId(state);
    const moves = legal.filter((a) => a.type === "MOVE_ROBBER");
    let best = moves[0]!;
    let bestScore = -Infinity;
    for (const m of moves) {
      if (m.type !== "MOVE_ROBBER") continue;
      const hex = state.board.hexes[m.hexId];
      if (!hex) continue;
      const pip = hex.number ? (PIP[hex.number] ?? 0) : 0;
      let sc = pip;
      if (m.stealFrom === leader) sc += 8;
      if (m.stealFrom) sc += 3;
      if (hex.terrain === "desert") sc -= 4;
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    return best;
  }

  if (state.phase.type === "steal") return legal[0]!;
  if (state.phase.type === "roll") {
    const knight = legal.find((a) => a.type === "PLAY_KNIGHT");
    if (knight && Math.random() < 0.15) return knight;
    return legal.find((a) => a.type === "ROLL") ?? legal[0]!;
  }

  const cities = legal.filter((a) => a.type === "BUILD_CITY");
  if (cities.length) {
    cities.sort((a, b) => {
      if (a.type !== "BUILD_CITY" || b.type !== "BUILD_CITY") return 0;
      return vertexScore(state, b.vertexId) - vertexScore(state, a.vertexId);
    });
    return cities[0]!;
  }

  const settles = legal.filter((a) => a.type === "BUILD_SETTLEMENT");
  if (settles.length) {
    settles.sort((a, b) => {
      if (a.type !== "BUILD_SETTLEMENT" || b.type !== "BUILD_SETTLEMENT") return 0;
      return vertexScore(state, b.vertexId) - vertexScore(state, a.vertexId);
    });
    return settles[0]!;
  }

  const offers = legal.filter((a) => a.type === "ACCEPT_TRADE");
  for (const o of offers) {
    if (o.type !== "ACCEPT_TRADE") continue;
    const offer = state.tradeOffers.find((t) => t.id === o.offerId);
    if (!offer) continue;
    const after = { ...player.resources };
    for (const r of RESOURCES) {
      after[r] += offer.give[r];
      after[r] -= offer.want[r];
    }
    const fake = { ...player, resources: after };
    if (missingFor(fake, "city") < missingFor(player, "city")) return o;
    if (missingFor(fake, "settlement") < missingFor(player, "settlement")) return o;
  }

  if (missingFor(player, "city") === 0 || missingFor(player, "settlement") === 0) {
    /* resources already handled by builds */
  }

  const roads = legal.filter((a) => a.type === "BUILD_ROAD");
  if (roads.length && (player.roads.length < 5 || missingFor(player, "settlement") <= 2)) {
    return roads[0]!;
  }

  const buy = legal.find((a) => a.type === "BUY_DEV");
  if (buy && countResources(player.resources) >= 6) return buy;

  const year = legal.find((a) => a.type === "PLAY_YEAR_OF_PLENTY");
  if (year) return year;
  const knight = legal.find((a) => a.type === "PLAY_KNIGHT");
  if (knight) return knight;

  const trades = legal.filter((a) => a.type === "TRADE_BANK");
  if (trades.length && missingFor(player, "city") > 0) {
    const wantOre = player.resources.ore < 3;
    const wantWheat = player.resources.wheat < 2;
    const t = trades.find((a) => a.type === "TRADE_BANK" && ((wantOre && a.take === "ore") || (wantWheat && a.take === "wheat")));
    if (t) return t;
  }

  return legal.find((a) => a.type === "END_TURN") ?? legal[0]!;
}

export function botDelayMs(): number {
  return 450 + Math.floor(Math.random() * 350);
}

export function whoseTurn(state: GameState): PlayerId {
  if (state.phase.type === "discard") return state.phase.queue[0]!;
  return currentPlayer(state).id;
}

export function nextBotAction(state: GameState): Action | null {
  if (state.phase.type === "gameOver") return null;
  const actor = whoseTurn(state);
  const actorP = state.players.find((p) => p.id === actor);
  if (actorP?.isBot) return chooseBotAction(state, actor);
  for (const other of state.players) {
    if (!other.isBot || other.id === actor) continue;
    const act = chooseBotAction(state, other.id);
    if (act) return act;
  }
  return null;
}
