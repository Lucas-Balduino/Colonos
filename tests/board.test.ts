import { describe, expect, it } from "vitest";
import { createBeginnerBoard, createRandomBoard } from "../src/core/board.ts";
import { landHexes, spiralOuterFirst } from "../src/core/hex.ts";

describe("grafo hexagonal", () => {
  it("gera 19 hexes, 54 vértices e 72 arestas no tabuleiro iniciante", () => {
    const board = createBeginnerBoard();
    expect(Object.keys(board.hexes)).toHaveLength(19);
    expect(Object.keys(board.vertices)).toHaveLength(54);
    expect(Object.keys(board.edges)).toHaveLength(72);
  });

  it("coloca o ladrão no deserto e tem 9 portos", () => {
    const board = createBeginnerBoard();
    const desert = Object.values(board.hexes).find((h) => h.terrain === "desert");
    expect(desert).toBeTruthy();
    expect(board.robberHexId).toBe(desert!.id);
    expect(board.ports).toHaveLength(9);
    const generic = board.ports.filter((p) => p.resource === "any" && p.ratio === 3);
    const specific = board.ports.filter((p) => p.ratio === 2);
    expect(generic).toHaveLength(4);
    expect(specific).toHaveLength(5);
  });

  it("tem estoque oficial de terrenos", () => {
    const board = createBeginnerBoard();
    const counts: Record<string, number> = {};
    for (const h of Object.values(board.hexes)) {
      counts[h.terrain] = (counts[h.terrain] ?? 0) + 1;
    }
    expect(counts.wood).toBe(4);
    expect(counts.sheep).toBe(4);
    expect(counts.wheat).toBe(4);
    expect(counts.brick).toBe(3);
    expect(counts.ore).toBe(3);
    expect(counts.desert).toBe(1);
  });

  it("tokens numerados são o conjunto oficial sem 7", () => {
    const board = createBeginnerBoard();
    const nums = Object.values(board.hexes)
      .map((h) => h.number)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    expect(nums).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  });

  it("tabuleiro aleatório também tem 19/54/72", () => {
    const { board } = createRandomBoard(42);
    expect(Object.keys(board.hexes)).toHaveLength(19);
    expect(Object.keys(board.vertices)).toHaveLength(54);
    expect(Object.keys(board.edges)).toHaveLength(72);
  });

  it("spiral e land cobrem os mesmos 19 hexes", () => {
    const a = landHexes(2).map((h) => `${h.q},${h.r}`).sort();
    const b = spiralOuterFirst(2).map((h) => `${h.q},${h.r}`).sort();
    expect(a).toEqual(b);
    expect(a).toHaveLength(19);
  });

  it("cada hex tem 6 vértices e 6 arestas", () => {
    const board = createBeginnerBoard();
    for (const h of Object.values(board.hexes)) {
      expect(h.vertices).toHaveLength(6);
      expect(h.edges).toHaveLength(6);
    }
  });
});
