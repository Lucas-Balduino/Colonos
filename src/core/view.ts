import { legalActions } from "./legal.ts";
import { countResources } from "./resources.ts";
import { bestBankRatio } from "./rules.ts";
import { longestRoadLength, totalVictoryPoints, visibleVictoryPoints } from "./scoring.ts";
import {
  RESOURCES,
  type GameEvent,
  type GameState,
  type Player,
  type PlayerId,
  type PublicView,
  type Resource,
} from "./types.ts";

function bankRatiosFor(state: GameState, player: Player): Record<Resource, 2 | 3 | 4> {
  const ratios = {} as Record<Resource, 2 | 3 | 4>;
  for (const resource of RESOURCES) ratios[resource] = bestBankRatio(state, player, resource);
  return ratios;
}

export function projectEventsFor(events: GameEvent[], viewerId: PlayerId | null): GameEvent[] {
  return events.map((event) => {
    if (event.type !== "stole") return event;
    if (viewerId === event.thief || viewerId === event.victim) return event;
    return { ...event, resource: null };
  });
}

export function projectStateFor(state: GameState, viewerId: PlayerId | null): PublicView {
  const current = state.players[state.currentPlayerIndex]!;
  return {
    you: viewerId,
    board: state.board,
    players: state.players.map((p) => {
      const isYou = p.id === viewerId;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        isBot: p.isBot,
        resourceCount: countResources(p.resources),
        settlementCount: p.settlements.length,
        cityCount: p.cities.length,
        roadCount: p.roads.length,
        roadLength: longestRoadLength(state.board, p, state.players),
        devCount: p.devCards.length,
        knightsPlayed: p.knightsPlayed,
        publicVp: visibleVictoryPoints(p, state.longestRoadPlayerId, state.largestArmyPlayerId),
        isYou,
        resources: isYou ? p.resources : undefined,
        devCards: isYou ? p.devCards : undefined,
        bankRatios: isYou ? bankRatiosFor(state, p) : undefined,
      };
    }),
    currentPlayerId: current.id,
    phase: state.phase,
    dice: state.dice,
    bank: state.bank,
    tradeOffers: state.tradeOffers,
    longestRoadPlayerId: state.longestRoadPlayerId,
    largestArmyPlayerId: state.largestArmyPlayerId,
    turnNumber: state.turnNumber,
    log: state.log,
    legal: viewerId ? legalActions(state, viewerId) : [],
    setup: state.setup,
    winnerId: state.phase.type === "gameOver" ? state.phase.winner : null,
    final:
      state.phase.type === "gameOver"
        ? state.players.map((p) => ({
            id: p.id,
            total: totalVictoryPoints(p, state.longestRoadPlayerId, state.largestArmyPlayerId),
            victoryCards: p.devCards.filter((c) => c.type === "victory").length,
          }))
        : undefined,
  };
}
