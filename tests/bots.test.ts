import { describe, expect, it } from "vitest";
import { createGame, reduce } from "../src/core/reduce.ts";
import { nextBotAction, staleBotOffer } from "../src/ai/bot.ts";
import type { GameState } from "../src/core/types.ts";

function playOut(seed: number): GameState {
  let s = createGame({
    seed,
    setup: "random",
    players: [0, 1, 2, 3].map((i) => ({ name: `Bot${i}`, color: "", isBot: true })),
  });
  for (let step = 0; step < 20000 && s.phase.type !== "gameOver"; step++) {
    const action = nextBotAction(s) ?? staleBotOffer(s);
    if (!action) throw new Error(`travou em ${s.phase.type}`);
    const r = reduce(s, action);
    if (!r.ok) throw new Error(`${action.type}: ${r.error.message}`);
    s = r.state;
  }
  return s;
}

describe("bots", () => {
  it("terminam partidas num ritmo de jogo de verdade", () => {
    const rounds: number[] = [];
    for (const seed of [11, 23, 37, 41, 53, 67]) {
      const s = playOut(seed);
      expect(s.phase.type).toBe("gameOver");
      rounds.push(s.turnNumber);
    }
    rounds.sort((a, b) => a - b);
    expect(rounds[Math.floor(rounds.length / 2)]).toBeLessThanOrEqual(25);
  });

  it("são determinísticos: a mesma semente gera o mesmo registro", () => {
    expect(playOut(5).log).toEqual(playOut(5).log);
  });
});
