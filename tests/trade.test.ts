import { describe, expect, it } from "vitest";
import { emptyResources } from "../src/core/resources.ts";
import { must, reduce } from "../src/core/reduce.ts";
import type { ResourceMap } from "../src/core/types.ts";
import { buildScenario } from "../src/dev/scenarios.ts";

function bag(partial: Partial<ResourceMap> = {}): ResourceMap {
  return { ...emptyResources(), ...partial };
}

const offer = {
  type: "OFFER_TRADE" as const,
  playerId: "p1",
  give: bag({ wood: 2 }),
  want: bag({ wheat: 1 }),
};

describe("troca entre jogadores", () => {
  it("gera id único com o registro cheio", () => {
    const state = buildScenario("troca");
    state.log = Array.from({ length: 80 }, () => ({ text: "linha" }));
    const first = must(state, offer);
    const id1 = first.tradeOffers[0]!.id;
    const cancelled = must(first, { type: "CANCEL_TRADE", playerId: "p1", offerId: id1 });
    const second = must(cancelled, offer);
    expect(second.tradeOffers[0]!.id).not.toBe(id1);
  });

  it("uma recusa mantém a oferta para os outros", () => {
    const opened = must(buildScenario("troca"), offer);
    const id = opened.tradeOffers[0]!.id;
    const rejected = must(opened, { type: "REJECT_TRADE", playerId: "p2", offerId: id });
    expect(rejected.tradeOffers).toHaveLength(1);
    expect(rejected.tradeOffers[0]!.responses.p2).toBe("rejected");
    expect(rejected.tradeOffers[0]!.responses.p3).toBe("pending");
    expect(rejected.tradeOffers[0]!.responses.p4).toBe("pending");
  });

  it("aceitar sem cartas falha", () => {
    const opened = must(buildScenario("troca"), offer);
    const id = opened.tradeOffers[0]!.id;
    const poor = structuredClone(opened);
    const buyer = poor.players.find((player) => player.id === "p3");
    if (!buyer) throw new Error("Lenhadora ausente");
    buyer.resources.wheat = 0;
    const result = reduce(poor, { type: "ACCEPT_TRADE", playerId: "p3", offerId: id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("cannot-afford");
  });

  it("a oferta some no fim do turno", () => {
    const opened = must(buildScenario("troca"), offer);
    const ended = must(opened, { type: "END_TURN", playerId: "p1" });
    expect(ended.tradeOffers).toHaveLength(0);
  });

  it("fecha com a Lenhadora e escreve o registro", () => {
    const state = buildScenario("troca");
    const lumber = state.players.find((player) => player.id === "p3");
    if (!lumber) throw new Error("Lenhadora ausente");
    lumber.resources.wood = 0;
    const opened = must(state, offer);
    const id = opened.tradeOffers[0]!.id;
    const marked = must(opened, { type: "ACCEPT_TRADE", playerId: "p3", offerId: id });
    expect(marked.tradeOffers).toHaveLength(1);
    expect(marked.tradeOffers[0]!.responses.p3).toBe("accepted");
    expect(reduce(marked, { type: "ACCEPT_TRADE", playerId: "p3", offerId: id }).ok).toBe(false);
    expect(reduce(marked, { type: "CONFIRM_TRADE", playerId: "p3", offerId: id, with: "p3" }).ok).toBe(false);
    expect(reduce(marked, { type: "CONFIRM_TRADE", playerId: "p1", offerId: id, with: "p2" }).ok).toBe(false);
    const closed = must(marked, { type: "CONFIRM_TRADE", playerId: "p1", offerId: id, with: "p3" });
    expect(closed.tradeOffers).toHaveLength(0);
    expect(closed.log.some((line) => line.text === "Você trocou 2 madeira por 1 trigo com Lenhadora.")).toBe(true);
    const you = closed.players.find((player) => player.id === "p1");
    expect(you?.resources.wood).toBe(1);
    expect(you?.resources.wheat).toBe(1);
  });
  it("quem não tem o que a oferta pede nem é consultado", () => {
    const state = buildScenario("troca");
    const poor = state.players.find((player) => player.id === "p3");
    if (!poor) throw new Error("Lenhadora ausente");
    poor.resources.wheat = 0;
    const opened = must(state, offer);
    expect(opened.tradeOffers[0]!.responses.p3).toBe("rejected");
    expect(opened.tradeOffers[0]!.responses.p2).toBe("pending");
    expect(opened.log.some((line) => line.text === "Você ofereceu 2 madeira por 1 trigo.")).toBe(true);
  });

  it("se ninguém tem o pedido, a oferta nem abre e fica no registro", () => {
    const state = buildScenario("troca");
    for (const player of state.players) if (player.id !== "p1") player.resources.wheat = 0;
    const opened = must(state, offer);
    expect(opened.tradeOffers).toHaveLength(0);
    expect(opened.log.some((line) => line.text === "Ninguém tinha o que foi pedido.")).toBe(true);
  });
});
