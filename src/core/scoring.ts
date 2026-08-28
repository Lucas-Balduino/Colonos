import type { Board, Player, PlayerId } from "./types.ts";

export function visibleVictoryPoints(
  player: Player,
  longestRoadOwner: PlayerId | null,
  largestArmyOwner: PlayerId | null,
): number {
  let vp = player.settlements.length + player.cities.length * 2;
  if (longestRoadOwner === player.id) vp += 2;
  if (largestArmyOwner === player.id) vp += 2;
  return vp;
}

export function totalVictoryPoints(
  player: Player,
  longestRoadOwner: PlayerId | null,
  largestArmyOwner: PlayerId | null,
): number {
  const hidden = player.devCards.filter((c) => c.type === "victory").length;
  return visibleVictoryPoints(player, longestRoadOwner, largestArmyOwner) + hidden;
}

export function longestRoadLength(board: Board, player: Player, players: Player[]): number {
  if (player.roads.length === 0) return 0;
  const opponentVertex = new Set<string>();
  for (const p of players) {
    if (p.id === player.id) continue;
    for (const v of [...p.settlements, ...p.cities]) opponentVertex.add(v);
  }

  const adj = new Map<string, Array<{ to: string; edge: string }>>();
  const add = (from: string, to: string, edge: string) => {
    const list = adj.get(from) ?? [];
    list.push({ to, edge });
    adj.set(from, list);
  };
  for (const eid of player.roads) {
    const e = board.edges[eid];
    if (!e) continue;
    add(e.vertices[0], e.vertices[1], eid);
    add(e.vertices[1], e.vertices[0], eid);
  }

  let best = 0;
  const vertices = [...adj.keys()];
  for (const start of vertices) {
    const dfs = (v: string, used: Set<string>): number => {
      if (opponentVertex.has(v)) return 0;
      let max = 0;
      for (const n of adj.get(v) ?? []) {
        if (used.has(n.edge)) continue;
        const next = new Set(used);
        next.add(n.edge);
        max = Math.max(max, 1 + dfs(n.to, next));
      }
      return max;
    };
    best = Math.max(best, dfs(start, new Set()));
  }
  return best;
}

export function refreshAwards(board: Board, players: Player[], state: {
  longestRoadPlayerId: PlayerId | null;
  largestArmyPlayerId: PlayerId | null;
}): void {
  const lengths = players.map((p) => ({
    id: p.id,
    len: longestRoadLength(board, p, players),
  }));
  const bestLen = Math.max(0, ...lengths.map((l) => l.len));
  if (bestLen < 5) {
    state.longestRoadPlayerId = null;
  } else {
    const tied = lengths.filter((l) => l.len === bestLen);
    const holder = state.longestRoadPlayerId;
    const holderStill = holder && tied.some((t) => t.id === holder);
    if (tied.length === 1) state.longestRoadPlayerId = tied[0]!.id;
    else if (!holderStill) state.longestRoadPlayerId = null;
  }

  const armies = players.map((p) => ({ id: p.id, n: p.knightsPlayed }));
  const bestArmy = Math.max(0, ...armies.map((a) => a.n));
  if (bestArmy < 3) {
    state.largestArmyPlayerId = null;
  } else {
    const tied = armies.filter((a) => a.n === bestArmy);
    const holder = state.largestArmyPlayerId;
    const holderStill = holder && tied.some((t) => t.id === holder);
    if (tied.length === 1) state.largestArmyPlayerId = tied[0]!.id;
    else if (!holderStill) state.largestArmyPlayerId = null;
  }
}
