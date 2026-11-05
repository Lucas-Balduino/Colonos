import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Graphics as PixiGraphics, Texture } from "pixi.js";
import { hexCorner, pointyHexToPixel } from "../../core/hex.ts";
import type { Board, GameEvent, PublicView } from "../../core/types.ts";
import { CHIP_SPRITE, HEX_SIZE } from "../assets.ts";
import { sfx, type Sfx } from "../audio.ts";
import { animFrameNow, useAnimFrame } from "../anim-clock.tsx";
import { FACTION_HEX, PALETTE } from "../theme.ts";
import { eventDuration, holdFx, type EventBatch } from "./batch.ts";

function vertexPos(board: Board, vid: string): { x: number; y: number } | null {
  for (const hex of Object.values(board.hexes)) {
    const idx = hex.vertices.indexOf(vid);
    if (idx >= 0) {
      const center = pointyHexToPixel(hex, HEX_SIZE);
      return hexCorner(center, HEX_SIZE, idx);
    }
  }
  return null;
}

function housePoint(board: Board, playerId: string, remembered: string | undefined, preferHex?: string) {
  if (preferHex) {
    const hex = board.hexes[preferHex];
    if (hex) {
      for (const vid of hex.vertices) {
        if (board.vertices[vid]?.building?.owner === playerId) {
          const point = vertexPos(board, vid);
          if (point) return point;
        }
      }
    }
  }
  if (remembered) {
    const point = vertexPos(board, remembered);
    if (point && board.vertices[remembered]?.building?.owner === playerId) return point;
  }
  for (const vertex of Object.values(board.vertices)) {
    if (vertex.building?.owner === playerId) {
      const point = vertexPos(board, vertex.id);
      if (point) return point;
    }
  }
  return null;
}

function soundOf(event: GameEvent): Sfx | null {
  switch (event.type) {
    case "rolled":
      return "dice";
    case "built":
    case "robberMoved":
      return "place";
    case "won":
      return "win";
    case "produced":
    case "stole":
    case "discarded":
    case "tradedBank":
    case "tradedPlayers":
    case "devBought":
    case "devPlayed":
    case "award":
      return "click";
    default:
      return null;
  }
}

interface LiveFx {
  key: string;
  start: number;
  event: GameEvent;
}

export function FxLayer({
  batch,
  board,
  textures,
  players,
}: {
  batch: EventBatch;
  board: Board;
  textures: Record<string, Texture> | null;
  players: PublicView["players"];
}) {
  const [live, setLive] = useState<LiveFx[]>([]);
  const seen = useRef(0);
  const houses = useRef<Record<string, string>>({});

  useLayoutEffect(() => {
    if (batch.seq === 0 || batch.seq === seen.current) return;
    seen.current = batch.seq;
    const start = animFrameNow();
    let max = 0;
    const born: LiveFx[] = [];
    batch.events.forEach((event, index) => {
      max = Math.max(max, eventDuration(event));
      const kind = soundOf(event);
      if (kind) sfx(kind);
      if (event.type === "built" && (event.kind === "settlement" || event.kind === "city")) {
        houses.current[event.playerId] = event.id;
      }
      const visible =
        event.type === "produced" ||
        (event.type === "stole" && event.resource !== null) ||
        (event.type === "award" && event.playerId !== null);
      if (visible) born.push({ key: `${batch.seq}-${index}`, start, event });
    });
    if (max > 0) holdFx(max);
    if (born.length) setLive((prev) => [...prev, ...born]);
  }, [batch]);

  const drop = useCallback((key: string) => {
    setLive((prev) => (prev.some((item) => item.key === key) ? prev.filter((item) => item.key !== key) : prev));
  }, []);

  if (live.length === 0) return null;
  return (
    <>
      {live.map((item) => (
        <FxSprite
          key={item.key}
          item={item}
          board={board}
          textures={textures}
          players={players}
          houses={houses.current}
          onDone={drop}
        />
      ))}
    </>
  );
}

function FxSprite({
  item,
  board,
  textures,
  players,
  houses,
  onDone,
}: {
  item: LiveFx;
  board: Board;
  textures: Record<string, Texture> | null;
  players: PublicView["players"];
  houses: Record<string, string>;
  onDone: (key: string) => void;
}) {
  const frame = useAnimFrame();
  const elapsed = Math.max(0, (frame - item.start) * 83);
  const duration = eventDuration(item.event);
  const done = elapsed >= duration;

  useLayoutEffect(() => {
    if (done) onDone(item.key);
  }, [done, item.key, onDone]);

  if (done) return null;
  if (item.event.type === "produced") {
    return <FlyingChip event={item.event} elapsed={elapsed} duration={duration} board={board} textures={textures} />;
  }
  if (item.event.type === "stole") {
    return <StolenCard event={item.event} elapsed={elapsed} duration={duration} board={board} houses={houses} />;
  }
  if (item.event.type === "award" && item.event.playerId) {
    return (
      <AwardPennant
        playerId={item.event.playerId}
        elapsed={elapsed}
        board={board}
        players={players}
        houses={houses}
      />
    );
  }
  return null;
}

function FlyingChip({
  event,
  elapsed,
  duration,
  board,
  textures,
}: {
  event: Extract<GameEvent, { type: "produced" }>;
  elapsed: number;
  duration: number;
  board: Board;
  textures: Record<string, Texture> | null;
}) {
  const hex = board.hexes[event.hexId];
  const target = vertexPos(board, event.vertexId);
  const texture = textures?.[CHIP_SPRITE[event.resource]];
  if (!hex || !target || !texture) return null;
  const from = pointyHexToPixel(hex, HEX_SIZE);
  const riseMs = Math.min(83, duration);
  const rise = Math.min(1, elapsed / riseMs);
  let x = from.x;
  let y = from.y - 6 * rise;
  if (elapsed > riseMs && duration > riseMs) {
    const travel = Math.min(1, (elapsed - riseMs) / (duration - riseMs));
    x = from.x + (target.x - from.x) * travel;
    y = from.y - 6 + (target.y - (from.y - 6)) * travel;
  }
  return (
    <pixiSprite
      texture={texture}
      x={Math.round(x)}
      y={Math.round(y)}
      anchor={0.5}
      eventMode="none"
    />
  );
}

function StolenCard({
  event,
  elapsed,
  duration,
  board,
  houses,
}: {
  event: Extract<GameEvent, { type: "stole" }>;
  elapsed: number;
  duration: number;
  board: Board;
  houses: Record<string, string>;
}) {
  const from = housePoint(board, event.victim, undefined, board.robberHexId);
  const to = housePoint(board, event.thief, houses[event.thief]);
  if (!from || !to) return null;
  const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
  const x = Math.round(from.x + (to.x - from.x) * t);
  const y = Math.round(from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 10);
  return <CardBack x={x} y={y} />;
}

function CardBack({ x, y }: { x: number; y: number }) {
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    g.rect(-3, -4, 6, 8);
    g.fill({ color: PALETTE.parchment });
    g.stroke({ width: 1, color: PALETTE.goldDark });
  }, []);
  return <pixiGraphics x={x} y={y} draw={draw} eventMode="none" />;
}

function AwardPennant({
  playerId,
  elapsed,
  board,
  players,
  houses,
}: {
  playerId: string;
  elapsed: number;
  board: Board;
  players: PublicView["players"];
  houses: Record<string, string>;
}) {
  const point = housePoint(board, playerId, houses[playerId]);
  if (!point) return null;
  const step = Math.min(2, Math.floor(elapsed / 83));
  const color = FACTION_HEX[players.find((player) => player.id === playerId)?.color ?? ""] ?? 0xc44536;
  return <Pennant x={Math.round(point.x)} y={Math.round(point.y)} step={step} color={color} />;
}

function Pennant({ x, y, step, color }: { x: number; y: number; step: number; color: number }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const pole = -14;
      g.moveTo(0, -4);
      g.lineTo(0, pole);
      g.stroke({ width: 1, color: 0x3a2818 });
      const lift = step * 2;
      g.poly([0, pole - lift, 8, pole + 3 - lift, 0, pole + 6 - lift]);
      g.fill({ color });
    },
    [step, color],
  );
  return <pixiGraphics x={x} y={y} draw={draw} eventMode="none" />;
}
