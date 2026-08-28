import { describe, expect, it } from "vitest";
import { createGame, reduce } from "../src/core/reduce.ts";
import { legalActions } from "../src/core/legal.ts";
import { chooseBotAction } from "../src/ai/bot.ts";
import type { GameState } from "../src/core/types.ts";

function botGame(seed = 99): GameState {
  return createGame({
    seed,
    setup: "random",
    players: [
      { name: "BotA", color: "#c44536", isBot: true, id: "p1" },
      { name: "BotB", color: "#2b6cb0", isBot: true, id: "p2" },
      { name: "BotC", color: "#d97706", isBot: true, id: "p3" },
      { name: "BotD", color: "#e8e0d0", isBot: true, id: "p4" },
    ],
  });
}

function stepBots(state: GameState): GameState {
  const actor =
    state.phase.type === "discard"
      ? state.phase.queue[0]
      : state.players[state.currentPlayerIndex]!.id;
  const legal = legalActions(state, actor!);
  if (legal.length === 0) {
    throw new Error(`sem ações legais em ${state.phase.type} para ${actor}`);
  }
  const pick = chooseBotAction(state, actor!) ?? legal[0]!;
  const r = reduce(state, pick);
  if (!r.ok) {
    throw new Error(`bot ilegal ${pick.type}: ${r.error.message}`);
  }
  return r.state;
}

describe("integração 4 bots", () => {
  it("joga 80 turnos sem RuleError interno", () => {
    let s = botGame(123);
    let guard = 0;
    while (s.phase.type !== "gameOver" && s.turnNumber < 80 && guard < 4000) {
      s = stepBots(s);
      guard += 1;
    }
    expect(guard).toBeGreaterThan(16);
    expect(s.phase.type === "gameOver" || s.turnNumber >= 80).toBe(true);
    for (const p of s.players) {
      expect(p.settlements.length + p.cities.length).toBeGreaterThanOrEqual(2);
    }
  });
});
