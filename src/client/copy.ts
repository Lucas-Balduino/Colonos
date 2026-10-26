import type { Phase } from "../core/types.ts";

export type BuildMode = "road" | "settlement" | "city";

export function buildModeCopy(mode: BuildMode): string {
  if (mode === "road") return "Escolha onde abrir a estrada.";
  if (mode === "settlement") return "Escolha onde fundar a aldeia.";
  return "Escolha qual aldeia vira cidade.";
}

export const RESOURCE_SHORT: Record<string, string> = {
  wood: "MA",
  brick: "TI",
  sheep: "LA",
  wheat: "TR",
  ore: "MI",
};

export function phaseCopy(phase: Phase, yourTurn: boolean): string {
  switch (phase.type) {
    case "setupSettlement":
      return yourTurn
        ? `Rodada ${phase.round}: funde uma aldeia no mapa.`
        : "Aguardando o rival fundar uma aldeia…";
    case "setupRoad":
      return yourTurn ? "Ligue uma estrada à aldeia recém-fundada." : "Aguardando a estrada inicial…";
    case "roll":
      return yourTurn ? "Role os dados (ou jogue um cavaleiro)." : "Esperando a rolagem…";
    case "discard":
      return "Um 7! Quem tem mais de 7 cartas descarta a metade.";
    case "moveRobber":
      return yourTurn ? "Mova o ladrão para outro terreno." : "O ladrão está à solta…";
    case "steal":
      return yourTurn ? "Escolha de quem roubar uma carta." : "Roubo em andamento…";
    case "main":
      return yourTurn ? "Comercie, construa ou encerre o turno." : "Turno do rival.";
    case "freeRoads":
      return yourTurn ? `Construção de estradas: ${phase.remaining} grátis.` : "Estradas grátis…";
    case "gameOver":
      return "Fim de jogo.";
  }
}
