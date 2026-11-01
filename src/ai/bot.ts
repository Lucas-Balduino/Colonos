import { legalActions } from "../core/legal.ts";
import { RESOURCES } from "../core/types.ts";
import type { Action, GameState, Player, PlayerId, Resource, ResourceMap, TradeOffer } from "../core/types.ts";
import { COSTS, countResources, emptyResources } from "../core/resources.ts";
import { totalVictoryPoints, visibleVictoryPoints } from "../core/scoring.ts";
import { bestBankRatio, currentPlayer, distanceOk } from "../core/rules.ts";

/**
 * Heuristic bots. They plan one goal at a time (city, settlement, road toward
 * the best free spot, or a development card), trade toward that goal with the
 * bank and the table, and use every development card. No randomness: the same
 * state always gives the same choice.
 */

const PIP: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

type Goal = "city" | "settlement" | "road" | "dev";

const GOAL_COST: Record<Goal, Partial<ResourceMap>> = {
  city: COSTS.city,
  settlement: COSTS.settlement,
  road: COSTS.road,
  dev: COSTS.dev,
};

// ---------- board reading ----------

/** Expected production of each resource for a player, in pips. */
function production(state: GameState, player: Player): ResourceMap {
  const out = emptyResources();
  for (const [ids, mult] of [
    [player.settlements, 1],
    [player.cities, 2],
  ] as const) {
    for (const vid of ids) {
      for (const hid of state.board.vertices[vid]?.hexes ?? []) {
        const h = state.board.hexes[hid];
        if (!h || h.terrain === "desert" || h.number === null) continue;
        out[h.terrain] += (PIP[h.number] ?? 0) * mult;
      }
    }
  }
  return out;
}

/** How good a free intersection is for this player. */
function spotValue(state: GameState, player: Player, vertexId: string): number {
  const v = state.board.vertices[vertexId];
  if (!v) return 0;
  const have = production(state, player);
  let value = 0;
  const kinds = new Set<Resource>();
  for (const hid of v.hexes) {
    const h = state.board.hexes[hid];
    if (!h || h.terrain === "desert" || h.number === null) continue;
    const pip = PIP[h.number] ?? 0;
    // Resources the player barely produces are worth more.
    const scarcity = have[h.terrain] === 0 ? 1.5 : have[h.terrain] < 4 ? 1.2 : 1;
    // Early on, wood and brick drive expansion; later, ore and wheat drive cities.
    const phaseBias =
      player.settlements.length + player.cities.length < 4
        ? h.terrain === "wood" || h.terrain === "brick"
          ? 1.1
          : 1
        : h.terrain === "ore" || h.terrain === "wheat"
          ? 1.15
          : 1;
    value += pip * scarcity * phaseBias * (hid === state.board.robberHexId ? 0.4 : 1);
    kinds.add(h.terrain);
  }
  value += kinds.size * 0.8;
  for (const port of state.board.ports) {
    if (!port.vertices.includes(vertexId)) continue;
    if (port.resource === "any") value += 1.2;
    else value += have[port.resource] >= 5 ? 3 : 1;
  }
  return value;
}

interface Expansion {
  vertexId: string;
  depth: number;
  firstEdge: string | null;
  score: number;
}

/**
 * Free spots reachable from the player's network, with the first road to build
 * toward each. Depth 0 means a settlement can go there right now.
 */
function expansions(state: GameState, player: Player, maxDepth = 3): Expansion[] {
  const { vertices, edges } = state.board;
  const start = new Set<string>();
  for (const eid of player.roads) for (const v of edges[eid]!.vertices) start.add(v);
  for (const v of [...player.settlements, ...player.cities]) start.add(v);

  const seen = new Map<string, { depth: number; firstEdge: string | null }>();
  let frontier: string[] = [];
  for (const v of start) {
    seen.set(v, { depth: 0, firstEdge: null });
    frontier.push(v);
  }
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: string[] = [];
    for (const v of frontier) {
      const owner = vertices[v]!.building?.owner;
      if (owner && owner !== player.id) continue; // can't pass through rivals
      for (const eid of vertices[v]!.edges) {
        const e = edges[eid]!;
        if (e.road) continue;
        const other = e.vertices[0] === v ? e.vertices[1] : e.vertices[0];
        if (seen.has(other)) continue;
        seen.set(other, { depth, firstEdge: seen.get(v)!.firstEdge ?? eid });
        next.push(other);
      }
    }
    frontier = next;
  }

  const out: Expansion[] = [];
  for (const [vertexId, info] of seen) {
    if (!distanceOk(state, vertexId)) continue;
    if (vertices[vertexId]!.hexes.length === 0) continue;
    // A depth-0 spot must touch one of our roads to be buildable.
    if (info.depth === 0 && !vertices[vertexId]!.edges.some((eid) => edges[eid]!.road === player.id)) continue;
    out.push({ ...info, vertexId, score: spotValue(state, player, vertexId) - info.depth * 2.2 });
  }
  return out.sort((a, b) => b.score - a.score);
}

function missing(resources: ResourceMap, cost: Partial<ResourceMap>): ResourceMap {
  const out = emptyResources();
  for (const r of RESOURCES) out[r] = Math.max(0, (cost[r] ?? 0) - resources[r]);
  return out;
}

function chooseGoal(state: GameState, player: Player): { goal: Goal; target: Expansion | null } {
  const spots = player.settlementsLeft > 0 ? expansions(state, player) : [];
  const ready = spots.find((s) => s.depth === 0) ?? null;
  const reachable = spots.find((s) => s.depth > 0 && s.firstEdge) ?? null;
  const missCity = countResources(missing(player.resources, COSTS.city));
  const missSettle = countResources(missing(player.resources, COSTS.settlement));

  if (player.settlements.length > 0 && player.citiesLeft > 0 && missCity <= 1) return { goal: "city", target: null };
  if (ready) return { goal: "settlement", target: ready };
  if (reachable && player.roadsLeft > 0 && (missSettle <= 2 || player.roads.length < 6)) {
    return { goal: "road", target: reachable };
  }
  if (player.settlements.length > 0 && player.citiesLeft > 0) return { goal: "city", target: null };
  if (reachable && player.roadsLeft > 0) return { goal: "road", target: reachable };
  return { goal: "dev", target: null };
}

/** Cards the player can spare without hurting the current goal. */
function surplus(player: Player, goal: Goal): ResourceMap {
  const out = emptyResources();
  const cost = GOAL_COST[goal];
  for (const r of RESOURCES) out[r] = Math.max(0, player.resources[r] - (cost[r] ?? 0));
  return out;
}

function leaderId(state: GameState, except?: PlayerId): PlayerId | null {
  let best: PlayerId | null = null;
  let bestVp = -1;
  for (const p of state.players) {
    if (p.id === except) continue;
    const vp = visibleVictoryPoints(p, state.longestRoadPlayerId, state.largestArmyPlayerId) + p.devCards.length * 0.3;
    if (vp > bestVp) {
      best = p.id;
      bestVp = vp;
    }
  }
  return best;
}

function vp(state: GameState, player: Player): number {
  return totalVictoryPoints(player, state.longestRoadPlayerId, state.largestArmyPlayerId);
}

// ---------- trading with the table ----------

export function botTradeResponse(state: GameState, botId: PlayerId, offer: TradeOffer): "accept" | "reject" {
  const player = state.players.find((p) => p.id === botId);
  if (!player || offer.from === botId) return "reject";
  const owner = state.players.find((p) => p.id === offer.from);
  // Nobody helps a player about to win.
  if (owner && visibleVictoryPoints(owner, state.longestRoadPlayerId, state.largestArmyPlayerId) >= 8) return "reject";
  const after = { ...player.resources };
  for (const r of RESOURCES) {
    after[r] += offer.give[r] - offer.want[r];
    if (after[r] < 0) return "reject";
  }
  const { goal } = chooseGoal(state, player);
  const cost = GOAL_COST[goal];
  const before = countResources(missing(player.resources, cost));
  const later = countResources(missing(after, cost));
  if (later < before) return "accept";
  // A fair-or-better deal that doesn't touch the goal is fine too.
  const gives = countResources(offer.want);
  const gets = countResources(offer.give);
  if (later === before && gets > gives) return "accept";
  // An even swap that doesn't touch the goal: take it when the bot gets a
  // resource it lacks and keeps at least one of what it gives.
  if (later === before && gets === gives) {
    const fresh = RESOURCES.some((r) => offer.give[r] > 0 && player.resources[r] === 0);
    const keepsSome = RESOURCES.every((r) => offer.want[r] === 0 || after[r] >= 1);
    if (fresh && keepsSome) return "accept";
  }
  return "reject";
}

function tradeReply(state: GameState, playerId: PlayerId): Action | null {
  for (const offer of state.tradeOffers) {
    if (offer.from === playerId || offer.responses[playerId] !== "pending") continue;
    return botTradeResponse(state, playerId, offer) === "accept"
      ? { type: "ACCEPT_TRADE", playerId, offerId: offer.id }
      : { type: "REJECT_TRADE", playerId, offerId: offer.id };
  }
  return null;
}

export function pendingBotTrades(state: GameState): Action[] {
  if (state.phase.type !== "main") return [];
  const actions: Action[] = [];
  for (const player of state.players) {
    if (!player.isBot) continue;
    const reply = tradeReply(state, player.id);
    if (reply) actions.push(reply);
  }
  return actions;
}

/** A bot's own open offer that only humans still have to answer. */
export function staleBotOffer(state: GameState): Action | null {
  const actor = currentPlayer(state);
  if (!actor.isBot) return null;
  const offer = state.tradeOffers.find((o) => o.from === actor.id);
  if (!offer) return null;
  return { type: "CANCEL_TRADE", playerId: actor.id, offerId: offer.id };
}

function proposeTrade(state: GameState, player: Player, goal: Goal): Action | null {
  if ((state.offersThisTurn ?? 0) >= 2 || state.tradeOffers.length > 0) return null;
  const need = missing(player.resources, GOAL_COST[goal]);
  if (countResources(need) === 0 || countResources(need) > 2) return null;
  const spare = surplus(player, goal);
  const wantRes = RESOURCES.find((r) => need[r] > 0);
  // Offer what we have most of, never what the goal needs.
  const giveRes = [...RESOURCES].filter((r) => spare[r] > 0).sort((a, b) => spare[b] - spare[a])[0];
  if (!wantRes || !giveRes) return null;
  const give = emptyResources();
  const want = emptyResources();
  want[wantRes] = 1;
  give[giveRes] = spare[giveRes] >= 3 && (state.offersThisTurn ?? 0) > 0 ? 2 : 1;
  return { type: "OFFER_TRADE", playerId: player.id, give, want };
}

// ---------- the turn ----------

function pickBankTrade(state: GameState, player: Player, goal: Goal, legal: Action[]): Action | null {
  const need = missing(player.resources, GOAL_COST[goal]);
  if (countResources(need) === 0) return null;
  const spare = surplus(player, goal);
  let best: Action | null = null;
  let bestLeft = -1;
  for (const a of legal) {
    if (a.type !== "TRADE_BANK" || need[a.take] === 0) continue;
    const ratio = bestBankRatio(state, player, a.give);
    if (spare[a.give] < ratio) continue;
    const left = spare[a.give] - ratio;
    if (left > bestLeft) {
      best = a;
      bestLeft = left;
    }
  }
  return best;
}

function robberMove(state: GameState, player: Player, legal: Action[]): Action {
  const leader = leaderId(state, player.id);
  let best = legal[0]!;
  let bestScore = -Infinity;
  for (const a of legal) {
    if (a.type !== "MOVE_ROBBER") continue;
    const hex = state.board.hexes[a.hexId]!;
    const pip = hex.number ? (PIP[hex.number] ?? 0) : 0;
    let score = 0;
    for (const vid of hex.vertices) {
      const b = state.board.vertices[vid]?.building;
      if (!b) continue;
      const weight = b.type === "city" ? 2 : 1;
      if (b.owner === player.id) score -= pip * weight * 3;
      else score += pip * weight * (b.owner === leader ? 1.6 : 1);
    }
    if (a.stealFrom) {
      const victim = state.players.find((p) => p.id === a.stealFrom)!;
      score += 2 + countResources(victim.resources) * 0.4 + (a.stealFrom === leader ? 2 : 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function robberHurtsMe(state: GameState, player: Player): boolean {
  const hex = state.board.hexes[state.board.robberHexId];
  if (!hex || !hex.number) return false;
  return hex.vertices.some((vid) => state.board.vertices[vid]?.building?.owner === player.id) && (PIP[hex.number] ?? 0) >= 3;
}

function wantsKnight(state: GameState, player: Player): boolean {
  if (robberHurtsMe(state, player)) return true;
  const others = Math.max(0, ...state.players.filter((p) => p.id !== player.id).map((p) => p.knightsPlayed));
  const takesArmy = player.knightsPlayed + 1 >= 3 && player.knightsPlayed + 1 > others && state.largestArmyPlayerId !== player.id;
  return takesArmy;
}

function playDevCard(state: GameState, player: Player, goal: Goal, legal: Action[], target: Expansion | null): Action | null {
  const knight = legal.find((a) => a.type === "PLAY_KNIGHT");
  if (knight && wantsKnight(state, player)) return knight;

  const need = missing(player.resources, GOAL_COST[goal]);
  if (countResources(need) > 0) {
    const plenty = legal.filter((a) => a.type === "PLAY_YEAR_OF_PLENTY");
    if (plenty.length) {
      const wanted: Resource[] = [];
      for (const r of RESOURCES) for (let i = 0; i < need[r]; i++) wanted.push(r);
      while (wanted.length < 2) wanted.push(wanted[0] ?? "ore");
      const match = plenty.find(
        (a) =>
          a.type === "PLAY_YEAR_OF_PLENTY" &&
          ((a.resources[0] === wanted[0] && a.resources[1] === wanted[1]) ||
            (a.resources[0] === wanted[1] && a.resources[1] === wanted[0])),
      );
      if (match) return match;
    }
  }

  const monopoly = legal.filter((a) => a.type === "PLAY_MONOPOLY");
  if (monopoly.length) {
    let best: Action | null = null;
    let bestValue = 2;
    for (const a of monopoly) {
      if (a.type !== "PLAY_MONOPOLY") continue;
      const held = state.players.filter((p) => p.id !== player.id).reduce((n, p) => n + p.resources[a.resource], 0);
      const value = held + need[a.resource] * 1.5;
      if (value > bestValue) {
        bestValue = value;
        best = a;
      }
    }
    if (best) return best;
  }

  const roads = legal.find((a) => a.type === "PLAY_ROAD_BUILDING");
  if (roads && target && target.depth >= 1) return roads;

  if (knight && state.phase.type === "main" && player.devCards.filter((c) => c.type === "knight").length >= 2) return knight;
  return null;
}

function roadToward(legal: Action[], target: Expansion | null, kind: "BUILD_ROAD" | "PLACE_ROAD"): Action | null {
  if (!target?.firstEdge) return null;
  return legal.find((a) => a.type === kind && a.edgeId === target.firstEdge) ?? null;
}

function setupRoad(state: GameState, player: Player, legal: Action[]): Action {
  // Point the first road at the best spot two steps away.
  let best = legal[0]!;
  let bestScore = -Infinity;
  for (const a of legal) {
    if (a.type !== "PLACE_ROAD") continue;
    const e = state.board.edges[a.edgeId]!;
    const settlement = state.phase.type === "setupRoad" ? state.phase.settlement : "";
    const far = e.vertices[0] === settlement ? e.vertices[1] : e.vertices[0];
    let score = -Infinity;
    for (const eid of state.board.vertices[far]!.edges) {
      const n = state.board.edges[eid]!;
      const spot = n.vertices[0] === far ? n.vertices[1] : n.vertices[0];
      if (spot === settlement || !distanceOk(state, spot)) continue;
      score = Math.max(score, spotValue(state, player, spot));
    }
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function discard(player: Player, goal: Goal, legal: Action[]): Action {
  const cost = GOAL_COST[goal];
  let best = legal[0]!;
  let bestScore = Infinity;
  for (const a of legal) {
    if (a.type !== "DISCARD") continue;
    let score = 0;
    for (const r of RESOURCES) {
      const keep = player.resources[r] - a.resources[r];
      // Losing cards the goal needs hurts; losing piles of extras doesn't.
      score += Math.max(0, (cost[r] ?? 0) - keep) * 3 + a.resources[r] * 0.1;
      if (keep > 3) score -= 0.5;
    }
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export function chooseBotAction(state: GameState, playerId: PlayerId): Action | null {
  const legal = legalActions(state, playerId);
  if (legal.length === 0) return null;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return legal[0]!;
  if (whoseTurn(state) !== playerId) return tradeReply(state, playerId);

  const phase = state.phase.type;

  if (phase === "setupSettlement") {
    let best = legal[0]!;
    let bestScore = -Infinity;
    for (const a of legal) {
      if (a.type !== "PLACE_SETTLEMENT") continue;
      const s = spotValue(state, player, a.vertexId);
      if (s > bestScore) {
        bestScore = s;
        best = a;
      }
    }
    return best;
  }
  if (phase === "setupRoad") return setupRoad(state, player, legal);

  const { goal, target } = chooseGoal(state, player);

  if (phase === "freeRoads") {
    const spots = expansions(state, player).filter((s) => s.depth > 0);
    for (const s of spots) {
      const road = roadToward(legal, s, "PLACE_ROAD");
      if (road) return road;
    }
    return legal[0]!;
  }
  if (phase === "discard") return discard(player, goal, legal);
  if (phase === "moveRobber") return robberMove(state, player, legal);
  if (phase === "steal") {
    const leader = leaderId(state, player.id);
    return legal.find((a) => a.type === "STEAL" && a.from === leader) ?? legal[0]!;
  }
  if (phase === "roll") {
    const knight = legal.find((a) => a.type === "PLAY_KNIGHT");
    if (knight && robberHurtsMe(state, player)) return knight;
    return legal.find((a) => a.type === "ROLL") ?? legal[0]!;
  }

  // Main phase. An open offer of ours comes first.
  const mine = state.tradeOffers.find((o) => o.from === playerId);
  if (mine) {
    const confirm = legal.find((a) => a.type === "CONFIRM_TRADE" && a.offerId === mine.id);
    if (confirm) return confirm;
    const waiting = Object.values(mine.responses).some((r) => r === "pending");
    if (waiting) return null; // the table is still answering
    return { type: "CANCEL_TRADE", playerId, offerId: mine.id };
  }

  const dev = playDevCard(state, player, goal, legal, target);
  if (dev) return dev;

  // Build whatever the goal says, if we can.
  if (goal === "city") {
    const cities = legal.filter((a) => a.type === "BUILD_CITY");
    if (cities.length) {
      return cities.sort(
        (a, b) =>
          (b.type === "BUILD_CITY" ? spotValue(state, player, b.vertexId) : 0) -
          (a.type === "BUILD_CITY" ? spotValue(state, player, a.vertexId) : 0),
      )[0]!;
    }
  }
  if (goal === "settlement" && target) {
    const build = legal.find((a) => a.type === "BUILD_SETTLEMENT" && a.vertexId === target.vertexId);
    if (build) return build;
  }
  if (goal === "road") {
    const road = roadToward(legal, target, "BUILD_ROAD");
    if (road) return road;
  }
  // Any settlement is always worth a point.
  const anySettle = legal.find((a) => a.type === "BUILD_SETTLEMENT");
  if (anySettle) return anySettle;

  const bank = pickBankTrade(state, player, goal, legal);
  if (bank) return bank;
  const offer = proposeTrade(state, player, goal);
  if (offer) return offer;

  // Leftovers: a development card, then hedge against a 7.
  const buy = legal.find((a) => a.type === "BUY_DEV");
  if (buy && (goal === "dev" || countResources(player.resources) >= 7 || vp(state, player) >= 8)) return buy;
  if (countResources(player.resources) > 7) {
    const road = roadToward(legal, expansions(state, player).find((s) => s.depth > 0) ?? null, "BUILD_ROAD");
    if (road) return road;
    if (buy) return buy;
  }

  return legal.find((a) => a.type === "END_TURN") ?? legal[0]!;
}

/** Bots answer one after another, so the table reads like people thinking. */
export function botTradeDelayMs(order = 0): number {
  return 650 + order * 420;
}

export function botDelayMs(): number {
  return 600;
}

export function whoseTurn(state: GameState): PlayerId {
  if (state.phase.type === "discard") return state.phase.queue[0]!;
  return currentPlayer(state).id;
}

export function nextBotAction(state: GameState): Action | null {
  if (state.phase.type === "gameOver") return null;
  const actor = whoseTurn(state);
  const actorP = state.players.find((p) => p.id === actor);
  if (actorP?.isBot) {
    const act = chooseBotAction(state, actor);
    if (act) return act;
  }
  for (const other of state.players) {
    if (!other.isBot || other.id === actor) continue;
    const act = tradeReply(state, other.id);
    if (act) return act;
  }
  return null;
}
