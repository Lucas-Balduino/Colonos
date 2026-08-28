import { useCallback, useMemo, useRef } from "react";
import { Application, extend } from "@pixi/react";
import { Container, Graphics, Text } from "pixi.js";
import type { FederatedPointerEvent, Graphics as PixiGraphics } from "pixi.js";
import { hexCorner, pointyHexToPixel } from "../core/hex.ts";
import type { Action, Board, PublicView } from "../core/types.ts";

extend({ Container, Graphics, Text });

const SIZE = 36;
const TERRAIN: Record<string, number> = {
  wood: 0x2f6b32,
  brick: 0xb24a32,
  sheep: 0x6db35c,
  wheat: 0xd4a017,
  ore: 0x5c6573,
  desert: 0xc2a366,
};

function vertexPos(board: Board, vid: string): { x: number; y: number } {
  for (const h of Object.values(board.hexes)) {
    const idx = h.vertices.indexOf(vid);
    if (idx >= 0) {
      const c = pointyHexToPixel(h, SIZE);
      return hexCorner(c, SIZE, idx);
    }
  }
  return { x: 0, y: 0 };
}

export function BoardView({
  view,
  onAction,
  interactive,
}: {
  view: PublicView;
  onAction: (a: Action) => void;
  interactive: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const you = view.you;
  const legal = view.legal;

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
      const p = pointyHexToPixel(h, SIZE);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }, [view.board]);

  const drawSea = useCallback((g: PixiGraphics) => {
    g.clear();
    g.rect(-2000, -2000, 4000, 4000);
    g.fill({ color: 0x102433 });
    for (let i = 0; i < 80; i++) {
      const x = ((i * 97) % 900) - 450;
      const y = ((i * 53) % 700) - 350;
      g.rect(x, y, 3, 3);
      g.fill({ color: 0x1b3a4d });
    }
  }, []);

  const clickVertex = (vid: string) => {
    if (!you || !interactive) return;
    const city = legal.find((a) => a.type === "BUILD_CITY" && a.vertexId === vid);
    if (city) return onAction(city);
    const s =
      legal.find((a) => a.type === "PLACE_SETTLEMENT" && a.vertexId === vid) ??
      legal.find((a) => a.type === "BUILD_SETTLEMENT" && a.vertexId === vid);
    if (s) onAction(s);
  };

  const clickEdge = (eid: string) => {
    if (!you || !interactive) return;
    const a =
      legal.find((x) => x.type === "PLACE_ROAD" && x.edgeId === eid) ??
      legal.find((x) => x.type === "BUILD_ROAD" && x.edgeId === eid);
    if (a) onAction(a);
  };

  const clickHex = (hid: string) => {
    if (!interactive) return;
    const a = robberTargets.get(hid);
    if (a) onAction(a);
  };

  return (
    <div ref={host} className="relative h-full min-h-[420px] w-full overflow-hidden bg-[#102433]">
      <Application
        resizeTo={host}
        background={0x102433}
        antialias={false}
        roundPixels
        preference="webgl"
      >
        <pixiContainer x={420} y={300} scale={1.05}>
          <pixiGraphics draw={drawSea} />
          <pixiContainer x={-origin.x} y={-origin.y}>
            {Object.values(view.board.hexes).map((hex) => {
              const p = pointyHexToPixel(hex, SIZE);
              const robber = view.board.robberHexId === hex.id;
              const canRob = robberTargets.has(hex.id);
              return (
                <HexSprite
                  key={hex.id}
                  x={p.x}
                  y={p.y}
                  terrain={hex.terrain}
                  number={hex.number}
                  robber={robber}
                  highlight={canRob}
                  onClick={() => clickHex(hex.id)}
                />
              );
            })}
            {Object.values(view.board.edges).map((edge) => {
              const a = vertexPos(view.board, edge.vertices[0]);
              const b = vertexPos(view.board, edge.vertices[1]);
              const owner = view.players.find((p) => p.id === edge.road);
              const hot = roadTargets.has(edge.id);
              return (
                <EdgeSprite
                  key={edge.id}
                  ax={a.x}
                  ay={a.y}
                  bx={b.x}
                  by={b.y}
                  color={owner?.color ?? (hot ? "#d4a017" : "#3a2f22")}
                  hot={hot}
                  built={Boolean(edge.road)}
                  onClick={() => clickEdge(edge.id)}
                />
              );
            })}
            {view.board.ports.map((port) => {
              const a = vertexPos(view.board, port.vertices[0]);
              const b = vertexPos(view.board, port.vertices[1]);
              return (
                <PortMark
                  key={port.edgeId}
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2}
                  label={port.ratio === 3 ? "3:1" : `2:1 ${port.resource}`}
                />
              );
            })}
            {Object.values(view.board.vertices).map((v) => {
              const p = vertexPos(view.board, v.id);
              const owner = v.building ? view.players.find((pl) => pl.id === v.building?.owner) : null;
              const hot = settleTargets.has(v.id) || cityTargets.has(v.id);
              return (
                <VertexSprite
                  key={v.id}
                  x={p.x}
                  y={p.y}
                  building={v.building?.type ?? null}
                  color={owner?.color ?? "#f4e8c8"}
                  hot={hot}
                  onClick={() => clickVertex(v.id)}
                />
              );
            })}
          </pixiContainer>
        </pixiContainer>
      </Application>
    </div>
  );
}

function HexSprite({
  x,
  y,
  terrain,
  number,
  robber,
  highlight,
  onClick,
}: {
  x: number;
  y: number;
  terrain: string;
  number: number | null;
  robber: boolean;
  highlight: boolean;
  onClick: () => void;
}) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const c = hexCorner({ x: 0, y: 0 }, SIZE - 1, i);
        pts.push(Math.round(c.x), Math.round(c.y));
      }
      g.poly(pts);
      g.fill({ color: TERRAIN[terrain] ?? 0x444444 });
      g.stroke({ width: 2, color: highlight ? 0xf2d46c : 0x1a1520 });
      if (robber) {
        g.rect(-6, -10, 12, 16);
        g.fill({ color: 0x1a1520 });
        g.rect(-4, -12, 8, 6);
        g.fill({ color: 0x3a3044 });
      }
    },
    [terrain, robber, highlight],
  );
  const tap = (_e: FederatedPointerEvent) => onClick();
  return (
    <pixiContainer x={x} y={y} eventMode="static" cursor={highlight ? "pointer" : "default"} onPointerTap={tap}>
      <pixiGraphics draw={draw} />
      {number !== null ? (
        <pixiText
          text={String(number)}
          x={-8}
          y={-10}
          style={{
            fontFamily: "monospace",
            fontSize: 14,
            fill: number === 6 || number === 8 ? 0x8b1e1e : 0x1a1520,
            fontWeight: "700",
          }}
        />
      ) : null}
    </pixiContainer>
  );
}

function EdgeSprite({
  ax,
  ay,
  bx,
  by,
  color,
  hot,
  built,
  onClick,
}: {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  color: string;
  hot: boolean;
  built: boolean;
  onClick: () => void;
}) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke({ width: built ? 5 : hot ? 4 : 2, color: Number(color.replace("#", "0x")) || 0x3a2f22 });
    },
    [ax, ay, bx, by, color, hot, built],
  );
  return (
    <pixiGraphics
      draw={draw}
      eventMode="static"
      cursor={hot ? "pointer" : "default"}
      onPointerTap={onClick}
    />
  );
}

function VertexSprite({
  x,
  y,
  building,
  color,
  hot,
  onClick,
}: {
  x: number;
  y: number;
  building: "settlement" | "city" | null;
  color: string;
  hot: boolean;
  onClick: () => void;
}) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const c = Number(color.replace("#", "0x")) || 0xf4e8c8;
      if (building === "city") {
        g.rect(-7, -7, 14, 14);
        g.fill({ color: c });
        g.rect(-7, -11, 6, 5);
        g.fill({ color: c });
        g.stroke({ width: 1, color: 0x1a1520 });
      } else if (building === "settlement") {
        g.poly([-6, 4, 0, -8, 6, 4, 6, 7, -6, 7]);
        g.fill({ color: c });
        g.stroke({ width: 1, color: 0x1a1520 });
      } else if (hot) {
        g.rect(-4, -4, 8, 8);
        g.fill({ color: 0xf4e8c8 });
        g.stroke({ width: 1, color: 0xd4a017 });
      } else {
        g.rect(-2, -2, 4, 4);
        g.fill({ color: 0x5c4a32 });
      }
    },
    [building, color, hot],
  );
  return (
    <pixiGraphics
      x={x}
      y={y}
      draw={draw}
      eventMode="static"
      cursor={hot || building ? "pointer" : "default"}
      onPointerTap={onClick}
    />
  );
}

function PortMark({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <pixiText
      text={label}
      x={x - 10}
      y={y - 18}
      style={{ fontFamily: "monospace", fontSize: 8, fill: 0x9ad1e5 }}
    />
  );
}
