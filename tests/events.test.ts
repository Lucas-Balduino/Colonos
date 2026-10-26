import { describe, expect, it } from "vitest";
import { legalActions } from "../src/core/legal.ts";
import { reduce } from "../src/core/reduce.ts";
import { RESOURCES, type GameEvent, type PlayerId, type Resource } from "../src/core/types.ts";
import { projectEventsFor } from "../src/core/view.ts";
import { buildScenario } from "../src/dev/scenarios.ts";

function producedSum(events: GameEvent[], playerId: PlayerId): Record<Resource, number> {
  const sum = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  for (const event of events) {
    if (event.type === "produced" && event.playerId === playerId) sum[event.resource] += event.amount;
  }
  return sum;
}

describe("eventos do motor", () => {
  it("soma de produced bate com a mão depois do rolamento", () => {
    const before = buildScenario("turno");
    const hands = new Map(before.players.map((player) => [player.id, { ...player.resources }]));
    const result = reduce(before, { type: "ROLL", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((event) => event.type === "rolled")).toBe(true);
    for (const event of result.events) {
      if (event.type === "produced") expect(event.amount).toBeGreaterThan(0);
    }
    for (const player of result.state.players) {
      const sum = producedSum(result.events, player.id);
      const prev = hands.get(player.id)!;
      for (const resource of RESOURCES) {
        expect(sum[resource]).toBe(player.resources[resource] - prev[resource]);
      }
    }
  });

  it("esconde o recurso roubado de um terceiro", () => {
    const state = buildScenario("ladrao-dois-vizinhos");
    const move = legalActions(state, "p1").find((action) => action.type === "MOVE_ROBBER" && action.stealFrom === "p2");
    expect(move).toBeTruthy();
    const result = reduce(state, move!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stole = result.events.find((event) => event.type === "stole");
    expect(stole && stole.type === "stole" ? stole.resource : null).not.toBeNull();
    const third = projectEventsFor(result.events, "p4").find((event) => event.type === "stole");
    expect(third && third.type === "stole" ? third.resource : "ausente").toBeNull();
    const thief = projectEventsFor(result.events, "p1").find((event) => event.type === "stole");
    expect(thief && thief.type === "stole" ? thief.resource : null).not.toBeNull();
    const victim = projectEventsFor(result.events, "p2").find((event) => event.type === "stole");
    expect(victim && victim.type === "stole" ? victim.resource : null).not.toBeNull();
  });

  it("emite built em cada construção", () => {
    const fresh = buildScenario("fundacao");
    const place = legalActions(fresh, "p1").find((action) => action.type === "PLACE_SETTLEMENT");
    expect(place?.type).toBe("PLACE_SETTLEMENT");
    const settled = reduce(fresh, place!);
    expect(settled.ok).toBe(true);
    if (!settled.ok || place?.type !== "PLACE_SETTLEMENT") return;
    expect(settled.events).toContainEqual({
      type: "built",
      kind: "settlement",
      id: place.vertexId,
      playerId: "p1",
    });

    const road = legalActions(settled.state, "p1").find((action) => action.type === "PLACE_ROAD");
    expect(road?.type).toBe("PLACE_ROAD");
    const paved = reduce(settled.state, road!);
    expect(paved.ok).toBe(true);
    if (!paved.ok || road?.type !== "PLACE_ROAD") return;
    expect(
      paved.events.some((event) => event.type === "built" && event.kind === "road" && event.id === road.edgeId),
    ).toBe(true);

    const main = buildScenario("construir");
    const builtRoad = legalActions(main, "p1").find((action) => action.type === "BUILD_ROAD");
    expect(builtRoad?.type).toBe("BUILD_ROAD");
    const roadResult = reduce(main, builtRoad!);
    expect(roadResult.ok).toBe(true);
    if (!roadResult.ok || builtRoad?.type !== "BUILD_ROAD") return;
    expect(
      roadResult.events.some((event) => event.type === "built" && event.kind === "road" && event.id === builtRoad.edgeId),
    ).toBe(true);

    const city = legalActions(main, "p1").find((action) => action.type === "BUILD_CITY");
    expect(city?.type).toBe("BUILD_CITY");
    const cityResult = reduce(main, city!);
    expect(cityResult.ok).toBe(true);
    if (!cityResult.ok || city?.type !== "BUILD_CITY") return;
    expect(cityResult.events).toContainEqual({
      type: "built",
      kind: "city",
      id: city.vertexId,
      playerId: "p1",
    });

    const rich = buildScenario("construir");
    const who = rich.players.find((player) => player.id === "p1");
    if (!who) throw new Error("sem jogador");
    who.resources.wood += 3;
    who.resources.brick += 3;
    rich.bank.wood = Math.max(0, rich.bank.wood - 3);
    rich.bank.brick = Math.max(0, rich.bank.brick - 3);
    let cursor = rich;
    for (let step = 0; step < 4 && !legalActions(cursor, "p1").some((action) => action.type === "BUILD_SETTLEMENT"); step++) {
      const extra = legalActions(cursor, "p1").find((action) => action.type === "BUILD_ROAD");
      expect(extra?.type).toBe("BUILD_ROAD");
      const pavedMore = reduce(cursor, extra!);
      expect(pavedMore.ok).toBe(true);
      if (!pavedMore.ok || extra?.type !== "BUILD_ROAD") return;
      expect(
        pavedMore.events.some((event) => event.type === "built" && event.kind === "road" && event.id === extra.edgeId),
      ).toBe(true);
      cursor = pavedMore.state;
    }
    const village = legalActions(cursor, "p1").find((action) => action.type === "BUILD_SETTLEMENT");
    expect(village?.type).toBe("BUILD_SETTLEMENT");
    const villageResult = reduce(cursor, village!);
    expect(villageResult.ok).toBe(true);
    if (!villageResult.ok || village?.type !== "BUILD_SETTLEMENT") return;
    expect(villageResult.events).toContainEqual({
      type: "built",
      kind: "settlement",
      id: village.vertexId,
      playerId: "p1",
    });
  });
});
