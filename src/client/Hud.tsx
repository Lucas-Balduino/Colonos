import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { RESOURCES, RESOURCE_LABEL, COSTS, countResources, emptyResources } from "../core/index.ts";
import type { Action, PublicView, Resource, ResourceMap } from "../core/types.ts";
import { CARD_SPRITE, CHIP_SPRITE, diceSprite, settlementSprite } from "./assets.ts";
import { sfx } from "./audio.ts";
import { phaseCopy } from "./copy.ts";

export function Hud({
  view,
  onAction,
  interactive,
}: {
  view: PublicView;
  onAction: (a: Action) => boolean | void;
  interactive: boolean;
}) {
  const you = view.players.find((p) => p.isYou);
  const yourTurn = Boolean(you && you.id === view.currentPlayerId);
  const legal = view.legal;
  const [give, setGive] = useState<Resource | null>(null);
  const [discard, setDiscard] = useState<ResourceMap>(emptyResources());
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState<[number, number]>(view.dice ?? [1, 1]);
  const prevDice = useRef(view.dice);
  const prevWinner = useRef(view.winnerId);

  const discardCount = countResources(discard);
  const discardNeed = useMemo(() => {
    if (view.phase.type !== "discard" || !you?.resources) return 0;
    const n = countResources(you.resources);
    return n > 7 ? Math.floor(n / 2) : 0;
  }, [view.phase, you]);

  useEffect(() => {
    if (!view.dice || view.dice === prevDice.current) {
      if (view.dice) setFaces(view.dice);
      return;
    }
    prevDice.current = view.dice;
    setRolling(true);
    sfx("dice");
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      if (n >= 10) {
        window.clearInterval(id);
        setFaces(view.dice!);
        setRolling(false);
      }
    }, 45);
    return () => window.clearInterval(id);
  }, [view.dice]);

  useEffect(() => {
    if (view.winnerId && view.winnerId !== prevWinner.current) sfx("win");
    prevWinner.current = view.winnerId;
  }, [view.winnerId]);

  const tapDiscard = (r: Resource) => {
    if (!you?.resources) return;
    const next = { ...discard };
    if (next[r] < you.resources[r]) next[r] += 1;
    else next[r] = 0;
    setDiscard(next);
  };

  const act = (a: Action) => {
    sfx("click");
    onAction(a);
  };

  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const others = view.players.filter((p) => p.id !== view.currentPlayerId);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden p-3 md:w-[340px] md:shrink-0">
      <div className="wood-panel p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-gold text-[10px] tracking-[0.28em] uppercase">Ilha das Lanternas</p>
            <h2 className="text-xl leading-none">Colonos</h2>
          </div>
          <DicePair faces={faces} rolling={rolling} empty={!view.dice && !rolling} />
        </div>
        <p className="gold-ribbon mt-3 px-2 py-1 text-center text-xs">
          {phaseCopy(view.phase, yourTurn && interactive)}
        </p>
        {view.winnerId ? (
          <p className="bg-primary text-primary-foreground mt-2 px-2 py-1 text-center text-xs">
            Vitória: {view.players.find((p) => p.id === view.winnerId)?.name}
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 text-center text-[11px]">Turno {view.turnNumber || 0}</p>
        )}
      </div>

      {current ? (
        <PlayerPlaque
          name={`${current.name}${current.isYou ? " (você)" : current.isBot ? " · bot" : ""}`}
          color={current.color}
          vp={current.publicVp}
          cards={current.resourceCount}
          settlements={current.settlementCount}
          cities={current.cityCount}
          knights={current.knightsPlayed}
          active
          winner={current.id === view.winnerId}
          longest={view.longestRoadPlayerId === current.id}
          army={view.largestArmyPlayerId === current.id}
          featured
        />
      ) : null}

      <div className="flex flex-col gap-1">
        {others.map((p) => (
          <PlayerPlaque
            key={p.id}
            name={`${p.name}${p.isYou ? " (você)" : p.isBot ? " · bot" : ""}`}
            color={p.color}
            vp={p.publicVp}
            cards={p.resourceCount}
            settlements={p.settlementCount}
            cities={p.cityCount}
            knights={p.knightsPlayed}
            active={false}
            winner={p.id === view.winnerId}
            longest={view.longestRoadPlayerId === p.id}
            army={view.largestArmyPlayerId === p.id}
          />
        ))}
      </div>

      {you?.resources ? (
        <div className="wood-panel p-3">
          <p className="mb-2 text-sm">Sua mão</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {RESOURCES.map((r) => {
              const n = you.resources![r];
              const selected = give === r;
              const inCost =
                (view.phase.type === "main" && yourTurn && (COSTS.road[r] || COSTS.settlement[r] || COSTS.city[r])) ??
                false;
              return (
                <button
                  key={r}
                  type="button"
                  className={`resource-card ${selected ? "resource-card-on" : ""} ${n === 0 ? "opacity-55" : ""}`}
                  onClick={() => {
                    if (discardNeed) tapDiscard(r);
                    else setGive(give === r ? null : r);
                  }}
                >
                  <img src={CARD_SPRITE[r]} alt="" className="pixelated h-[4.6rem] w-[2.15rem] object-cover" />
                  <span className="resource-seal">{n}</span>
                  <span className="mt-1 text-[9px] leading-none uppercase">{RESOURCE_LABEL[r]}</span>
                  {discardNeed ? <span className="text-[9px] text-[#8a6410]">-{discard[r]}</span> : null}
                  {inCost && n > 0 ? <span className="sr-only">usado nas construções</span> : null}
                </button>
              );
            })}
          </div>
          {yourTurn && view.phase.type === "main" ? (
            <div className="mt-3 space-y-1 text-[10px]">
              <CostRow label="Estrada" parts={["wood", "brick"]} hand={you.resources} />
              <CostRow label="Aldeia" parts={["wood", "brick", "sheep", "wheat"]} hand={you.resources} />
              <CostRow label="Cidade" parts={["wheat", "wheat", "ore", "ore", "ore"]} hand={you.resources} />
            </div>
          ) : null}
          {give ? (
            <p className="text-gold mt-2 text-[10px]">Toque de novo para cancelar. Ofereça {RESOURCE_LABEL[give]} ao banco.</p>
          ) : (
            <p className="text-muted-foreground mt-2 text-[10px]">Toque numa carta para negociar com o banco.</p>
          )}
        </div>
      ) : null}

      {you?.devCards && you.devCards.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {you.devCards.map((c, i) => (
            <span
              key={`${c.type}-${i}`}
              className={`pixel-btn inline-flex items-center gap-1 px-2 py-1 text-[11px] ${c.playable ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
            >
              <img src={CARD_SPRITE[c.type]} alt="" className="pixelated h-6 w-4" />
              {devLabel(c.type)}
              {!c.playable ? " (nova)" : ""}
            </span>
          ))}
        </div>
      ) : null}

      {interactive ? (
        <div className="flex flex-wrap gap-2">
          {legal.some((a) => a.type === "ROLL") ? (
            <Button className="h-11 flex-1" onClick={() => act({ type: "ROLL", playerId: you!.id })}>
              Rolar dados
            </Button>
          ) : null}
          {legal.some((a) => a.type === "BUY_DEV") ? (
            <Button variant="secondary" onClick={() => act({ type: "BUY_DEV", playerId: you!.id })}>
              Comprar carta
            </Button>
          ) : null}
          {legal.some((a) => a.type === "PLAY_KNIGHT") ? (
            <Button variant="outline" onClick={() => act({ type: "PLAY_KNIGHT", playerId: you!.id })}>
              Cavaleiro
            </Button>
          ) : null}
          {legal.some((a) => a.type === "PLAY_ROAD_BUILDING") ? (
            <Button variant="outline" onClick={() => act({ type: "PLAY_ROAD_BUILDING", playerId: you!.id })}>
              2 estradas
            </Button>
          ) : null}
          {legal.some((a) => a.type === "PLAY_MONOPOLY")
            ? RESOURCES.map((r) => (
                <Button key={r} size="sm" variant="outline" onClick={() => act({ type: "PLAY_MONOPOLY", playerId: you!.id, resource: r })}>
                  Monopólio {RESOURCE_LABEL[r]}
                </Button>
              ))
            : null}
          {legal
            .filter((a) => a.type === "PLAY_YEAR_OF_PLENTY")
            .slice(0, 5)
            .map((a, i) =>
              a.type === "PLAY_YEAR_OF_PLENTY" ? (
                <Button key={i} size="sm" variant="outline" onClick={() => act(a)}>
                  Fartura {RESOURCE_LABEL[a.resources[0]]}+{RESOURCE_LABEL[a.resources[1]]}
                </Button>
              ) : null,
            )}
          {legal.some((a) => a.type === "END_TURN") ? (
            <Button variant="secondary" className="flex-1" onClick={() => act({ type: "END_TURN", playerId: you!.id })}>
              Encerrar turno
            </Button>
          ) : null}
        </div>
      ) : null}

      {discardNeed > 0 && you ? (
        <div className="wood-panel p-3 text-sm">
          <p className="mb-2">Descarte {discardNeed} cartas ({discardCount} escolhidas).</p>
          <Button
            disabled={discardCount !== discardNeed}
            onClick={() => {
              act({ type: "DISCARD", playerId: you.id, resources: discard });
              setDiscard(emptyResources());
            }}
          >
            Confirmar descarte
          </Button>
        </div>
      ) : null}

      {view.phase.type === "steal" && yourTurn && you ? (
        <div className="flex flex-wrap gap-2">
          {legal
            .filter((a) => a.type === "STEAL")
            .map((a) =>
              a.type === "STEAL" ? (
                <Button key={a.from} onClick={() => act(a)}>
                  Roubar {view.players.find((p) => p.id === a.from)?.name}
                </Button>
              ) : null,
            )}
        </div>
      ) : null}

      {yourTurn && view.phase.type === "main" && you && give ? (
        <div className="wood-panel p-3 text-xs">
          <p className="mb-1">Banco: oferecer {RESOURCE_LABEL[give]}</p>
          <div className="flex flex-wrap gap-1">
            {legal
              .filter((a) => a.type === "TRADE_BANK" && a.give === give)
              .map((a) =>
                a.type === "TRADE_BANK" ? (
                  <Button key={a.take} size="sm" onClick={() => act(a)}>
                    Por {RESOURCE_LABEL[a.take]}
                  </Button>
                ) : null,
              )}
          </div>
        </div>
      ) : null}

      {view.tradeOffers.length > 0 ? (
        <div className="space-y-1 text-xs">
          {view.tradeOffers.map((o) => (
            <div key={o.id} className="wood-panel flex items-center justify-between gap-2 px-2 py-1">
              <span>
                {view.players.find((p) => p.id === o.from)?.name} oferece {fmt(o.give)} por {fmt(o.want)}
              </span>
              {you && o.from !== you.id ? (
                <Button size="sm" onClick={() => act({ type: "ACCEPT_TRADE", playerId: you.id, offerId: o.id })}>
                  Aceitar
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="parchment-log min-h-24 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <ul className="space-y-1 p-2 text-[11px] text-[#3d2a1f]">
            {[...view.log].reverse().map((e, i) => (
              <li key={`${e.text}-${i}`}>{e.text}</li>
            ))}
          </ul>
        </ScrollArea>
      </div>
    </aside>
  );
}

function CostRow({
  label,
  parts,
  hand,
}: {
  label: string;
  parts: Resource[];
  hand: ResourceMap;
}) {
  const need: ResourceMap = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  for (const r of parts) need[r] += 1;
  const ok = RESOURCES.every((r) => hand[r] >= need[r]);
  return (
    <div className={`flex items-center gap-1 ${ok ? "text-gold" : "text-muted-foreground"}`}>
      <span className="w-12 shrink-0">{label}</span>
      {parts.map((r, i) => (
        <img
          key={`${r}-${i}`}
          src={CHIP_SPRITE[r]}
          alt={RESOURCE_LABEL[r]}
          className={`pixelated size-5 rounded-full ${hand[r] >= 1 ? "" : "opacity-35"}`}
        />
      ))}
      {ok ? <span className="ml-1">pronta</span> : null}
    </div>
  );
}

function PlayerPlaque({
  name,
  color,
  vp,
  cards,
  settlements,
  cities,
  knights,
  active,
  winner,
  longest,
  army,
  featured,
}: {
  name: string;
  color: string;
  vp: number;
  cards: number;
  settlements: number;
  cities: number;
  knights: number;
  active: boolean;
  winner: boolean;
  longest: boolean;
  army: boolean;
  featured?: boolean;
}) {
  return (
    <div
      className={`wood-panel px-2 py-1.5 text-xs ${active ? "ring-2 ring-[#d4a017]" : "opacity-75"} ${winner ? "bg-[#8a6410]" : ""}`}
      style={{ borderColor: color }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold" style={{ color }}>
          <img src={settlementSprite(color)} alt="" className="pixelated h-5 w-5 shrink-0" />
          <span className="truncate">{name}</span>
        </span>
        <span className="text-gold shrink-0">{vp} PV</span>
      </div>
      {featured ? (
        <div className="text-muted-foreground mt-1 flex justify-between">
          <span>{cards} cartas</span>
          <span>
            {settlements} aldeias · {cities} cidades · {knights} cav.
          </span>
        </div>
      ) : (
        <div className="text-muted-foreground mt-0.5 flex justify-between">
          <span>{cards}c</span>
          <span>
            {settlements}A {cities}C {knights}K
          </span>
        </div>
      )}
      {longest ? <span className="text-[10px] text-[#d4a017]">Maior estrada</span> : null}
      {army ? <span className="text-[10px] text-[#d4a017]"> Maior exército</span> : null}
    </div>
  );
}

function DicePair({
  faces,
  rolling,
  empty,
}: {
  faces: [number, number];
  rolling: boolean;
  empty: boolean;
}) {
  if (empty) return <span className="text-muted-foreground text-xs">Dados</span>;
  return (
    <div className={`flex items-center gap-1 ${rolling ? "animate-pulse" : ""}`}>
      <img src={diceSprite(faces[0])} alt="" className="pixelated size-10" />
      <img src={diceSprite(faces[1])} alt="" className="pixelated size-10" />
      <span className="text-gold text-sm">{faces[0] + faces[1]}</span>
    </div>
  );
}

function fmt(m: ResourceMap): string {
  return RESOURCES.filter((r) => m[r] > 0)
    .map((r) => `${m[r]} ${RESOURCE_LABEL[r]}`)
    .join(", ");
}

function devLabel(t: string): string {
  switch (t) {
    case "knight":
      return "Cavaleiro";
    case "victory":
      return "Ponto";
    case "roadBuilding":
      return "Estradas";
    case "yearOfPlenty":
      return "Fartura";
    case "monopoly":
      return "Monopólio";
    default:
      return t;
  }
}
