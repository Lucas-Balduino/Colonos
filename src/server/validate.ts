import type { ClientMsg } from "../protocol.ts";
import type { Action } from "../core/types.ts";

const ROOM_CODE = /^[A-Z2-9]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 16;
}

export function parseClientMsg(raw: string): ClientMsg | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.type !== "string") return null;

  if (data.type === "create") {
    if (!shortName(data.name)) return null;
    if (typeof data.bots !== "number" || !Number.isInteger(data.bots) || data.bots < 0 || data.bots > 3) {
      return null;
    }
    if (data.setup !== "beginner" && data.setup !== "random") return null;
    return { type: "create", name: data.name, bots: data.bots, setup: data.setup };
  }

  if (data.type === "join") {
    if (typeof data.code !== "string" || !ROOM_CODE.test(data.code.toUpperCase())) return null;
    if (!shortName(data.name)) return null;
    if (data.token !== undefined && (typeof data.token !== "string" || data.token.length > 64)) return null;
    return {
      type: "join",
      code: data.code.toUpperCase(),
      name: data.name,
      token: typeof data.token === "string" ? data.token : undefined,
    };
  }

  if (data.type === "start") return { type: "start" };

  if (data.type === "action") {
    if (!isRecord(data.action)) return null;
    if (typeof data.action.type !== "string" || typeof data.action.playerId !== "string") return null;
    return { type: "action", action: data.action as unknown as Action };
  }

  return null;
}
