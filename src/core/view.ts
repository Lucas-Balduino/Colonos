import { legalActions } from "./legal.ts";
import { countResources } from "./resources.ts";
import { visibleVictoryPoints } from "./scoring.ts";
import type { GameState, PlayerId, PublicView } from "./types.ts";

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
        devCount: p.devCards.length,
        knightsPlayed: p.knightsPlayed,
        publicVp: visibleVictoryPoints(p, state.longestRoadPlayerId, state.largestArmyPlayerId),
        isYou,
        resources: isYou ? p.resources : undefined,
        devCards: isYou ? p.devCards : undefined,
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
  };
}
