export const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"] as const;
export type Resource = (typeof RESOURCES)[number];

export type Terrain = Resource | "desert";

export const DEV_CARD_TYPES = [
  "knight",
  "victory",
  "roadBuilding",
  "yearOfPlenty",
  "monopoly",
] as const;
export type DevCardType = (typeof DEV_CARD_TYPES)[number];

export type PlayerId = string;
export type HexId = string;
export type VertexId = string;
export type EdgeId = string;

export interface Axial {
  q: number;
  r: number;
}

export type ResourceMap = Record<Resource, number>;

export interface HexTile {
  id: HexId;
  q: number;
  r: number;
  terrain: Terrain;
  number: number | null;
  vertices: VertexId[];
  edges: EdgeId[];
}

export interface Vertex {
  id: VertexId;
  hexes: HexId[];
  edges: EdgeId[];
  neighbors: VertexId[];
  building: { type: "settlement" | "city"; owner: PlayerId } | null;
}

export interface Edge {
  id: EdgeId;
  vertices: [VertexId, VertexId];
  hexes: HexId[];
  road: PlayerId | null;
}

export interface Port {
  edgeId: EdgeId;
  vertices: [VertexId, VertexId];
  ratio: 2 | 3;
  resource: Resource | "any";
}

export interface Board {
  hexes: Record<HexId, HexTile>;
  vertices: Record<VertexId, Vertex>;
  edges: Record<EdgeId, Edge>;
  ports: Port[];
  robberHexId: HexId;
}

export interface DevCard {
  type: DevCardType;
  playable: boolean;
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  isBot: boolean;
  resources: ResourceMap;
  settlements: VertexId[];
  cities: VertexId[];
  roads: EdgeId[];
  devCards: DevCard[];
  knightsPlayed: number;
  settlementsLeft: number;
  citiesLeft: number;
  roadsLeft: number;
}

export type Phase =
  | { type: "setupSettlement"; round: 1 | 2 }
  | { type: "setupRoad"; round: 1 | 2; settlement: VertexId }
  | { type: "roll" }
  | { type: "discard"; queue: PlayerId[] }
  | { type: "moveRobber"; after: "roll" | "main" }
  | { type: "steal"; after: "roll" | "main"; hexId: HexId }
  | { type: "main" }
  | { type: "freeRoads"; remaining: number }
  | { type: "gameOver"; winner: PlayerId };

export interface TradeOffer {
  id: string;
  from: PlayerId;
  give: ResourceMap;
  want: ResourceMap;
}

export interface LogEntry {
  text: string;
  playerId?: PlayerId;
}

export interface GameState {
  board: Board;
  players: Player[];
  currentPlayerIndex: number;
  phase: Phase;
  dice: [number, number] | null;
  bank: ResourceMap;
  devDeck: DevCardType[];
  tradeOffers: TradeOffer[];
  longestRoadPlayerId: PlayerId | null;
  largestArmyPlayerId: PlayerId | null;
  turnNumber: number;
  rng: number;
  log: LogEntry[];
  playedDevThisTurn: boolean;
  setup: "beginner" | "random";
}

export type Action =
  | { type: "PLACE_SETTLEMENT"; playerId: PlayerId; vertexId: VertexId }
  | { type: "PLACE_ROAD"; playerId: PlayerId; edgeId: EdgeId }
  | { type: "ROLL"; playerId: PlayerId }
  | { type: "DISCARD"; playerId: PlayerId; resources: ResourceMap }
  | {
      type: "MOVE_ROBBER";
      playerId: PlayerId;
      hexId: HexId;
      stealFrom?: PlayerId;
    }
  | { type: "STEAL"; playerId: PlayerId; from: PlayerId }
  | { type: "TRADE_BANK"; playerId: PlayerId; give: Resource; take: Resource }
  | {
      type: "OFFER_TRADE";
      playerId: PlayerId;
      give: ResourceMap;
      want: ResourceMap;
    }
  | { type: "ACCEPT_TRADE"; playerId: PlayerId; offerId: string }
  | { type: "REJECT_TRADE"; playerId: PlayerId; offerId: string }
  | { type: "CANCEL_TRADE"; playerId: PlayerId; offerId: string }
  | { type: "BUILD_SETTLEMENT"; playerId: PlayerId; vertexId: VertexId }
  | { type: "BUILD_CITY"; playerId: PlayerId; vertexId: VertexId }
  | { type: "BUILD_ROAD"; playerId: PlayerId; edgeId: EdgeId }
  | { type: "BUY_DEV"; playerId: PlayerId }
  | { type: "PLAY_KNIGHT"; playerId: PlayerId }
  | { type: "PLAY_ROAD_BUILDING"; playerId: PlayerId }
  | {
      type: "PLAY_YEAR_OF_PLENTY";
      playerId: PlayerId;
      resources: [Resource, Resource];
    }
  | { type: "PLAY_MONOPOLY"; playerId: PlayerId; resource: Resource }
  | { type: "END_TURN"; playerId: PlayerId };

export interface RuleErrorShape {
  code: string;
  message: string;
}

export type ReduceResult =
  | { ok: true; state: GameState }
  | { ok: false; error: RuleErrorShape };

export interface PublicPlayerView {
  id: PlayerId;
  name: string;
  color: string;
  isBot: boolean;
  resourceCount: number;
  settlementCount: number;
  cityCount: number;
  roadCount: number;
  devCount: number;
  knightsPlayed: number;
  publicVp: number;
  isYou: boolean;
  resources?: ResourceMap;
  devCards?: DevCard[];
  bankRatios?: Record<Resource, 2 | 3 | 4>;
}

export interface PublicView {
  you: PlayerId | null;
  board: Board;
  players: PublicPlayerView[];
  currentPlayerId: PlayerId;
  phase: Phase;
  dice: [number, number] | null;
  bank: ResourceMap;
  tradeOffers: TradeOffer[];
  longestRoadPlayerId: PlayerId | null;
  largestArmyPlayerId: PlayerId | null;
  turnNumber: number;
  log: LogEntry[];
  legal: Action[];
  setup: "beginner" | "random";
  winnerId: PlayerId | null;
}

export interface CreateGameOptions {
  players: Array<{
    name: string;
    color: string;
    isBot: boolean;
    id?: PlayerId;
  }>;
  setup?: "beginner" | "random";
  seed?: number;
}
