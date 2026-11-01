import type { Action, GameEvent, PublicView } from "./core/types.ts";

export type ClientMsg =
  | { type: "create"; name: string; bots: number; setup: "beginner" | "random" }
  | { type: "join"; code: string; name: string; token?: string }
  | { type: "start" }
  | { type: "leave" }
  | { type: "action"; action: Action };

export interface LobbySeat {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  online: boolean;
}

/** Errors the client acts on: the saved seat is gone, or another tab took it. */
export type ErrorCode = "room-gone" | "replaced" | "full" | "started";

export type ServerMsg =
  | { type: "joined"; code: string; token: string; playerId: string; host: boolean }
  | {
      type: "lobby";
      code: string;
      hostId: string;
      setup: "beginner" | "random";
      players: LobbySeat[];
    }
  | { type: "view"; view: PublicView; events: GameEvent[]; hostId: string }
  | { type: "error"; message: string; code?: ErrorCode };
