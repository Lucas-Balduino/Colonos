import { describe, expect, it } from "vitest";
import { SCENARIO_NAMES, buildScenario } from "../src/dev/scenarios.ts";
import { countResources } from "../src/core/resources.ts";
import { totalVictoryPoints } from "../src/core/scoring.ts";

describe("cenas de teste", () => {
  it("cada cena constrói na fase prometida", () => {
    for (const name of SCENARIO_NAMES) {
      const state = buildScenario(name);
      expect(state.players.find((p) => p.id === "p1")?.isBot, name).toBe(false);
      const you = state.players.find((p) => p.id === "p1")!;

      if (name === "fundacao") {
        expect(state.phase).toEqual({ type: "setupSettlement", round: 1 });
        expect(state.players[state.currentPlayerIndex]?.id).toBe("p1");
      }
      if (name === "turno") {
        expect(state.phase.type).toBe("roll");
        expect(state.players[state.currentPlayerIndex]?.id).toBe("p1");
        expect(you.resources).toEqual({ wood: 2, brick: 2, sheep: 1, wheat: 2, ore: 3 });
      }
      if (name === "construir") {
        expect(state.phase.type).toBe("main");
        expect(state.dice).toEqual([3, 4]);
        expect(you.resources).toEqual({ wood: 2, brick: 2, sheep: 1, wheat: 2, ore: 3 });
      }
      if (name === "ladrao-dois-vizinhos") {
        expect(state.phase).toEqual({ type: "moveRobber", after: "main" });
        const shared = Object.values(state.board.hexes).some((hex) => {
          const owners = new Set(
            hex.vertices.map((vid) => state.board.vertices[vid]?.building?.owner).filter(Boolean),
          );
          return owners.has("p2") && owners.has("p3") && hex.id !== state.board.robberHexId;
        });
        expect(shared).toBe(true);
        for (const id of ["p2", "p3"] as const) {
          const bot = state.players.find((p) => p.id === id)!;
          expect(countResources(bot.resources)).toBeGreaterThanOrEqual(2);
        }
      }
      if (name === "cartas") {
        expect(state.phase.type).toBe("main");
        expect(state.playedDevThisTurn).toBe(false);
        const types = you.devCards.filter((c) => c.playable).map((c) => c.type);
        expect(types).toEqual(expect.arrayContaining(["knight", "yearOfPlenty", "monopoly", "roadBuilding"]));
      }
      if (name === "porto") {
        expect(state.phase.type).toBe("main");
        const port = state.board.ports.find(
          (item) =>
            item.ratio === 2 &&
            item.resource !== "any" &&
            item.vertices.some((vid) => state.board.vertices[vid]?.building?.owner === "p1"),
        );
        expect(port).toBeTruthy();
        if (port && port.resource !== "any") expect(you.resources[port.resource]).toBeGreaterThanOrEqual(3);
      }
      if (name === "troca") {
        expect(state.phase.type).toBe("main");
        expect(you.resources).toMatchObject({ wood: 3, brick: 1, sheep: 2, wheat: 0, ore: 0 });
        for (const id of ["p2", "p3", "p4"]) {
          const bot = state.players.find((p) => p.id === id)!;
          expect(bot.resources).toEqual({ wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 2 });
        }
      }
      if (name === "descarte") {
        expect(state.phase).toEqual({ type: "discard", queue: ["p1"] });
        expect(countResources(you.resources)).toBe(9);
      }
      if (name === "fim") {
        expect(state.phase.type).toBe("main");
        expect(you.settlements.length).toBeGreaterThan(0);
        expect(you.resources.wheat).toBeGreaterThanOrEqual(2);
        expect(you.resources.ore).toBeGreaterThanOrEqual(3);
        expect(totalVictoryPoints(you, state.longestRoadPlayerId, state.largestArmyPlayerId)).toBe(9);
      }
    }
  });
});
