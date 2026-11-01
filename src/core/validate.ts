import { RESOURCES, type Action, type Resource } from "./types.ts";

/**
 * Checks the shape of an action before the rules see it. The server receives
 * actions as raw JSON, so every number must be a small non-negative integer
 * and every resource name must exist. Returns an error message or null.
 */
export function actionShapeError(action: unknown): string | null {
  if (!isRecord(action)) return "Ação inválida.";
  if (typeof action.type !== "string") return "Ação sem tipo.";
  if (!isId(action.playerId)) return "Jogador inválido.";

  switch (action.type) {
    case "PLACE_SETTLEMENT":
    case "BUILD_SETTLEMENT":
    case "BUILD_CITY":
      return isId(action.vertexId) ? null : "Interseção inválida.";
    case "PLACE_ROAD":
    case "BUILD_ROAD":
      return isId(action.edgeId) ? null : "Aresta inválida.";
    case "ROLL":
    case "BUY_DEV":
    case "PLAY_KNIGHT":
    case "PLAY_ROAD_BUILDING":
    case "END_TURN":
      return null;
    case "DISCARD":
      return isResourceMap(action.resources) ? null : "Descarte inválido.";
    case "MOVE_ROBBER":
      if (!isId(action.hexId)) return "Hexágono inválido.";
      if (action.stealFrom !== undefined && !isId(action.stealFrom)) return "Alvo inválido.";
      return null;
    case "STEAL":
      return isId(action.from) ? null : "Alvo inválido.";
    case "TRADE_BANK":
      if (!isResource(action.give) || !isResource(action.take)) return "Recurso inválido.";
      return action.give === action.take ? "Troque por um recurso diferente." : null;
    case "OFFER_TRADE":
      return isResourceMap(action.give) && isResourceMap(action.want) ? null : "Oferta inválida.";
    case "ACCEPT_TRADE":
    case "REJECT_TRADE":
    case "CANCEL_TRADE":
      return isId(action.offerId) ? null : "Oferta inválida.";
    case "CONFIRM_TRADE":
      return isId(action.offerId) && isId(action.with) ? null : "Oferta inválida.";
    case "PLAY_YEAR_OF_PLENTY":
      return Array.isArray(action.resources) &&
        action.resources.length === 2 &&
        action.resources.every(isResource)
        ? null
        : "Escolha dois recursos.";
    case "PLAY_MONOPOLY":
      return isResource(action.resource) ? null : "Recurso inválido.";
    default:
      return "Ação desconhecida.";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

export function isResource(value: unknown): value is Resource {
  return typeof value === "string" && (RESOURCES as readonly string[]).includes(value);
}

/** Exactly the five resources, each an integer from 0 to 19. */
function isResourceMap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !isResource(key))) return false;
  return RESOURCES.every((resource) => {
    const n = value[resource] ?? 0;
    return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 19;
  });
}

/** Fills missing resources with zero, so the reducer always sees full maps. */
export function normalizeAction(action: Action): Action {
  const full = (map: Partial<Record<Resource, number>>) => {
    const out = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    for (const resource of RESOURCES) out[resource] = map[resource] ?? 0;
    return out;
  };
  if (action.type === "DISCARD") return { ...action, resources: full(action.resources) };
  if (action.type === "OFFER_TRADE") return { ...action, give: full(action.give), want: full(action.want) };
  return action;
}
