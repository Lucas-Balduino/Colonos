import { describe, expect, it } from "vitest";
import { parseClientMsg } from "../src/server/validate.ts";

describe("parseClientMsg", () => {
  it("aceita criar, entrar, iniciar e agir", () => {
    expect(parseClientMsg(JSON.stringify({ type: "create", name: "Ana", bots: 1, setup: "beginner" }))).toEqual({
      type: "create",
      name: "Ana",
      bots: 1,
      setup: "beginner",
    });
    expect(parseClientMsg(JSON.stringify({ type: "join", code: "ab23cd", name: "Bia", token: "tok" }))).toEqual({
      type: "join",
      code: "AB23CD",
      name: "Bia",
      token: "tok",
    });
    expect(parseClientMsg(JSON.stringify({ type: "start" }))).toEqual({ type: "start" });
    expect(parseClientMsg(JSON.stringify({ type: "action", action: { type: "ROLL", playerId: "p1" } }))).toEqual({
      type: "action",
      action: { type: "ROLL", playerId: "p1" },
    });
  });

  it("rejeita join sem código, lixo, bots fora da faixa e código curto", () => {
    expect(parseClientMsg('{"type":"join"}')).toBeNull();
    expect(parseClientMsg("lixo")).toBeNull();
    expect(parseClientMsg(JSON.stringify({ type: "create", name: "Ana", bots: 9, setup: "beginner" }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ type: "join", code: "ab", name: "Bia" }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ type: "create", name: "Nome grande demais!!", bots: 0, setup: "random" }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ type: "action", action: { type: "ROLL" } }))).toBeNull();
    expect(parseClientMsg("[]")).toBeNull();
  });
});
