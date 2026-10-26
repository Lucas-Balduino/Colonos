import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Application, extend, useTick } from "@pixi/react";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { Graphics as PixiGraphics } from "pixi.js";
import { toast } from "sonner";
import { addAxial, cubeDistance, HEX_DIRS, hexCorner, hexId, parseHexId, pointyHexToPixel } from "../core/hex.ts";
import type { Action, Board, HexId, PublicView } from "../core/types.ts";
import {
  BOARD_URLS,
  citySprite,
  HEX_SIZE,
  HEX_SPRITE_ANCHOR,
  settlementSprite,
  TERRAIN_SPRITE,
} from "./assets.ts";
import { sfx } from "./audio.ts";
import { FACTION_HEX, PALETTE } from "./theme.ts";
import { phaseCopy } from "./copy.ts";
import { preloadSprites } from "./preload.ts";

extend({ Container, Graphics, Sprite, Text });

const DRAG_SLOP = 10;
const VERTEX_PICK = 30;
const EDGE_PICK = 20;
const HEX_PICK = HEX_SIZE * 0.78;

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

function seaRing(): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  for (let q = -4; q <= 4; q++) {
    for (let r = -4; r <= 4; r++) {
      const d = cubeDistance({ q, r });
      if (d === 3 || d === 4) out.push({ q, r });
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
      for (const url of BOARD_URLS) {
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
}: {
  view: PublicView;
  onAction: (a: Action) => boolean | void;
  interactive: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { map: textures, progress } = useTextures();
  const you = view.you;
  const legal = view.legal;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 640, h: 480 });
  const [shakeUntil, setShakeUntil] = useState(0);
  const [nudge, setNudge] = useState(0);
  const [hover, setHover] = useState<{ kind: "hex" | "vertex" | "edge"; id: string } | null>(null);
  const [robberPos, setRobberPos] = useState(view.board.robberHexId);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [pops, setPops] = useState<Record<string, number>>({});
  const drag = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const nudgeRef = useRef(nudge);
  const originRef = useRef({ x: 0, y: 0 });
  panRef.current = pan;
  zoomRef.current = zoom;
  nudgeRef.current = nudge;
  const prevDice = useRef(view.dice);
  const prevRobber = useRef(view.board.robberHexId);
  const prevBuildings = useRef<string>("");

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

  const settleTargets = useMemo(() => {
    const ids = new Set<string>();
    for (const a of legal) {
      if (a.type === "PLACE_SETTLEMENT" || a.type === "BUILD_SETTLEMENT") ids.add(a.vertexId);
    }
    return ids;
  }, [legal]);

  const cityTargets = useMemo(() => {
    const ids = new Set<string>();
    for (const a of legal) if (a.type === "BUILD_CITY") ids.add(a.vertexId);
    return ids;
  }, [legal]);

  const roadTargets = useMemo(() => {
    const ids = new Set<string>();
    for (const a of legal) {
      if (a.type === "PLACE_ROAD" || a.type === "BUILD_ROAD") ids.add(a.edgeId);
    }
    return ids;
  }, [legal]);

  const robberTargets = useMemo(() => {
    const map = new Map<string, Action>();
    for (const a of legal) {
      if (a.type === "MOVE_ROBBER" && !map.has(a.hexId)) map.set(a.hexId, a);
    }
    return map;
  }, [legal]);

  const landHexes = useMemo(
    () => Object.values(view.board.hexes).sort((a, b) => b.r - a.r || b.q - a.q),
    [view.board.hexes],
  );

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

  useEffect(() => {
    if (!view.dice || view.dice === prevDice.current) return;
    prevDice.current = view.dice;
    const sum = view.dice[0] + view.dice[1];
    const hit = new Set<string>();
    for (const h of Object.values(view.board.hexes)) {
      if (h.number === sum && view.board.robberHexId !== h.id) hit.add(h.id);
    }
    setFlash(hit);
    const t = window.setTimeout(() => setFlash(new Set()), 720);
    return () => window.clearTimeout(t);
  }, [view.dice, view.board]);

  useEffect(() => {
    const dest = view.board.robberHexId;
    if (dest === prevRobber.current) return;
    const path = hexPath(prevRobber.current, dest);
    prevRobber.current = dest;
    let i = 0;
    const tick = window.setInterval(() => {
      setRobberPos(path[i]!);
      i += 1;
      if (i >= path.length) window.clearInterval(tick);
    }, 90);
    return () => window.clearInterval(tick);
  }, [view.board.robberHexId]);

  useEffect(() => {
    const key = Object.values(view.board.vertices)
      .map((v) => `${v.id}:${v.building?.type ?? ""}:${v.building?.owner ?? ""}`)
      .join("|");
    if (prevBuildings.current && prevBuildings.current !== key) {
      const prev = new Set(prevBuildings.current.split("|"));
      const nextPops: Record<string, number> = {};
      for (const part of key.split("|")) {
        if (!prev.has(part) && (part.includes("settlement") || part.includes("city"))) {
          nextPops[part.split(":")[0]!] = performance.now();
        }
      }
      if (Object.keys(nextPops).length) setPops((p) => ({ ...p, ...nextPops }));
    }
    prevBuildings.current = key;
  }, [view.board.vertices]);

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
    const a = robberTargets.get(hid);
    if (a) return void onAction(a);
    if (robberTargets.size) invalid();
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

  const pickAt = (world: { x: number; y: number }): { kind: "vertex" | "edge" | "hex"; id: string; d: number } | null => {
    const hits: { kind: "vertex" | "edge" | "hex"; id: string; d: number }[] = [];
    const consider = (kind: "vertex" | "edge" | "hex", id: string, d: number, limit: number) => {
      if (d <= limit) hits.push({ kind, id, d });
    };
    for (const id of settleTargets) {
      const p = vertexPos(view.board, id);
      consider("vertex", id, Math.hypot(world.x - p.x, world.y - p.y), VERTEX_PICK);
    }
    for (const id of cityTargets) {
      const p = vertexPos(view.board, id);
      consider("vertex", id, Math.hypot(world.x - p.x, world.y - p.y), VERTEX_PICK);
    }
    for (const id of roadTargets) {
      const edge = view.board.edges[id];
      if (!edge) continue;
      const a = vertexPos(view.board, edge.vertices[0]);
      const b = vertexPos(view.board, edge.vertices[1]);
      consider("edge", id, distToSegment(world.x, world.y, a.x, a.y, b.x, b.y), EDGE_PICK);
    }
    for (const id of robberTargets.keys()) {
      const hex = view.board.hexes[id];
      if (!hex) continue;
      const p = pointyHexToPixel(hex, HEX_SIZE);
      consider("hex", id, Math.hypot(world.x - p.x, world.y - p.y), HEX_PICK);
    }
    if (hits.length === 0) return null;
    return hits.reduce((best, hit) => (hit.d < best.d ? hit : best));
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(1, z + (e.deltaY < 0 ? 1 : -1))));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const world = clientToWorld(e.clientX, e.clientY);
    const hit = pickAt(world);
    setHover(hit ? { kind: hit.kind, id: hit.id } : null);
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < DRAG_SLOP) return;
    d.moved = true;
    setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const hit = pickAt(clientToWorld(e.clientX, e.clientY));
    if (!hit) return;
    if (hit.kind === "vertex") clickVertex(hit.id);
    else if (hit.kind === "edge") clickEdge(hit.id);
    else clickHex(hit.id);
  };

  const youPlayer = view.players.find((p) => p.id === you);
  const youColor = youPlayer?.color ?? "#e8e0d0";
  const robberHex = view.board.hexes[robberPos] ?? view.board.hexes[view.board.robberHexId];
  const robberPixel = robberHex ? pointyHexToPixel(robberHex, HEX_SIZE) : { x: 0, y: 0 };
  const yourTurn = Boolean(you && you === view.currentPlayerId);
  const hint = boardHint(view, settleTargets.size, cityTargets.size, roadTargets.size, robberTargets.size);
  const canClick = Boolean(
    hover &&
      ((hover.kind === "vertex" && (settleTargets.has(hover.id) || cityTargets.has(hover.id))) ||
        (hover.kind === "edge" && roadTargets.has(hover.id)) ||
        (hover.kind === "hex" && robberTargets.has(hover.id))),
  );

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
        if (!drag.current) setHover(null);
      }}
    >
      <Application resizeTo={host} background={0x0c2433} antialias={false} roundPixels preference="webgl">
        <pixiContainer x={size.w / 2 + pan.x + nudge} y={size.h / 2 + pan.y} scale={zoom}>
          <pixiContainer x={-origin.x} y={-origin.y}>
            {seaRing().map((h) => {
              const p = pointyHexToPixel(h, HEX_SIZE);
              const tex = textures?.["/sprites/hex-sea.png"];
              const far = cubeDistance(h) === 4;
              return tex ? (
                <pixiSprite
                  key={`sea-${h.q},${h.r}`}
                  texture={tex}
                  x={p.x}
                  y={p.y}
                  anchor={HEX_SPRITE_ANCHOR}
                  alpha={far ? 0.55 : 1}
                  eventMode="none"
                />
              ) : null;
            })}
            <IslandBase board={view.board} />
            {landHexes.map((hex) => {
              const p = pointyHexToPixel(hex, HEX_SIZE);
              const url = TERRAIN_SPRITE[hex.terrain];
              const tex = url ? textures?.[url] : undefined;
              const canRob = robberTargets.has(hex.id);
              const lit = flash.has(hex.id);
              return (
                <pixiContainer key={hex.id} x={p.x} y={p.y} eventMode="none">
                  {tex ? (
                    <pixiSprite texture={tex} anchor={HEX_SPRITE_ANCHOR} eventMode="none" />
                  ) : (
                    <FallbackHex terrain={hex.terrain} />
                  )}
                  {lit ? <HarvestGlow /> : null}
                  {canRob ? <RobberTarget /> : null}
                </pixiContainer>
              );
            })}
            <CoastFoam board={view.board} />
            {landHexes.map((hex) => {
              if (hex.number === null) return null;
              const p = pointyHexToPixel(hex, HEX_SIZE);
              return (
                <NumberToken
                  key={`tok-${hex.id}`}
                  x={p.x}
                  y={p.y + 2}
                  value={hex.number}
                  texture={textures?.["/sprites/token.png"]}
                  hot={flash.has(hex.id)}
                />
              );
            })}
            {view.board.ports.map((port) => {
              const a = vertexPos(view.board, port.vertices[0]);
              const b = vertexPos(view.board, port.vertices[1]);
              const url = port.ratio === 3 ? "/sprites/port-any.png" : "/sprites/port-2.png";
              const tex = textures?.[url];
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              const ox = origin.x;
              const oy = origin.y;
              const outward = Math.hypot(mx - ox, my - oy) || 1;
              return (
                <pixiContainer key={port.edgeId} x={mx + ((mx - ox) / outward) * 22} y={my + ((my - oy) / outward) * 18}>
                  {tex ? <pixiSprite texture={tex} anchor={0.5} eventMode="none" /> : null}
                  <pixiText
                    text={port.ratio === 3 ? "3:1" : "2:1"}
                    y={16}
                    anchor={0.5}
                    eventMode="none"
                    style={{
                      fontFamily: "Pixelify Sans, monospace",
                      fontSize: 9,
                      fill: PALETTE.gold,
                      fontWeight: "700",
                    }}
                  />
                </pixiContainer>
              );
            })}
            {sortedEdges.map((edge) => {
              const a = vertexPos(view.board, edge.vertices[0]);
              const b = vertexPos(view.board, edge.vertices[1]);
              const owner = view.players.find((p) => p.id === edge.road);
              const hot = roadTargets.has(edge.id);
              const hovered = hover?.kind === "edge" && hover.id === edge.id;
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
                  {ghost || edge.road ? (
                    <DirtTrack
                      length={length}
                      color={color}
                      ghost={ghost}
                      hovered={hovered}
                    />
                  ) : null}
                </pixiContainer>
              );
            })}
            {sortedVertices.map((v) => {
              const p = vertexPos(view.board, v.id);
              const owner = v.building ? view.players.find((pl) => pl.id === v.building?.owner) : null;
              const hot = settleTargets.has(v.id) || cityTargets.has(v.id);
              const hovered = hover?.kind === "vertex" && hover.id === v.id;
              const ghost = hot && !v.building;
              const color = owner?.color ?? youColor;
              const kind = v.building?.type ?? (cityTargets.has(v.id) ? "city" : "settlement");
              const url = kind === "city" ? citySprite(color) : settlementSprite(color);
              const tex = textures?.[url];
              const ghostTex =
                textures?.[kind === "city" ? "/sprites/city-ghost.png" : "/sprites/settlement-ghost.png"];
              const born = pops[v.id];
              const age = born ? Math.min(1, (performance.now() - born) / 180) : 1;
              const popScale = born ? 0.7 + age * 0.3 : 1;
              return (
                <pixiContainer
                  key={v.id}
                  x={p.x}
                  y={p.y}
                  scale={hovered && ghost ? 1.06 : popScale * 0.82}
                  eventMode="none"
                >
                  {ghost || v.building ? <VertexPad /> : null}
                  {ghost ? <PulseDot /> : null}
                  {ghost && !hovered && ghostTex ? (
                    <pixiSprite
                      texture={ghostTex}
                      anchor={{ x: 0.5, y: 0.9 }}
                      scale={0.7}
                      alpha={0.55}
                      eventMode="none"
                    />
                  ) : null}
                  {((ghost && hovered) || v.building) && tex ? (
                    <pixiSprite texture={tex} anchor={{ x: 0.5, y: 0.9 }} eventMode="none" />
                  ) : null}
                </pixiContainer>
              );
            })}
            <RobberSprite x={robberPixel.x} y={robberPixel.y - 4} textures={textures} />
          </pixiContainer>
        </pixiContainer>
      </Application>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-14">
        <div className="wood-panel pointer-events-auto flex max-w-[min(100%,42rem)] items-center gap-2 px-3 py-1.5 text-[11px]">
          <span className="text-gold tracking-[0.2em] uppercase">Zoom</span>
          {[1, 2, 3].map((z) => (
            <button
              key={z}
              type="button"
              className={`pixel-btn min-w-8 px-2 py-0.5 ${zoom === z ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              onClick={() => {
                setZoom(z);
                if (z === 1) setPan({ x: 0, y: 0 });
              }}
            >
              {z}x
            </button>
          ))}
          <button type="button" className="pixel-btn bg-secondary px-2 py-0.5" onClick={() => setPan({ x: 0, y: 0 })}>
            Centrar
          </button>
          <span className="bg-gold/20 text-parchment ml-1 hidden truncate px-2 py-0.5 sm:inline">{hint}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4 md:bottom-5">
        <p className="wood-panel text-parchment max-w-[36rem] px-3 py-1.5 text-center text-xs">
          {phaseCopy(view.phase, yourTurn && interactive)}
        </p>
      </div>
      {!textures ? <TableLoading progress={progress} /> : null}
    </div>
  );
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
  if (settles) return "Os pontos dourados marcam onde fundar uma aldeia.";
  if (cities) return "Troque a aldeia por uma cidadela.";
  if (roads) return "Toque no rasto de terra junto da aldeia.";
  return "Arraste o mapa. A roda do rato aproxima.";
}

function RobberSprite({
  x,
  y,
  textures,
}: {
  x: number;
  y: number;
  textures: Record<string, Texture> | null;
}) {
  const [frame, setFrame] = useState(0);
  useTick(() => {
    setFrame(Math.floor(performance.now() / 380) % 2);
  });
  const tex = textures?.[`/sprites/robber-${frame}.png`];
  if (!tex) return null;
  return <pixiSprite texture={tex} x={x} y={y} anchor={{ x: 0.5, y: 0.85 }} eventMode="none" />;
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
}: {
  length: number;
  color: string;
  ghost: boolean;
  hovered: boolean;
}) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      const pad = 11;
      const L = Math.max(10, length - pad * 2);
      const steps = Math.max(4, Math.round(L / 6.5));
      g.clear();
      if (ghost) {
        const a = hovered ? 0.34 : 0.14;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const x = -L / 2 + u * L;
          const wobble = Math.sin(i * 1.7) * 0.35;
          g.ellipse(x, wobble, 4, hovered ? 1.6 : 1.25);
          g.fill({ color: 0x7a5a38, alpha: a });
        }
        if (hovered) {
          g.roundRect(-L / 2 + 3, -0.5, L - 6, 1, 0.5);
          g.fill({ color: PALETTE.gold, alpha: 0.28 });
        }
        return;
      }
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = -L / 2 + u * L;
        const wobble = Math.sin(i * 2.1) * 0.5;
        const taper = 1 - Math.abs(u - 0.5) * 0.32;
        g.ellipse(x, wobble + 0.35, 5.1 * taper, 2.15 * taper);
        g.fill({ color: 0x4a3424, alpha: 0.58 });
      }
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = -L / 2 + u * L;
        const wobble = Math.sin(i * 2.1 + 0.5) * 0.35;
        const taper = 1 - Math.abs(u - 0.5) * 0.28;
        g.ellipse(x, wobble, 3.4 * taper, 1.35 * taper);
        g.fill({ color: 0x9a7a4c, alpha: 0.72 });
      }
      g.roundRect(-L / 2 + 1, -0.7, L - 2, 1.4, 0.7);
      g.fill({ color: 0xb08a58, alpha: 0.4 });
      const mark = FACTION_HEX[color] ?? 0xe8e0d0;
      g.ellipse(0, 0.25, 1.7, 1);
      g.fill({ color: 0x3a2818, alpha: 0.75 });
      g.ellipse(0, 0.05, 1.15, 0.65);
      g.fill({ color: mark, alpha: 0.8 });
    },
    [length, color, ghost, hovered],
  );
  return <pixiGraphics draw={draw} />;
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
  hot,
}: {
  x: number;
  y: number;
  value: number;
  texture?: Texture;
  hot: boolean;
}) {
  const red = value === 6 || value === 8;
  return (
    <pixiContainer x={x} y={y} eventMode="none" scale={hot ? 1.08 : 1}>
      {texture ? (
        <pixiSprite texture={texture} anchor={0.5} scale={0.78} />
      ) : (
        <FallbackToken />
      )}
      <pixiText
        text={String(value)}
        anchor={0.5}
        y={1}
        style={{
          fontFamily: "Pixelify Sans, monospace",
          fontSize: red ? 12 : 11,
          fill: red ? PALETTE.brick : PALETTE.night,
          fontWeight: "700",
          stroke: { color: PALETTE.parchment, width: 3 },
        }}
      />
    </pixiContainer>
  );
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

function PulseDot() {
  const [t, setT] = useState(0);
  useTick(() => setT(performance.now()));
  const draw = useCallback(
    (g: PixiGraphics) => {
      const s = Math.sin(t / 220);
      g.clear();
      g.circle(0, 2, 5 + s * 1.2);
      g.fill({ color: PALETTE.gold, alpha: 0.28 + s * 0.14 });
      g.circle(0, 2, 3);
      g.fill({ color: PALETTE.parchment });
    },
    [t],
  );
  return <pixiGraphics draw={draw} />;
}

function RobberTarget() {
  const [t, setT] = useState(0);
  useTick(() => setT(performance.now()));
  const draw = useCallback(
    (g: PixiGraphics) => {
      const s = Math.sin(t / 240);
      g.clear();
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const c = hexCorner({ x: 0, y: 0 }, HEX_SIZE - 6 + s * 3, i);
        pts.push(c.x, c.y);
      }
      g.poly(pts);
      g.stroke({ width: 2, color: PALETTE.gold, alpha: 0.5 + s * 0.3 });
    },
    [t],
  );
  return <pixiGraphics draw={draw} />;
}

function HarvestGlow() {
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const c = hexCorner({ x: 0, y: 0 }, HEX_SIZE - 4, i);
      pts.push(c.x, c.y);
    }
    g.poly(pts);
    g.fill({ color: PALETTE.gold, alpha: 0.28 });
  }, []);
  return <pixiGraphics draw={draw} />;
}
