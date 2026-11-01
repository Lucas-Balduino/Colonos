import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Application, extend } from "@pixi/react";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { Graphics as PixiGraphics } from "pixi.js";
import { toast } from "sonner";
import { addAxial, cubeDistance, HEX_DIRS, hexCorner, hexId, parseHexId, pointyHexToPixel } from "../core/hex.ts";
import { RESOURCE_LABEL } from "../core/resources.ts";
import type { Action, Board, HexId, PublicView } from "../core/types.ts";
import {
  BOARD_URLS,
  CHIP_SPRITE,
  citySprite,
  HEX_SIZE,
  HEX_SPRITE_ANCHOR,
  settlementSprite,
  TERRAIN_SPRITE,
} from "./assets.ts";
import { sfx } from "./audio.ts";
import { FACTION_HEX, PALETTE, shade } from "./theme.ts";
import { AnimClockProvider, animFrameNow, useAnimFrame } from "./anim-clock.tsx";
import { buildModeCopy, phaseCopy, type BuildMode } from "./copy.ts";
import { preloadSprites } from "./preload.ts";
import { FxLayer } from "./fx/FxLayer.tsx";
import { holdFx, motionMs, type EventBatch } from "./fx/batch.ts";

extend({ Container, Graphics, Sprite, Text });

declare global {
  interface Window {
    __colonosBoardRenders?: number;
  }
}

const DRAG_SLOP = 10;
const VERTEX_PICK_PX = 22;
const EDGE_PICK_PX = 16;
const HEX_PICK_PX = 40;
const PORT_PICK = 18;
const LEVELS = [1, 1.5, 2, 3] as const;

/** The land plus room for the docks around it. The camera frames this. */
const ISLAND_EXTENT = (() => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (cubeDistance({ q, r }) > 2) continue;
      const p = pointyHexToPixel({ q, r }, HEX_SIZE);
      for (let i = 0; i < 6; i++) {
        const c = hexCorner(p, HEX_SIZE, i);
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
      }
    }
  }
  const dock = 46;
  return { width: maxX - minX + dock * 2, height: maxY - minY + dock * 2 };
})();

function computeFit(w: number, h: number): number {
  if (w < 8 || h < 8) return 1;
  const raw = Math.min(w / ISLAND_EXTENT.width, h / (ISLAND_EXTENT.height + 56));
  // Steps of 1/16 keep the pixel grid even without wasting screen.
  const stepped = Math.floor(raw * 16) / 16;
  return Math.min(3, Math.max(0.4, stepped));
}

type PickKind = "vertex" | "edge" | "hex" | "victim" | "port";

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.001) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function vertexPos(board: Board, vid: string): { x: number; y: number } {
  for (const h of Object.values(board.hexes)) {
    const idx = h.vertices.indexOf(vid);
    if (idx >= 0) {
      const c = pointyHexToPixel(h, HEX_SIZE);
      return hexCorner(c, HEX_SIZE, idx);
    }
  }
  return { x: 0, y: 0 };
}

function portAnchor(board: Board, origin: { x: number; y: number }, edgeId: string) {
  const port = board.ports.find((item) => item.edgeId === edgeId);
  if (!port) return { x: 0, y: 0 };
  const a = vertexPos(board, port.vertices[0]);
  const b = vertexPos(board, port.vertices[1]);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const outward = Math.hypot(mx - origin.x, my - origin.y) || 1;
  return { x: mx + ((mx - origin.x) / outward) * 22, y: my + ((my - origin.y) / outward) * 18 };
}

function seaRing(): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  // Enough rings that the water reaches past the screen edge at any zoom.
  for (let q = -9; q <= 9; q++) {
    for (let r = -9; r <= 9; r++) {
      const d = cubeDistance({ q, r });
      if (d >= 3 && d <= 9) out.push({ q, r });
    }
  }
  return out.sort((a, b) => b.r - a.r || b.q - a.q);
}

function cubeLerp(a: { q: number; r: number }, b: { q: number; r: number }, t: number) {
  const as = -a.q - a.r;
  const bs = -b.q - b.r;
  const q = a.q + (b.q - a.q) * t;
  const r = a.r + (b.r - a.r) * t;
  const s = as + (bs - as) * t;
  const rq = Math.round(q);
  const rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) return { q: -rr - rs, r: rr };
  if (dr > ds) return { q: rq, r: -rq - rs };
  return { q: rq, r: rr };
}

function hexPath(from: HexId, to: HexId): HexId[] {
  const a = parseHexId(from);
  const b = parseHexId(to);
  const n = cubeDistance(a, b);
  if (n === 0) return [to];
  const out: HexId[] = [];
  for (let i = 1; i <= n; i++) {
    const p = cubeLerp(a, b, i / n);
    out.push(hexId(p.q, p.r));
  }
  return out;
}

function useTextures() {
  const [map, setMap] = useState<Record<string, Texture> | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let live = true;
    preloadSprites((p) => {
      if (live) setProgress(p);
    }).then((loaded) => {
      if (!live) return;
      const next: Record<string, Texture> = {};
      for (const url of [...BOARD_URLS, ...Object.values(CHIP_SPRITE)]) {
        if (loaded[url]) next[url] = loaded[url]!;
      }
      setMap(next);
      setProgress(1);
    });
    return () => {
      live = false;
    };
  }, []);
  return { map, progress };
}

export function BoardView({
  view,
  onAction,
  interactive,
  onPendingRobber,
  buildMode = null,
  onClearBuild,
  events,
}: {
  view: PublicView;
  onAction: (a: Action) => boolean | void;
  interactive: boolean;
  onPendingRobber?: (hexId: string | null) => void;
  buildMode?: BuildMode | null;
  onClearBuild?: () => void;
  events: EventBatch;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { map: textures, progress } = useTextures();
  const you = view.you;
  const legal = view.legal;
  const [nivel, setNivel] = useState<(typeof LEVELS)[number]>(1);
  const [pinchZoom, setPinchZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 640, h: 480 });
  const [shakeUntil, setShakeUntil] = useState(0);
  const [nudge, setNudge] = useState(0);
  const [hover, setHover] = useState<{ kind: PickKind; id: string } | null>(null);
  const [armed, setArmed] = useState<{ kind: PickKind; id: string } | null>(null);
  const [pendingRobberHex, setPendingRobberHex] = useState<string | null>(null);
  const [tipId, setTipId] = useState<string | null>(null);
  const [robberPos, setRobberPos] = useState(view.board.robberHexId);
  const [drops, setDrops] = useState<Record<string, number>>({});
  const [roads, setRoads] = useState<Record<string, { start: number; from: -1 | 1 }>>({});
  const drag = useRef<{
    sx: number;
    sy: number;
    px: number;
    py: number;
    moved: boolean;
    pointerType: string;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDist: number; startZoom: number; worldX: number; worldY: number } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(1);
  const fitRef = useRef(1);
  const nudgeRef = useRef(nudge);
  const originRef = useRef({ x: 0, y: 0 });
  const hoverRef = useRef(hover);
  const armedRef = useRef(armed);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipIdRef = useRef<string | null>(null);
  panRef.current = pan;
  nudgeRef.current = nudge;
  hoverRef.current = hover;
  armedRef.current = armed;
  const fit = computeFit(size.w, size.h);
  const zoom = pinchZoom == null ? Math.min(3, fit * nivel) : Math.min(3, Math.max(fit, pinchZoom));
  fitRef.current = fit;
  zoomRef.current = zoom;
  if (import.meta.env.DEV) {
    window.__colonosBoardRenders = (window.__colonosBoardRenders ?? 0) + 1;
  }
  const seenFx = useRef(0);
  const robberTimer = useRef(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const sync = () => {
      const canvas = el.querySelector("canvas");
      if (canvas) canvas.style.pointerEvents = "none";
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [textures]);

  useEffect(() => {
    if (!shakeUntil) return;
    let raf = 0;
    const loop = () => {
      const left = shakeUntil - Date.now();
      if (left <= 0) {
        setNudge(0);
        return;
      }
      setNudge(Math.round(Math.sin(left / 18) * 4));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shakeUntil]);

  const placing = view.phase.type === "main";
  const settleTargets = useMemo(() => {
    const ids = new Set<string>();
    if (placing && buildMode !== "settlement") return ids;
    for (const a of legal) {
      if (a.type === "PLACE_SETTLEMENT" || a.type === "BUILD_SETTLEMENT") ids.add(a.vertexId);
    }
    return ids;
  }, [legal, placing, buildMode]);

  const cityTargets = useMemo(() => {
    const ids = new Set<string>();
    if (placing && buildMode !== "city") return ids;
    for (const a of legal) if (a.type === "BUILD_CITY") ids.add(a.vertexId);
    return ids;
  }, [legal, placing, buildMode]);

  const roadTargets = useMemo(() => {
    const ids = new Set<string>();
    if (placing && buildMode !== "road") return ids;
    for (const a of legal) {
      if (a.type === "PLACE_ROAD" || a.type === "BUILD_ROAD") ids.add(a.edgeId);
    }
    return ids;
  }, [legal, placing, buildMode]);

  const robberTargets = useMemo(() => {
    const map = new Map<string, Action>();
    for (const a of legal) {
      if (a.type === "MOVE_ROBBER" && !map.has(a.hexId)) map.set(a.hexId, a);
    }
    return map;
  }, [legal]);

  const victimTargets = useMemo(() => {
    const map = new Map<string, Action>();
    if (!pendingRobberHex) return map;
    const hex = view.board.hexes[pendingRobberHex];
    if (!hex) return map;
    for (const vid of hex.vertices) {
      const owner = view.board.vertices[vid]?.building?.owner;
      if (!owner) continue;
      const action = legal.find((a) => a.type === "MOVE_ROBBER" && a.hexId === pendingRobberHex && a.stealFrom === owner);
      if (action) map.set(vid, action);
    }
    return map;
  }, [pendingRobberHex, legal, view.board]);

  useEffect(() => {
    onPendingRobber?.(pendingRobberHex);
  }, [pendingRobberHex, onPendingRobber]);

  useEffect(() => {
    if (view.phase.type !== "moveRobber") setPendingRobberHex(null);
    armedRef.current = null;
    setArmed(null);
  }, [view.phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingRobberHex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const origin = useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const h of Object.values(view.board.hexes)) {
      const p = pointyHexToPixel(h, HEX_SIZE);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 + 18 };
  }, [view.board]);
  originRef.current = origin;

  const sortedVertices = useMemo(() => {
    return Object.values(view.board.vertices).sort((a, b) => {
      const pa = vertexPos(view.board, a.id);
      const pb = vertexPos(view.board, b.id);
      return pa.y - pb.y || pa.x - pb.x;
    });
  }, [view.board]);

  const sortedEdges = useMemo(() => {
    return Object.values(view.board.edges).sort((a, b) => {
      const aa = vertexPos(view.board, a.vertices[0]);
      const ab = vertexPos(view.board, a.vertices[1]);
      const ba = vertexPos(view.board, b.vertices[0]);
      const bb = vertexPos(view.board, b.vertices[1]);
      return (aa.y + ab.y) / 2 - (ba.y + bb.y) / 2;
    });
  }, [view.board]);

  useEffect(() => () => window.clearInterval(robberTimer.current), []);

  const finishDrop = useCallback((id: string) => {
    setDrops((prev) => {
      if (prev[id] == null) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const finishRoad = useCallback((id: string) => {
    setRoads((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    if (events.seq === 0 || events.seq === seenFx.current) return;
    seenFx.current = events.seq;
    const start = animFrameNow();
    const nextDrops: Record<string, number> = {};
    const nextRoads: Record<string, { start: number; from: -1 | 1 }> = {};
    for (const event of events.events) {
      if (event.type === "built" && (event.kind === "settlement" || event.kind === "city")) {
        nextDrops[event.id] = start;
      }
      if (event.type === "built" && event.kind === "road") {
        nextRoads[event.id] = { start, from: roadRevealFrom(view.board, event.playerId, event.id) };
      }
      if (event.type === "robberMoved") {
        window.clearInterval(robberTimer.current);
        const path = hexPath(event.from, event.to);
        let step = 0;
        setRobberPos(event.from);
        holdFx(path.length * 90);
        robberTimer.current = window.setInterval(() => {
          setRobberPos(path[step] ?? event.to);
          step += 1;
          if (step >= path.length) window.clearInterval(robberTimer.current);
        }, motionMs(90));
      }
    }
    if (Object.keys(nextDrops).length) setDrops((prev) => ({ ...prev, ...nextDrops }));
    if (Object.keys(nextRoads).length) setRoads((prev) => ({ ...prev, ...nextRoads }));
  }, [events, view.board]);

  const invalid = () => {
    sfx("illegal");
    setShakeUntil(Date.now() + 220);
    toast.error("Não dá para jogar aí.");
  };

  const clickVertex = (vid: string) => {
    if (!you || !interactive) return;
    const city = legal.find((a) => a.type === "BUILD_CITY" && a.vertexId === vid);
    if (city) return void onAction(city);
    const s =
      legal.find((a) => a.type === "PLACE_SETTLEMENT" && a.vertexId === vid) ??
      legal.find((a) => a.type === "BUILD_SETTLEMENT" && a.vertexId === vid);
    if (s) return void onAction(s);
    if (settleTargets.size || cityTargets.size) invalid();
  };

  const clickEdge = (eid: string) => {
    if (!you || !interactive) return;
    const a =
      legal.find((x) => x.type === "PLACE_ROAD" && x.edgeId === eid) ??
      legal.find((x) => x.type === "BUILD_ROAD" && x.edgeId === eid);
    if (a) return void onAction(a);
    if (roadTargets.size) invalid();
  };

  const clickHex = (hid: string) => {
    if (!interactive) return;
    const actions = legal.filter((a) => a.type === "MOVE_ROBBER" && a.hexId === hid);
    if (actions.length === 0) {
      if (robberTargets.size) invalid();
      return;
    }
    const withVictim = actions.filter((a) => a.type === "MOVE_ROBBER" && a.stealFrom);
    if (withVictim.length === 0) {
      setPendingRobberHex(null);
      onAction(actions[0]!);
      return;
    }
    if (withVictim.length === 1) {
      setPendingRobberHex(null);
      onAction(withVictim[0]!);
      return;
    }
    setPendingRobberHex(hid);
  };

  const clickVictim = (vid: string) => {
    if (!interactive) return;
    const action = victimTargets.get(vid);
    if (action) {
      setPendingRobberHex(null);
      onAction(action);
    }
  };

  const clientToWorld = (clientX: number, clientY: number) => {
    const el = host.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const z = zoomRef.current;
    const cx = el.clientWidth / 2 + panRef.current.x + nudgeRef.current;
    const cy = el.clientHeight / 2 + panRef.current.y;
    return {
      x: (localX - cx) / z + originRef.current.x,
      y: (localY - cy) / z + originRef.current.y,
    };
  };

  const limitsFor = (pointerType: string) => {
    const touch = pointerType === "touch" ? 1.4 : 1;
    const z = Math.max(0.05, zoomRef.current);
    return {
      vertex: (VERTEX_PICK_PX * touch) / z,
      edge: (EDGE_PICK_PX * touch) / z,
      hex: (HEX_PICK_PX * touch) / z,
    };
  };

  const pickAt = (world: { x: number; y: number }, pointerType: string): { kind: PickKind; id: string; d: number } | null => {
    const limits = limitsFor(pointerType);
    const hits: { kind: PickKind; id: string; d: number }[] = [];
    const consider = (kind: PickKind, id: string, d: number, limit: number) => {
      if (d <= limit) hits.push({ kind, id, d });
    };
    for (const id of victimTargets.keys()) {
      const p = vertexPos(view.board, id);
      consider("victim", id, Math.hypot(world.x - p.x, world.y - p.y), limits.vertex);
    }
    for (const id of settleTargets) {
      const p = vertexPos(view.board, id);
      consider("vertex", id, Math.hypot(world.x - p.x, world.y - p.y), limits.vertex);
    }
    for (const id of cityTargets) {
      const p = vertexPos(view.board, id);
      consider("vertex", id, Math.hypot(world.x - p.x, world.y - p.y), limits.vertex);
    }
    for (const id of roadTargets) {
      const edge = view.board.edges[id];
      if (!edge) continue;
      const a = vertexPos(view.board, edge.vertices[0]);
      const b = vertexPos(view.board, edge.vertices[1]);
      consider("edge", id, distToSegment(world.x, world.y, a.x, a.y, b.x, b.y), limits.edge);
    }
    for (const id of robberTargets.keys()) {
      const hex = view.board.hexes[id];
      if (!hex) continue;
      const p = pointyHexToPixel(hex, HEX_SIZE);
      consider("hex", id, Math.hypot(world.x - p.x, world.y - p.y), limits.hex);
    }
    for (const port of view.board.ports) {
      const p = portAnchor(view.board, origin, port.edgeId);
      consider("port", port.edgeId, Math.hypot(world.x - p.x, world.y - p.y), PORT_PICK);
    }
    if (hits.length === 0) return null;
    return hits.reduce((best, hit) => (hit.d < best.d ? hit : best));
  };

  const dispatchHit = (hit: { kind: PickKind; id: string }) => {
    if (hit.kind === "vertex") clickVertex(hit.id);
    else if (hit.kind === "edge") clickEdge(hit.id);
    else if (hit.kind === "hex") clickHex(hit.id);
    else if (hit.kind === "victim") clickVictim(hit.id);
  };

  const rememberHover = (next: { kind: PickKind; id: string } | null) => {
    const prev = hoverRef.current;
    if (prev?.kind === next?.kind && prev?.id === next?.id) return;
    hoverRef.current = next;
    setHover(next);
  };

  const placeTip = (clientX: number, clientY: number, id: string | null) => {
    const node = tipRef.current;
    if (!node || !host.current) return;
    if (!id) {
      node.style.display = "none";
      if (tipIdRef.current) {
        tipIdRef.current = null;
        setTipId(null);
      }
      return;
    }
    const rect = host.current.getBoundingClientRect();
    node.style.display = "block";
    node.style.left = `${clientX - rect.left + 14}px`;
    node.style.top = `${clientY - rect.top + 14}px`;
    if (tipIdRef.current !== id) {
      tipIdRef.current = id;
      setTipId(id);
    }
  };

  const stepNivel = (dir: 1 | -1, anchor?: { x: number; y: number }) => {
    const fitNow = fitRef.current;
    const ratio = fitNow > 0 ? zoomRef.current / fitNow : 1;
    let index = 0;
    if (dir > 0) {
      const found = LEVELS.findIndex((level) => level > ratio + 0.01);
      index = found < 0 ? LEVELS.length - 1 : found;
    } else {
      for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (LEVELS[i]! < ratio - 0.01) {
          index = i;
          break;
        }
      }
    }
    const next = LEVELS[index]!;
    const newZoom = Math.min(3, fitNow * next);
    if (anchor && host.current) {
      const world = clientToWorld(anchor.x, anchor.y);
      const rect = host.current.getBoundingClientRect();
      setPan({
        x: anchor.x - rect.left - host.current.clientWidth / 2 - (world.x - originRef.current.x) * newZoom,
        y: anchor.y - rect.top - host.current.clientHeight / 2 - (world.y - originRef.current.y) * newZoom,
      });
    } else {
      const k = zoomRef.current > 0 ? newZoom / zoomRef.current : 1;
      setPan((p) => ({ x: p.x * k, y: p.y * k }));
    }
    zoomRef.current = newZoom;
    setPinchZoom(null);
    setNivel(next);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    stepNivel(e.deltaY < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const world = clientToWorld(mid.x, mid.y);
      pinchRef.current = {
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startZoom: zoomRef.current,
        worldX: world.x,
        worldY: world.y,
      };
      drag.current = null;
      return;
    }
    drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false, pointerType: e.pointerType };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchRef.current && pointers.current.size >= 2 && host.current) {
      const pts = [...pointers.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = Math.min(3, Math.max(fitRef.current, pinchRef.current.startZoom * (dist / pinchRef.current.startDist)));
      const rect = host.current.getBoundingClientRect();
      setPan({
        x: mid.x - rect.left - host.current.clientWidth / 2 - (pinchRef.current.worldX - originRef.current.x) * next,
        y: mid.y - rect.top - host.current.clientHeight / 2 - (pinchRef.current.worldY - originRef.current.y) * next,
      });
      zoomRef.current = next;
      setPinchZoom(next);
      return;
    }
    const hit = pickAt(clientToWorld(e.clientX, e.clientY), e.pointerType);
    rememberHover(hit ? { kind: hit.kind, id: hit.id } : null);
    placeTip(e.clientX, e.clientY, hit?.kind === "port" ? hit.id : null);
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < DRAG_SLOP) return;
    if (d.pointerType === "touch" && zoomRef.current <= fitRef.current + 0.02) return;
    d.moved = true;
    setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinchRef.current && pointers.current.size < 2) {
      const rounded = Math.min(3, Math.max(fitRef.current, Math.round(zoomRef.current * 4) / 4));
      zoomRef.current = rounded;
      setPinchZoom(rounded);
      pinchRef.current = null;
      drag.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const hit = pickAt(clientToWorld(e.clientX, e.clientY), e.pointerType);
    if (e.pointerType === "touch") {
      if (!hit || hit.kind === "port") {
        armedRef.current = null;
        setArmed(null);
        rememberHover(null);
        return;
      }
      const next = { kind: hit.kind, id: hit.id };
      if (armedRef.current?.kind === next.kind && armedRef.current.id === next.id) {
        armedRef.current = null;
        setArmed(null);
        dispatchHit(next);
        return;
      }
      armedRef.current = next;
      rememberHover(next);
      setArmed(next);
      return;
    }
    if (!hit || hit.kind === "port") return;
    dispatchHit(hit);
  };

  const youPlayer = view.players.find((p) => p.id === you);
  const youColor = youPlayer?.color ?? "#e8e0d0";
  const robberHex = view.board.hexes[robberPos] ?? view.board.hexes[view.board.robberHexId];
  const robberPixel = robberHex ? pointyHexToPixel(robberHex, HEX_SIZE) : { x: 0, y: 0 };
  const yourTurn = Boolean(you && you === view.currentPlayerId);
  const hint = boardHint(view, settleTargets.size, cityTargets.size, roadTargets.size, robberTargets.size);
  const active = armed ?? hover;
  const produce =
    view.phase.type === "setupSettlement" && active?.kind === "vertex" && settleTargets.has(active.id)
      ? productionTip(view.board, active.id)
      : null;
  const canClick = Boolean(
    active &&
      ((active.kind === "vertex" && (settleTargets.has(active.id) || cityTargets.has(active.id))) ||
        (active.kind === "edge" && roadTargets.has(active.id)) ||
        (active.kind === "hex" && robberTargets.has(active.id)) ||
        (active.kind === "victim" && victimTargets.has(active.id)) ||
        active.kind === "port"),
  );
  const hoverHex = active?.kind === "hex" && robberTargets.has(active.id) ? view.board.hexes[active.id] : undefined;

  return (
    <div
      ref={host}
      className="board-felt relative h-full min-h-[420px] w-full touch-none overflow-hidden"
      style={{ cursor: canClick ? "pointer" : "grab" }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        if (!drag.current && !armedRef.current) rememberHover(null);
        placeTip(0, 0, null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onClearBuild?.();
      }}
    >
      <Application resizeTo={host} background={0x0b4d66} antialias={false} roundPixels preference="webgl">
        <AnimClockProvider>
        <pixiContainer x={size.w / 2 + pan.x + nudge} y={size.h / 2 + pan.y} scale={zoom}>
          <pixiContainer x={-origin.x} y={-origin.y}>
            {textures ? <IslandPicture board={view.board} textures={textures} origin={origin} /> : null}
            {sortedEdges.map((edge) => {
              const a = vertexPos(view.board, edge.vertices[0]);
              const b = vertexPos(view.board, edge.vertices[1]);
              const owner = view.players.find((p) => p.id === edge.road);
              const hot = roadTargets.has(edge.id);
              const hovered = active?.kind === "edge" && active.id === edge.id;
              const ghost = hot && !edge.road;
              const color = owner?.color ?? youColor;
              const ang = Math.atan2(b.y - a.y, b.x - a.x);
              const length = Math.hypot(b.x - a.x, b.y - a.y);
              return (
                <pixiContainer
                  key={edge.id}
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2}
                  rotation={ang}
                  eventMode="none"
                >
                  {roads[edge.id] ? (
                    <RevealingTrack
                      length={length}
                      color={color}
                      hovered={hovered}
                      startFrame={roads[edge.id]!.start}
                      from={roads[edge.id]!.from}
                      edgeId={edge.id}
                      onDone={finishRoad}
                    />
                  ) : ghost || edge.road ? (
                    <DirtTrack length={length} color={color} ghost={ghost} hovered={hovered} />
                  ) : null}
                </pixiContainer>
              );
            })}
            {sortedVertices.map((v) => {
              const p = vertexPos(view.board, v.id);
              const owner = v.building ? view.players.find((pl) => pl.id === v.building?.owner) : null;
              const hot = settleTargets.has(v.id) || cityTargets.has(v.id);
              const hovered = active?.kind === "vertex" && active.id === v.id;
              const ghost = hot && !v.building;
              const cityPick = cityTargets.has(v.id);
              const previewCity = cityPick && hovered;
              const color = owner?.color ?? youColor;
              const kind = previewCity ? "city" : (v.building?.type ?? "settlement");
              const url = kind === "city" ? citySprite(color) : settlementSprite(color);
              const tex = textures?.[url];
              const piece = (
                <pixiContainer scale={0.82} eventMode="none">
                  {ghost || v.building ? <VertexPad /> : null}
                  {(ghost || cityPick) && !hovered ? <SurveyStakes color={color} /> : null}
                  {((ghost && hovered) || (v.building && !previewCity) || previewCity) && tex ? (
                    <pixiSprite
                      texture={tex}
                      anchor={{ x: 0.5, y: 0.9 }}
                      alpha={ghost || previewCity ? 0.65 : 1}
                      eventMode="none"
                    />
                  ) : null}
                </pixiContainer>
              );
              const drop = v.building ? drops[v.id] : undefined;
              return (
                <pixiContainer key={v.id} x={p.x} y={p.y} eventMode="none">
                  {drop != null ? (
                    <FallingHouse startFrame={drop} vertexId={v.id} onDone={finishDrop}>
                      {piece}
                    </FallingHouse>
                  ) : (
                    piece
                  )}
                </pixiContainer>
              );
            })}
            {hoverHex ? (
              <pixiContainer x={pointyHexToPixel(hoverHex, HEX_SIZE).x} y={pointyHexToPixel(hoverHex, HEX_SIZE).y}>
                <RobberShade />
                <RobberSprite x={0} y={-4} textures={textures} alpha={0.5} />
              </pixiContainer>
            ) : null}
            <RobberSprite
              x={robberPixel.x}
              y={robberPixel.y - 4}
              textures={textures}
              hopping={robberPos !== view.board.robberHexId}
            />
            <FxLayer batch={events} board={view.board} textures={textures} players={view.players} />
            {pendingRobberHex && view.board.hexes[pendingRobberHex] ? (
              <RobberSprite
                x={pointyHexToPixel(view.board.hexes[pendingRobberHex], HEX_SIZE).x}
                y={pointyHexToPixel(view.board.hexes[pendingRobberHex], HEX_SIZE).y - 4}
                textures={textures}
                alpha={0.5}
              />
            ) : null}
          </pixiContainer>
        </pixiContainer>
        </AnimClockProvider>
      </Application>
      <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-1">
        <button
          type="button"
          aria-label="+"
          className="pixel-btn bg-secondary grid size-8 place-items-center"
          onClick={() => stepNivel(1)}
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="−"
          className="pixel-btn bg-secondary grid size-8 place-items-center"
          onClick={() => stepNivel(-1)}
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Centralizar"
          className="pixel-btn bg-secondary grid size-8 place-items-center"
          onClick={() => {
            setPinchZoom(null);
            setNivel(1);
            setPan({ x: 0, y: 0 });
            zoomRef.current = Math.min(3, fitRef.current);
          }}
        >
          <LocateFixed className="size-4" />
        </button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-16">
        <p className="wood-panel text-parchment max-w-[36rem] px-3 py-1.5 text-center text-xs">
          {pendingRobberHex
            ? "Escolha de quem roubar: toque numa casa vizinha ao ladrão."
            : buildMode
              ? buildModeCopy(buildMode)
              : phaseCopy(view.phase, yourTurn && interactive)}
          {armed ? (
            <span className="mt-0.5 block">Toque de novo para confirmar</span>
          ) : settleTargets.size + cityTargets.size + roadTargets.size + robberTargets.size > 0 ? (
            <span className="mt-0.5 block">{hint}</span>
          ) : null}
          {produce ? <span className="mt-0.5 block">{produce}</span> : null}
        </p>
      </div>
      <div
        ref={tipRef}
        className="wood-panel pointer-events-none absolute z-20 max-w-xs px-2 py-1 text-[11px]"
        style={{ display: "none" }}
      >
        {portHint(view.board.ports.find((port) => port.edgeId === tipId))}
      </div>
      {!textures ? <TableLoading progress={progress} /> : null}
    </div>
  );
}

const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function productionTip(board: Board, vertexId: string): string {
  const vertex = board.vertices[vertexId];
  if (!vertex) return "Produz: nada neste ponto.";
  const parts: string[] = [];
  for (const hexId of vertex.hexes) {
    const hex = board.hexes[hexId];
    if (!hex || hex.terrain === "desert" || hex.number == null) continue;
    parts.push(`${RESOURCE_LABEL[hex.terrain].toLowerCase()} ${"●".repeat(PIPS[hex.number] ?? 0)}`);
  }
  return parts.length > 0 ? `Produz: ${parts.join(", ")}` : "Produz: nada neste ponto.";
}

function boardHint(
  view: PublicView,
  settles: number,
  cities: number,
  roads: number,
  robbers: number,
): string {
  if (view.winnerId) return "A ilha tem um vencedor.";
  if (robbers) return "Clique num terreno para pousar o ladrão.";
  if (settles) return "Os anéis marcam onde dá para fundar uma aldeia.";
  if (cities) return "Transforme a aldeia em cidade.";
  if (roads) return "Toque num dos tracejados para abrir a estrada.";
  return "Arraste o mapa. A roda do mouse aproxima.";
}

function portHint(port: Board["ports"][number] | undefined): string {
  if (!port || port.ratio === 3 || port.resource === "any") return "Porto geral: 3 iguais por 1 à escolha";
  const name = RESOURCE_LABEL[port.resource].toLowerCase();
  return `Porto de ${name}: 2 ${name} por 1 recurso à escolha`;
}

function RobberSprite({
  x,
  y,
  textures,
  alpha = 1,
  hopping = false,
}: {
  x: number;
  y: number;
  textures: Record<string, Texture> | null;
  alpha?: number;
  hopping?: boolean;
}) {
  const frame = useAnimFrame();
  const blink = Math.floor((frame * 83) / 380) % 2;
  const hop = hopping && frame % 2 === 0 ? 2 : 0;
  const tex = textures?.[`/sprites/robber-${blink}.png`];
  if (!tex) return null;
  return <pixiSprite texture={tex} x={x} y={y - hop} alpha={alpha} anchor={{ x: 0.5, y: 0.85 }} eventMode="none" />;
}

function TableLoading({ progress }: { progress: number }) {
  const pct = Math.round(Math.min(1, progress) * 100);
  return (
    <div className="table-loading absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-6">
      <img src="/sprites/poster.png" alt="" className="pixelated pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35" />
      <div className="relative wood-panel max-w-sm p-5 text-center">
        <p className="text-gold text-[10px] tracking-[0.28em] uppercase">Ilha das Lanternas</p>
        <h2 className="mt-1 text-2xl">Preparando a mesa</h2>
        <p className="text-muted-foreground mt-2 text-sm">As lanternas acendem. Os terrenos encaixam uns nos outros.</p>
        <div className="mt-4 h-3 w-full border-2 border-[#8a6410] bg-[#1a1520]">
          <div className="h-full bg-[#d4a017]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-gold mt-2 text-xs">{pct}%</p>
      </div>
    </div>
  );
}

function IslandBase({ board }: { board: Board }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      for (const hex of Object.values(board.hexes)) {
        const p = pointyHexToPixel(hex, HEX_SIZE);
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const c = hexCorner({ x: p.x, y: p.y + 4 }, HEX_SIZE + 3, i);
          pts.push(c.x, c.y);
        }
        g.poly(pts);
        g.fill({ color: 0x071018, alpha: 0.4 });
      }
    },
    [board],
  );
  return <pixiGraphics draw={draw} eventMode="none" />;
}

function CoastFoam({ board }: { board: Board }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const land = board.hexes;
      for (const hex of Object.values(land)) {
        const c = pointyHexToPixel(hex, HEX_SIZE);
        for (let i = 0; i < 6; i++) {
          const n = addAxial(hex, HEX_DIRS[i]!);
          if (land[hexId(n.q, n.r)]) continue;
          const a = hexCorner(c, HEX_SIZE, i);
          const b = hexCorner(c, HEX_SIZE, (i + 1) % 6);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const len = Math.hypot(mx - c.x, my - c.y) || 1;
          const nx = (mx - c.x) / len;
          const ny = (my - c.y) / len;
          g.moveTo(a.x + nx * 1.5, a.y + ny * 1.5);
          g.lineTo(b.x + nx * 1.5, b.y + ny * 1.5);
          g.stroke({ width: 2.5, color: 0x9ad1e5, alpha: 0.7 });
          g.moveTo(a.x + nx * 3.5, a.y + ny * 3.5);
          g.lineTo(b.x + nx * 3.5, b.y + ny * 3.5);
          g.stroke({ width: 1.5, color: 0xf4e8c8, alpha: 0.35 });
        }
      }
    },
    [board],
  );
  return <pixiGraphics draw={draw} eventMode="none" />;
}

function VertexPad() {
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    g.ellipse(0, 4, 11, 7);
    g.fill({ color: 0x3a2818, alpha: 0.72 });
    g.ellipse(0, 3, 9, 5);
    g.fill({ color: 0x7a5a38, alpha: 0.88 });
    g.ellipse(0, 2, 6, 3);
    g.fill({ color: 0xb08a58, alpha: 0.55 });
  }, []);
  return <pixiGraphics draw={draw} />;
}

function DirtTrack({
  length,
  color,
  ghost,
  hovered,
  reveal = 1,
  from = -1,
}: {
  length: number;
  color: string;
  ghost: boolean;
  hovered: boolean;
  reveal?: number;
  from?: -1 | 1;
}) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      // A plank road in the owner's color: dark outline, colored body, a lit
      // top edge and plank seams. It has to read at a glance from any zoom.
      const pad = 8;
      const L = Math.max(10, length - pad * 2);
      const left = -L / 2;
      const base = FACTION_HEX[color] ?? 0xe8e0d0;
      g.clear();
      if (ghost) {
        const dash = 5;
        const gap = 3;
        // Parchment dashes read on every terrain; the owner's color shows on hover.
        for (let x = left; x < left + L - 1; x += dash + gap) {
          const w = Math.min(dash, left + L - x);
          g.rect(x - 1, -2.5, w + 2, 5);
          g.fill({ color: 0x1a1208, alpha: 0.85 });
          g.rect(x, -1.5, w, 3);
          g.fill({ color: hovered ? base : PALETTE.parchment, alpha: hovered ? 1 : 0.92 });
        }
        return;
      }
      const x0 = reveal >= 1 ? left : from < 0 ? left : left + (1 - reveal) * L;
      const w = reveal >= 1 ? L : Math.max(1, reveal * L);
      g.rect(x0 - 1, -2, w + 2, 6.5);
      g.fill({ color: 0x0d0805, alpha: 0.45 });
      g.rect(x0 - 1, -3.5, w + 2, 7);
      g.fill({ color: shade(base, -0.62) });
      g.rect(x0, -2.5, w, 5);
      g.fill({ color: base });
      g.rect(x0, -2.5, w, 1.25);
      g.fill({ color: shade(base, 0.38) });
      g.rect(x0, 1.5, w, 1);
      g.fill({ color: shade(base, -0.3) });
      for (let x = left + 5; x < left + L - 2; x += 5) {
        if (x < x0 || x > x0 + w) continue;
        g.rect(x, -2.5, 0.75, 5);
        g.fill({ color: shade(base, -0.45), alpha: 0.55 });
      }
      if (hovered) {
        g.rect(x0 - 2, -4.5, w + 4, 9);
        g.stroke({ width: 1, color: PALETTE.parchment, alpha: 0.7 });
      }
    },
    [length, color, ghost, hovered, reveal, from],
  );
  return <pixiGraphics draw={draw} />;
}

function roadRevealFrom(board: Board, playerId: string, edgeId: string): -1 | 1 {
  const edge = board.edges[edgeId];
  if (!edge) return -1;
  const score = (vid: string) => {
    const vertex = board.vertices[vid];
    if (!vertex) return 0;
    let n = vertex.building?.owner === playerId ? 2 : 0;
    for (const eid of vertex.edges) {
      if (eid !== edgeId && board.edges[eid]?.road === playerId) n += 1;
    }
    return n;
  };
  return score(edge.vertices[0]) >= score(edge.vertices[1]) ? -1 : 1;
}

function RevealingTrack({
  length,
  color,
  hovered,
  startFrame,
  from,
  edgeId,
  onDone,
}: {
  length: number;
  color: string;
  hovered: boolean;
  startFrame: number;
  from: -1 | 1;
  edgeId: string;
  onDone: (id: string) => void;
}) {
  const frame = useAnimFrame();
  const duration = motionMs(240);
  const elapsed = Math.max(0, (frame - startFrame) * 83);
  const reveal = Math.min(1, elapsed / duration);
  const done = elapsed >= duration;
  useEffect(() => {
    if (done) onDone(edgeId);
  }, [done, edgeId, onDone]);
  return <DirtTrack length={length} color={color} ghost={false} hovered={hovered} reveal={reveal} from={from} />;
}

function FallingHouse({
  startFrame,
  vertexId,
  onDone,
  children,
}: {
  startFrame: number;
  vertexId: string;
  onDone: (id: string) => void;
  children: ReactNode;
}) {
  const frame = useAnimFrame();
  const duration = motionMs(180);
  const elapsed = Math.max(0, (frame - startFrame) * 83);
  const age = Math.min(1, elapsed / duration);
  const done = elapsed >= duration;
  useEffect(() => {
    if (done) onDone(vertexId);
  }, [done, vertexId, onDone]);
  const step = Math.min(2, Math.floor(age * 3));
  return (
    <pixiContainer eventMode="none">
      <pixiContainer y={Math.round(-6 * (1 - age))} eventMode="none">
        {children}
      </pixiContainer>
      <DustPuff step={step} />
    </pixiContainer>
  );
}

function DustPuff({ step }: { step: number }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const spots = [
        [
          [-6, 2],
          [5, 3],
          [-2, 5],
        ],
        [
          [-8, 4],
          [7, 2],
          [1, 6],
        ],
        [
          [-4, 6],
          [8, 5],
          [3, 8],
        ],
      ][step];
      if (!spots) return;
      for (const [x, y] of spots) {
        g.rect(x, y, 2, 2);
        g.fill({ color: 0x7a5a38, alpha: step === 2 ? 0.4 : 0.85 });
      }
    },
    [step],
  );
  return <pixiGraphics draw={draw} eventMode="none" />;
}

function FallbackHex({ terrain }: { terrain: string }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const c = hexCorner({ x: 0, y: 0 }, HEX_SIZE - 1, i);
        pts.push(Math.round(c.x), Math.round(c.y));
      }
      const colors: Record<string, number> = {
        wood: 0x2f6b32,
        brick: 0xb24a32,
        sheep: 0x6db35c,
        wheat: 0xe0b33a,
        ore: 0x5c6573,
        desert: 0xc2a366,
      };
      g.poly(pts);
      g.fill({ color: colors[terrain] ?? 0x444444 });
    },
    [terrain],
  );
  return <pixiGraphics draw={draw} />;
}

function NumberToken({
  x,
  y,
  value,
  texture,
}: {
  x: number;
  y: number;
  value: number;
  texture?: Texture;
}) {
  const red = value === 6 || value === 8;
  return (
    <pixiContainer x={x} y={y} eventMode="none">
      {texture ? (
        <pixiSprite texture={texture} anchor={0.5} scale={0.78} />
      ) : (
        <FallbackToken />
      )}
      <pixiText
        text={String(value)}
        anchor={0.5}
        y={-2}
        resolution={4}
        style={{
          fontFamily: "Pixelify Sans, monospace",
          fontSize: red ? 14 : 12,
          fill: red ? 0xb8281c : PALETTE.night,
          fontWeight: "700",
        }}
      />
      <TokenPips value={value} red={red} />
    </pixiContainer>
  );
}

/** Dots under the number: how many of the 36 dice rolls hit it. */
function TokenPips({ value, red }: { value: number; red: boolean }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      const n = PIPS[value] ?? 0;
      g.clear();
      const start = -((n - 1) * 3) / 2;
      for (let i = 0; i < n; i++) {
        g.rect(Math.round(start + i * 3) - 1, 7, 2, 2);
        g.fill({ color: red ? 0xb8281c : PALETTE.night });
      }
    },
    [value, red],
  );
  return <pixiGraphics draw={draw} eventMode="none" />;
}

function FallbackToken() {
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    g.circle(0, 0, 10);
    g.fill({ color: PALETTE.parchment });
    g.stroke({ width: 2, color: PALETTE.goldDark });
  }, []);
  return <pixiGraphics draw={draw} />;
}

const IslandPicture = memo(function IslandPicture({
  board,
  textures,
  origin,
}: {
  board: Board;
  textures: Record<string, Texture> | null;
  origin: { x: number; y: number };
}) {
  const land = Object.values(board.hexes).sort((a, b) => b.r - a.r || b.q - a.q);
  return (
    <pixiContainer>
      {seaRing().map((h) => {
        const p = pointyHexToPixel(h, HEX_SIZE);
        const tex = textures?.["/sprites/hex-sea.png"];
        return tex ? (
          <pixiSprite
            key={`sea-${h.q},${h.r}`}
            texture={tex}
            x={p.x}
            y={p.y}
            anchor={HEX_SPRITE_ANCHOR}
            eventMode="none"
          />
        ) : null;
      })}
      <IslandBase board={board} />
      {land.map((hex) => {
        const p = pointyHexToPixel(hex, HEX_SIZE);
        const url = TERRAIN_SPRITE[hex.terrain];
        const tex = url ? textures?.[url] : undefined;
        return (
          <pixiContainer key={hex.id} x={p.x} y={p.y} eventMode="none">
            {tex ? <pixiSprite texture={tex} anchor={HEX_SPRITE_ANCHOR} eventMode="none" /> : <FallbackHex terrain={hex.terrain} />}
          </pixiContainer>
        );
      })}
      <CoastFoam board={board} />
      {land.map((hex) => {
        if (hex.number === null) return null;
        const p = pointyHexToPixel(hex, HEX_SIZE);
        return (
          <NumberToken
            key={`tok-${hex.id}`}
            x={p.x}
            y={Math.round(p.y + 2)}
            value={hex.number}
            texture={textures?.["/sprites/token.png"]}
          />
        );
      })}
      {board.ports.map((port) => {
        const anchor = portAnchor(board, origin, port.edgeId);
        const url = port.ratio === 3 ? "/sprites/port-any.png" : "/sprites/port-2.png";
        const tex = textures?.[url];
        const specific = port.resource !== "any";
        const chip = specific ? textures?.[CHIP_SPRITE[port.resource]] : undefined;
        const ends = port.vertices.map((v) => vertexPos(board, v));
        return (
          <pixiContainer key={port.edgeId}>
            <PortPiers from={anchor} to={ends} />
            <pixiContainer x={anchor.x} y={anchor.y}>
              {tex ? <pixiSprite texture={tex} anchor={0.5} scale={0.8} eventMode="none" /> : null}
              <PortPlaque specific={specific} />
              {chip ? <pixiSprite texture={chip} x={-8} y={15} anchor={0.5} scale={0.62} eventMode="none" /> : null}
              <pixiText
                text={port.ratio === 3 ? "3:1" : "2:1"}
                x={specific ? 6 : 0}
                y={15}
                anchor={0.5}
                resolution={4}
                eventMode="none"
                style={{
                  fontFamily: "Pixelify Sans, monospace",
                  fontSize: 10,
                  fill: 0x2a1c12,
                  fontWeight: "700",
                }}
              />
            </pixiContainer>
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
});

/** Two plank piers from the dock to the intersections that use the port. */
function PortPiers({ from, to }: { from: { x: number; y: number }; to: Array<{ x: number; y: number }> }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      for (const end of to) {
        const dx = end.x - from.x;
        const dy = end.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        // Stop short of the corner so the pier doesn't cover a house.
        const stop = Math.max(0, len - 7);
        const tx = from.x + (dx / len) * stop;
        const ty = from.y + (dy / len) * stop;
        g.moveTo(from.x, from.y);
        g.lineTo(tx, ty);
        g.stroke({ width: 4, color: 0x2a1c12 });
        g.moveTo(from.x, from.y);
        g.lineTo(tx, ty);
        g.stroke({ width: 2, color: 0x9a7448 });
      }
    },
    [from, to],
  );
  return <pixiGraphics draw={draw} eventMode="none" />;
}

function PortPlaque({ specific }: { specific: boolean }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      const w = specific ? 30 : 22;
      g.clear();
      g.rect(-w / 2 - 1, 8, w + 2, 14);
      g.fill({ color: 0x2a1c12 });
      g.rect(-w / 2, 9, w, 12);
      g.fill({ color: PALETTE.parchment });
      g.rect(-w / 2, 19, w, 2);
      g.fill({ color: 0xc9b48a });
    },
    [specific],
  );
  return <pixiGraphics draw={draw} eventMode="none" />;
}

/** A ring on a free intersection where a piece can go. */
function SurveyStakes({ color }: { color: string }) {
  const frame = useAnimFrame();
  const pulse = (frame % 12) < 6 ? 0 : 1;
  const draw = useCallback(
    (g: PixiGraphics) => {
      const mark = FACTION_HEX[color] ?? 0xe8e0d0;
      g.clear();
      g.circle(0, 0, 7 + pulse);
      g.stroke({ width: 4, color: 0x1a1208, alpha: 0.85 });
      g.circle(0, 0, 7 + pulse);
      g.stroke({ width: 2, color: PALETTE.parchment });
      g.circle(0, 0, 2.5);
      g.fill({ color: mark });
    },
    [color, pulse],
  );
  return <pixiGraphics draw={draw} eventMode="none" />;
}

function RobberShade() {
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const c = hexCorner({ x: 0, y: 0 }, HEX_SIZE - 1, i);
      pts.push(c.x, c.y);
    }
    g.poly(pts);
    g.fill({ color: 0x071018, alpha: 0.25 });
  }, []);
  return <pixiGraphics draw={draw} />;
}
