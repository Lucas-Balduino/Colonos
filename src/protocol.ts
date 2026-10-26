import type { Action, GameEvent, PublicView } from "./core/types.ts";

export type ClientMsg =
  | { type: "create"; name: string; bots: number; setup: "beginner" | "random" }
  | { type: "join"; code: string; name: string; token?: string }
  | { type: "start" }
  | { type: "action"; action: Action };

export type ServerMsg =
  | { type: "joined"; code: string; token: string; playerId: string; host: boolean }
  | { type: "lobby"; code: string; players: Array<{ id: string; name: string; isBot: boolean }>; hostId: string }
  | { type: "view"; view: PublicView; events: GameEvent[] }
  | { type: "error"; message: string };
