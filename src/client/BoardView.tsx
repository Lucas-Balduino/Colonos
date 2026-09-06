import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Application, extend, useTick } from "@pixi/react";
import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import type { Graphics as PixiGraphics } from "pixi.js";
import { toast } from "sonner";
import { cubeDistance, hexCorner, hexId, parseHexId, pointyHexToPixel } from "../core/hex.ts";
import type { Action, Board, HexId, PublicView } from "../core/types.ts";
import { BOARD_URLS, citySprite, HEX_SIZE, roadSprite, settlementSprite, TERRAIN_SPRITE } from "./assets.ts";
import { sfx } from "./audio.ts";
import { PALETTE } from "./theme.ts";

extend({ Container, Graphics, Sprite, Text });

const VERTEX_HIT = new Rectangle(-14, -16, 28, 32);
const EDGE_HIT = new Rectangle(-18, -8, 36, 16);

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
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      if (cubeDistance({ q, r }) === 3) out.push({ q, r });
    }
  }
  return out;
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
  useEffect(() => {
    let live = true;
    Assets.load(BOARD_URLS).then((loaded) => {
      if (!live) return;
      const next: Record<string, Texture> = {};
      for (const url of BOARD_URLS) {
        const tex = (loaded as Record<string, Texture>)[url];
        if (tex) {
          tex.source.scaleMode = "nearest";
          next[url] = tex;
        }
      }
      setMap(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return map;
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
  const textures = useTextures();
  const you = view.you;
  const legal = view.legal;
  const [zoom, setZoom] = useState(2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 640, h: 480 });
  const [shakeUntil, setShakeUntil] = useState(0);
  const [nudge, setNudge] = useState(0);
  const [hover, setHover] = useState<{ kind: "hex" | "vertex" | "edge"; id: string } | null>(null);
  const [robberPos, setRobberPos] = useState(view.board.robberHexId);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [pops, setPops] = useState<Record<string, number>>({});
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
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
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
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
    const t = window.setTimeout(() => setFlash(new Set()), 520);
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

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(1, z + (e.deltaY < 0 ? 1 : -1))));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 4) return;
    setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const youColor = view.players.find((p) => p.id === you)?.color ?? "#e8e0d0";
  const robberHex = view.board.hexes[robberPos] ?? view.board.hexes[view.board.robberHexId];
  const robberPixel = robberHex ? pointyHexToPixel(robberHex, HEX_SIZE) : { x: 0, y: 0 };

  return (
    <div
      ref={host}
      className="relative h-full min-h-[420px] w-full touch-none overflow-hidden bg-[#16344a]"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Application resizeTo={host} background={PALETTE.sea} antialias={false} roundPixels preference="webgl">
        <pixiContainer x={size.w / 2 + pan.x + nudge} y={size.h / 2 + pan.y} scale={zoom}>
          <pixiContainer x={-origin.x} y={-origin.y}>
            {seaRing().map((h) => {
              const p = pointyHexToPixel(h, HEX_SIZE);
              const tex = textures?.["/sprites/hex-sea.png"];
              return tex ? (
                <pixiSprite key={`sea-${h.q},${h.r}`} texture={tex} x={p.x} y={p.y} anchor={0.5} eventMode="none" />
              ) : null;
            })}
            {Object.values(view.board.hexes).map((hex) => {
              const p = pointyHexToPixel(hex, HEX_SIZE);
              const url = TERRAIN_SPRITE[hex.terrain];
              const tex = url ? textures?.[url] : undefined;
              const canRob = robberTargets.has(hex.id);
              const lit = flash.has(hex.id);
              return (
                <pixiContainer
                  key={hex.id}
                  x={p.x}
                  y={p.y}
                  eventMode={canRob ? "static" : "none"}
                  cursor={canRob ? "pointer" : "default"}
                  onPointerTap={() => clickHex(hex.id)}
                  onPointerOver={() => canRob && setHover({ kind: "hex", id: hex.id })}
                  onPointerOut={() => setHover((h) => (h?.id === hex.id ? null : h))}
                >
                  {tex ? <pixiSprite texture={tex} anchor={0.5} eventMode="none" /> : <FallbackHex terrain={hex.terrain} />}
                  {hex.number !== null ? <NumberToken value={hex.number} /> : null}
                  {lit ? <FlashRing /> : null}
                  {canRob ? <PulseRing /> : null}
                </pixiContainer>
              );
            })}
            {view.board.ports.map((port) => {
              const a = vertexPos(view.board, port.vertices[0]);
              const b = vertexPos(view.board, port.vertices[1]);
              const url = port.ratio === 3 ? "/sprites/port-any.png" : "/sprites/port-2.png";
              const tex = textures?.[url];
              return tex ? (
                <pixiSprite
                  key={port.edgeId}
                  texture={tex}
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2}
                  anchor={0.5}
                  eventMode="none"
                />
              ) : null;
            })}
            {Object.values(view.board.edges).map((edge) => {
              const a = vertexPos(view.board, edge.vertices[0]);
              const b = vertexPos(view.board, edge.vertices[1]);
              const owner = view.players.find((p) => p.id === edge.road);
              const hot = roadTargets.has(edge.id);
              const hovered = hover?.kind === "edge" && hover.id === edge.id;
              const ghost = hot && !edge.road;
              const show = Boolean(edge.road) || ghost;
              const color = owner?.color ?? youColor;
              const tex = textures?.[roadSprite(color)];
              const ang = Math.atan2(b.y - a.y, b.x - a.x);
              return (
                <pixiContainer
                  key={edge.id}
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2}
                  rotation={ang}
                  eventMode="static"
                  cursor={hot ? "pointer" : "default"}
                  hitArea={EDGE_HIT}
                  onPointerTap={() => clickEdge(edge.id)}
                  onPointerOver={() => setHover({ kind: "edge", id: edge.id })}
                  onPointerOut={() => setHover((h) => (h?.id === edge.id ? null : h))}
                >
                  {ghost ? <PulseRoad /> : null}
                  {show && tex ? (
                    <pixiSprite
                      texture={tex}
                      anchor={0.5}
                      alpha={edge.road ? 1 : hovered ? 0.9 : 0.45}
                      eventMode="none"
                    />
                  ) : null}
                </pixiContainer>
              );
            })}
            {Object.values(view.board.vertices).map((v) => {
              const p = vertexPos(view.board, v.id);
              const owner = v.building ? view.players.find((pl) => pl.id === v.building?.owner) : null;
              const hot = settleTargets.has(v.id) || cityTargets.has(v.id);
              const hovered = hover?.kind === "vertex" && hover.id === v.id;
              const ghost = hot && !v.building;
              const color = owner?.color ?? youColor;
              const kind = v.building?.type ?? (cityTargets.has(v.id) ? "city" : "settlement");
              const url = kind === "city" ? citySprite(color) : settlementSprite(color);
              const tex = textures?.[url];
              const born = pops[v.id];
              const age = born ? Math.min(1, (performance.now() - born) / 180) : 1;
              const popScale = born ? 0.7 + age * 0.3 : 1;
              const visible = Boolean(v.building) || ghost;
              return (
                <pixiContainer
                  key={v.id}
                  x={p.x}
                  y={p.y}
                  scale={hovered && ghost ? 1.1 : popScale}
                  eventMode="static"
                  cursor={hot || v.building ? "pointer" : "default"}
                  hitArea={VERTEX_HIT}
                  onPointerTap={() => clickVertex(v.id)}
                  onPointerOver={() => setHover({ kind: "vertex", id: v.id })}
                  onPointerOut={() => setHover((h) => (h?.id === v.id ? null : h))}
                >
                  {ghost ? <PulseDot /> : null}
                  {visible && tex ? (
                    <pixiSprite
                      texture={tex}
                      anchor={0.5}
                      alpha={v.building ? 1 : hovered ? 0.95 : 0.5}
                      eventMode="none"
                    />
                  ) : null}
                </pixiContainer>
              );
            })}
            <RobberSprite x={robberPixel.x} y={robberPixel.y - 6} textures={textures} />
          </pixiContainer>
        </pixiContainer>
      </Application>
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <div className="wood-panel pointer-events-auto flex items-center gap-1 px-2 py-1 text-[11px]">
          <span className="text-muted-foreground px-1">Zoom</span>
          {[1, 2, 3].map((z) => (
            <button
              key={z}
              type="button"
              className={`pixel-btn min-w-8 px-2 py-0.5 ${zoom === z ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              onClick={() => {
                setZoom(z);
                if (z === 2) setPan({ x: 0, y: 0 });
              }}
            >
              {z}x
            </button>
          ))}
          <button type="button" className="pixel-btn bg-secondary px-2 py-0.5" onClick={() => setPan({ x: 0, y: 0 })}>
            Centrar
          </button>
        </div>
      </div>
    </div>
  );
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
  return <pixiSprite texture={tex} x={x} y={y} anchor={0.5} eventMode="none" />;
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
      g.stroke({ width: 2, color: PALETTE.night });
    },
    [terrain],
  );
  return <pixiGraphics draw={draw} />;
}

function NumberToken({ value }: { value: number }) {
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    g.circle(0, 0, 10);
    g.fill({ color: PALETTE.parchment });
    g.stroke({ width: 1, color: PALETTE.goldDark });
  }, []);
  return (
    <pixiContainer>
      <pixiGraphics draw={draw} />
      <pixiText
        text={String(value)}
        anchor={0.5}
        y={1}
        style={{
          fontFamily: "Pixelify Sans, monospace",
          fontSize: 11,
          fill: value === 6 || value === 8 ? PALETTE.brick : PALETTE.night,
          fontWeight: "700",
        }}
      />
    </pixiContainer>
  );
}

function PulseRing() {
  const [t, setT] = useState(0);
  useTick(() => setT(performance.now()));
  const draw = useCallback(
    (g: PixiGraphics) => {
      const s = Math.sin(t / 240);
      g.clear();
      g.circle(0, 0, 14 + s * 3);
      g.stroke({ width: 2, color: PALETTE.gold, alpha: 0.45 + s * 0.25 });
    },
    [t],
  );
  return <pixiGraphics draw={draw} />;
}

function PulseDot() {
  const [t, setT] = useState(0);
  useTick(() => setT(performance.now()));
  const draw = useCallback(
    (g: PixiGraphics) => {
      const s = Math.sin(t / 220);
      g.clear();
      g.rect(-4, -4, 8, 8);
      g.fill({ color: PALETTE.parchment, alpha: 0.45 + s * 0.3 });
      g.stroke({ width: 1, color: PALETTE.gold });
    },
    [t],
  );
  return <pixiGraphics draw={draw} />;
}

function PulseRoad() {
  const [t, setT] = useState(0);
  useTick(() => setT(performance.now()));
  const draw = useCallback(
    (g: PixiGraphics) => {
      const s = Math.sin(t / 220);
      g.clear();
      g.rect(-14, -3, 28, 6);
      g.fill({ color: PALETTE.gold, alpha: 0.35 + s * 0.25 });
    },
    [t],
  );
  return <pixiGraphics draw={draw} />;
}

function FlashRing() {
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    g.circle(0, 0, 22);
    g.fill({ color: PALETTE.gold, alpha: 0.28 });
  }, []);
  return <pixiGraphics draw={draw} />;
}
