import { HEX_DIRS, addAxial, cubeDistance, hexId, spiralOuterFirst } from "./hex.ts";
import { shuffle } from "./rng.ts";
import type {
  Axial,
  Board,
  Edge,
  EdgeId,
  HexId,
  HexTile,
  Port,
  Resource,
  Terrain,
  Vertex,
  VertexId,
} from "./types.ts";

const LAND_TERRAINS: Terrain[] = [
  "wood",
  "wood",
  "wood",
  "wood",
  "sheep",
  "sheep",
  "sheep",
  "sheep",
  "wheat",
  "wheat",
  "wheat",
  "wheat",
  "brick",
  "brick",
  "brick",
  "ore",
  "ore",
  "ore",
  "desert",
];

/** Official lettered number tokens A–R for variable setup. */
const SPIRAL_NUMBERS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

const PORT_SEQUENCE: Array<{ ratio: 2 | 3; resource: Resource | "any" }> = [
  { ratio: 3, resource: "any" },
  { ratio: 2, resource: "sheep" },
  { ratio: 3, resource: "any" },
  { ratio: 2, resource: "ore" },
  { ratio: 3, resource: "any" },
  { ratio: 2, resource: "wheat" },
  { ratio: 2, resource: "brick" },
  { ratio: 3, resource: "any" },
  { ratio: 2, resource: "wood" },
];

/** 5th-edition-style balanced beginner island (desert center). */
const BEGINNER: Array<{ q: number; r: number; terrain: Terrain; number: number | null }> = [
  { q: 0, r: -2, terrain: "ore", number: 10 },
  { q: 1, r: -2, terrain: "sheep", number: 2 },
  { q: 2, r: -2, terrain: "wood", number: 9 },
  { q: -1, r: -1, terrain: "wheat", number: 12 },
  { q: 0, r: -1, terrain: "brick", number: 6 },
  { q: 1, r: -1, terrain: "sheep", number: 4 },
  { q: 2, r: -1, terrain: "wheat", number: 10 },
  { q: -2, r: 0, terrain: "wood", number: 9 },
  { q: -1, r: 0, terrain: "brick", number: 11 },
  { q: 0, r: 0, terrain: "desert", number: null },
  { q: 1, r: 0, terrain: "ore", number: 3 },
  { q: 2, r: 0, terrain: "wood", number: 8 },
  { q: -2, r: 1, terrain: "brick", number: 8 },
  { q: -1, r: 1, terrain: "wheat", number: 3 },
  { q: 0, r: 1, terrain: "wood", number: 4 },
  { q: 1, r: 1, terrain: "sheep", number: 5 },
  { q: -2, r: 2, terrain: "ore", number: 5 },
  { q: -1, r: 2, terrain: "sheep", number: 6 },
  { q: 0, r: 2, terrain: "wheat", number: 11 },
];

function vertexIdFor(hex: Axial, corner: number): VertexId {
  const a = hex;
  const b = addAxial(hex, HEX_DIRS[corner]!);
  const c = addAxial(hex, HEX_DIRS[(corner + 5) % 6]!);
  return [hexId(a.q, a.r), hexId(b.q, b.r), hexId(c.q, c.r)].sort().join("|");
}

function edgeIdFor(a: VertexId, b: VertexId): EdgeId {
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

function isLand(q: number, r: number): boolean {
  return cubeDistance({ q, r }) <= 2;
}

function buildGraph(
  layout: Array<{ q: number; r: number; terrain: Terrain; number: number | null }>,
): Board {
  const hexes: Record<HexId, HexTile> = {};
  const vertices: Record<VertexId, Vertex> = {};
  const edges: Record<EdgeId, Edge> = {};

  for (const cell of layout) {
    const id = hexId(cell.q, cell.r);
    hexes[id] = {
      id,
      q: cell.q,
      r: cell.r,
      terrain: cell.terrain,
      number: cell.number,
      vertices: [],
      edges: [],
    };
  }

  for (const cell of layout) {
    const hid = hexId(cell.q, cell.r);
    const hex = hexes[hid]!;
    for (let i = 0; i < 6; i++) {
      const vid = vertexIdFor(cell, i);
      if (!vertices[vid]) {
        vertices[vid] = {
          id: vid,
          hexes: [],
          edges: [],
          neighbors: [],
          building: null,
        };
      }
      const v = vertices[vid]!;
      if (!v.hexes.includes(hid) && isLand(cell.q, cell.r)) v.hexes.push(hid);
      if (!hex.vertices.includes(vid)) hex.vertices.push(vid);

      const nid = vertexIdFor(cell, (i + 1) % 6);
      const eid = edgeIdFor(vid, nid);
      if (!edges[eid]) {
        edges[eid] = {
          id: eid,
          vertices: vid < nid ? [vid, nid] : [nid, vid],
          hexes: [],
          road: null,
        };
      }
      const e = edges[eid]!;
      if (!e.hexes.includes(hid)) e.hexes.push(hid);
      if (!hex.edges.includes(eid)) hex.edges.push(eid);
      if (!v.edges.includes(eid)) v.edges.push(eid);
    }
  }

  for (const v of Object.values(vertices)) {
    v.hexes = v.hexes.filter((id) => hexes[id]);
  }

  for (const e of Object.values(edges)) {
    const [a, b] = e.vertices;
    const va = vertices[a]!;
    const vb = vertices[b]!;
    if (!va.neighbors.includes(b)) va.neighbors.push(b);
    if (!vb.neighbors.includes(a)) vb.neighbors.push(a);
    if (!va.edges.includes(e.id)) va.edges.push(e.id);
    if (!vb.edges.includes(e.id)) vb.edges.push(e.id);
    e.hexes = e.hexes.filter((id) => hexes[id]);
  }

  const desert = Object.values(hexes).find((h) => h.terrain === "desert");
  const ports = placePorts(edges);

  return {
    hexes,
    vertices,
    edges,
    ports,
    robberHexId: desert?.id ?? Object.keys(hexes)[0]!,
  };
}

function placePorts(edges: Record<EdgeId, Edge>): Port[] {
  const coastal = Object.values(edges).filter((e) => e.hexes.length === 1);
  if (coastal.length === 0) return [];

  const byVertex = new Map<VertexId, Edge[]>();
  for (const e of coastal) {
    for (const v of e.vertices) {
      const list = byVertex.get(v) ?? [];
      list.push(e);
      byVertex.set(v, list);
    }
  }

  const start = coastal.reduce((best, e) => {
    const ay = vertexY(e.vertices[0]!);
    const by = vertexY(best.vertices[0]!);
    return ay < by ? e : best;
  });

  const ordered: Edge[] = [];
  const used = new Set<EdgeId>();
  let current = start;
  let fromVertex: VertexId | null = null;

  while (ordered.length < coastal.length) {
    ordered.push(current);
    used.add(current.id);
    const nextV = current.vertices.find((v) => v !== fromVertex) ?? current.vertices[0]!;
    const candidates = (byVertex.get(nextV) ?? []).filter((e) => !used.has(e.id));
    if (candidates.length === 0) break;
    fromVertex = nextV;
    current = candidates[0]!;
  }

  const ports: Port[] = [];
  for (let i = 0; i < 9; i++) {
    const edge = ordered[i * 2];
    const spec = PORT_SEQUENCE[i];
    if (!edge || !spec) continue;
    ports.push({
      edgeId: edge.id,
      vertices: edge.vertices,
      ratio: spec.ratio,
      resource: spec.resource,
    });
  }
  return ports;
}

function vertexY(id: VertexId): number {
  const parts = id.split("|");
  let rSum = 0;
  for (const p of parts) {
    const [, r] = p.split(",").map(Number);
    rSum += r ?? 0;
  }
  return rSum;
}

export function createBeginnerBoard(): Board {
  return buildGraph(BEGINNER);
}

export function createRandomBoard(rng: number): { board: Board; rng: number } {
  const shuffled = shuffle(LAND_TERRAINS, rng);
  let r = shuffled.rng;
  const terrains = shuffled.items;
  const coords = spiralOuterFirst(2);
  const layout: Array<{ q: number; r: number; terrain: Terrain; number: number | null }> = [];
  let ni = 0;
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]!;
    const terrain = terrains[i]!;
    let number: number | null = null;
    if (terrain !== "desert") {
      number = SPIRAL_NUMBERS[ni] ?? 8;
      ni += 1;
    }
    layout.push({ q: c.q, r: c.r, terrain, number });
  }
  return { board: buildGraph(layout), rng: r };
}

export function hexesOfVertex(board: Board, vertexId: VertexId): HexTile[] {
  const v = board.vertices[vertexId];
  if (!v) return [];
  return v.hexes.map((id) => board.hexes[id]!).filter(Boolean);
}

export function adjacentBuildings(
  board: Board,
  hexIdValue: HexId,
): Array<{ owner: import("./types.ts").PlayerId; type: "settlement" | "city" }> {
  const hex = board.hexes[hexIdValue];
  if (!hex) return [];
  const out: Array<{ owner: import("./types.ts").PlayerId; type: "settlement" | "city" }> = [];
  for (const vid of hex.vertices) {
    const b = board.vertices[vid]?.building;
    if (b) out.push(b);
  }
  return out;
}
