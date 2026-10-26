import { nextBotAction } from "../ai/bot.ts";
import { createGame, reduce } from "../core/reduce.ts";
import { distanceOk } from "../core/rules.ts";
import { countResources, emptyResources } from "../core/resources.ts";
import type { GameState, HexId, PlayerId, ResourceMap } from "../core/types.ts";

export const SCENARIO_NAMES = [
  "fundacao",
  "turno",
  "construir",
  "ladrao-dois-vizinhos",
  "cartas",
  "porto",
  "troca",
  "descarte",
  "fim",
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export function isScenarioName(value: string): value is ScenarioName {
  return (SCENARIO_NAMES as readonly string[]).includes(value);
}

const PLAYERS = [
  { id: "p1", name: "Você", color: "#c44536" },
  { id: "p2", name: "Marinheiro", color: "#2b6cb0" },
  { id: "p3", name: "Lenhadora", color: "#d97706" },
  { id: "p4", name: "Mineiro", color: "#e8e0d0" },
];

function newGame(human: boolean): GameState {
  return createGame({
    setup: "beginner",
    seed: 7,
    players: PLAYERS.map((p) => ({ ...p, isBot: human ? p.id !== "p1" : true })),
  });
}

function playBots(state: GameState, done: (s: GameState) => boolean): GameState {
  const random = Math.random;
  Math.random = () => 0;
  try {
    let guard = 0;
    while (!done(state) && guard < 4000) {
      guard += 1;
      if (state.phase.type === "gameOver") break;
      const action = nextBotAction(state);
      if (!action) break;
      const result = reduce(state, action);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
    }
    return state;
  } finally {
    Math.random = random;
  }
}

function player(state: GameState, id: PlayerId) {
  const found = state.players.find((p) => p.id === id);
  if (!found) throw new Error(`Jogador ${id} ausente.`);
  return found;
}

function setHand(state: GameState, id: PlayerId, hand: ResourceMap): void {
  const who = player(state, id);
  for (const key of ["wood", "brick", "sheep", "wheat", "ore"] as const) {
    const delta = hand[key] - who.resources[key];
    state.bank[key] = Math.max(0, state.bank[key] - delta);
    who.resources[key] = hand[key];
  }
}

function hand(partial: Partial<ResourceMap>): ResourceMap {
  return { ...emptyResources(), ...partial };
}

function asHumanOn(state: GameState, index = 0): GameState {
  state.currentPlayerIndex = index;
  player(state, "p1").isBot = false;
  return state;
}

function afterSetup(): GameState {
  const state = playBots(newGame(false), (s) => s.phase.type === "roll" && s.turnNumber >= 1);
  if (state.phase.type !== "roll" || state.players[state.currentPlayerIndex]?.id !== "p1") {
    throw new Error("A fundação da semente 7 não devolveu a vez para Você.");
  }
  return asHumanOn(state);
}

function ownersOn(state: GameState, hexId: HexId): Set<PlayerId> {
  const hex = state.board.hexes[hexId];
  const ids = new Set<PlayerId>();
  if (!hex) return ids;
  for (const vid of hex.vertices) {
    const owner = state.board.vertices[vid]?.building?.owner;
    if (owner) ids.add(owner);
  }
  return ids;
}

function ensureSharedHex(state: GameState): HexId {
  for (const hex of Object.values(state.board.hexes)) {
    const owners = ownersOn(state, hex.id);
    if (owners.has("p2") && owners.has("p3")) return hex.id;
  }
  for (const hex of Object.values(state.board.hexes)) {
    if (!ownersOn(state, hex.id).has("p2")) continue;
    for (const vid of hex.vertices) {
      if (!distanceOk(state, vid)) continue;
      const vertex = state.board.vertices[vid]!;
      vertex.building = { type: "settlement", owner: "p3" };
      const p3 = player(state, "p3");
      p3.settlements.push(vid);
      p3.settlementsLeft -= 1;
      return hex.id;
    }
  }
  throw new Error("Não há terreno com aldeias de Marinheiro e Lenhadora.");
}

const STARTER = hand({ wood: 2, brick: 2, sheep: 1, wheat: 2, ore: 3 });

export function buildScenario(name: ScenarioName): GameState {
  if (name === "fundacao") return newGame(true);

  if (name === "turno") {
    const state = afterSetup();
    setHand(state, "p1", STARTER);
    return state;
  }

  if (name === "construir") {
    const state = afterSetup();
    setHand(state, "p1", STARTER);
    state.phase = { type: "main" };
    state.dice = [3, 4];
    return state;
  }

  if (name === "ladrao-dois-vizinhos") {
    const state = afterSetup();
    const hexId = ensureSharedHex(state);
    if (state.board.robberHexId === hexId) {
      const other = Object.values(state.board.hexes).find((hex) => hex.id !== hexId);
      if (!other) throw new Error("Tabuleiro sem outro terreno.");
      state.board.robberHexId = other.id;
    }
    setHand(state, "p2", hand({ wood: 1, wheat: 1 }));
    setHand(state, "p3", hand({ brick: 1, ore: 1 }));
    state.phase = { type: "moveRobber", after: "main" };
    return state;
  }

  if (name === "cartas") {
    const state = afterSetup();
    state.phase = { type: "main" };
    state.dice = [2, 3];
    state.playedDevThisTurn = false;
    player(state, "p1").devCards = [
      { type: "knight", playable: true },
      { type: "yearOfPlenty", playable: true },
      { type: "monopoly", playable: true },
      { type: "roadBuilding", playable: true },
    ];
    return state;
  }

  if (name === "porto") {
    const state = afterSetup();
    const port = state.board.ports.find((item) => item.ratio === 2 && item.resource !== "any");
    if (!port || port.resource === "any") throw new Error("Mapa iniciante sem porto 2:1.");
    const p1 = player(state, "p1");
    const owns = port.vertices.some((vid) => state.board.vertices[vid]?.building?.owner === "p1");
    if (!owns) {
      const spot = port.vertices.find((vid) => distanceOk(state, vid));
      if (!spot) throw new Error("Nenhum vértice livre no porto 2:1.");
      state.board.vertices[spot]!.building = { type: "settlement", owner: "p1" };
      p1.settlements.push(spot);
      p1.settlementsLeft -= 1;
    }
    const next = hand({ [port.resource]: 3 });
    setHand(state, "p1", next);
    state.phase = { type: "main" };
    state.dice = [3, 3];
    return state;
  }

  if (name === "troca") {
    const state = afterSetup();
    setHand(state, "p1", hand({ wood: 3, brick: 1, sheep: 2 }));
    for (const id of ["p2", "p3", "p4"] as const) {
      setHand(state, id, hand({ wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 2 }));
    }
    state.phase = { type: "main" };
    state.dice = [4, 4];
    return state;
  }

  if (name === "descarte") {
    const state = afterSetup();
    setHand(state, "p1", hand({ wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 1 }));
    if (countResources(player(state, "p1").resources) !== 9) {
      throw new Error("Mão de descarte deveria ter 9 cartas.");
    }
    state.phase = { type: "discard", queue: ["p1"] };
    state.dice = [3, 4];
    return state;
  }

  if (name === "fim") {
    const state = afterSetup();
    const p1 = player(state, "p1");
    const promote = p1.settlements[0];
    if (!promote) throw new Error("Você não fundou aldeia.");
    state.board.vertices[promote]!.building = { type: "city", owner: "p1" };
    p1.settlements = p1.settlements.filter((id) => id !== promote);
    p1.cities.push(promote);
    p1.settlementsLeft += 1;
    p1.citiesLeft -= 1;
    state.longestRoadPlayerId = "p1";
    state.largestArmyPlayerId = "p1";
    p1.devCards.push({ type: "victory", playable: true }, { type: "victory", playable: true });
    setHand(state, "p1", hand({ wheat: 2, ore: 3 }));
    state.phase = { type: "main" };
    state.dice = [5, 5];
    return state;
  }

  const _never: never = name;
  throw new Error(`Cena desconhecida: ${String(_never)}`);
}
