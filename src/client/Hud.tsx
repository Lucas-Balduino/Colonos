import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { RESOURCES, RESOURCE_LABEL, countResources, emptyResources } from "../core/index.ts";
import type { Action, PublicView, Resource, ResourceMap, TradeOffer } from "../core/types.ts";
import { CARD_SPRITE, CHIP_SPRITE, diceSprite, settlementSprite } from "./assets.ts";
import { sfx } from "./audio.ts";
import type { BuildMode } from "./copy.ts";
import type { EventBatch } from "./fx/batch.ts";
import { useHeldResources } from "./fx/held.ts";

export function Hud({
  view,
  onAction,
  interactive,
  pendingRobberHex = null,
  buildMode = null,
  onBuildMode,
  events,
}: {
  view: PublicView;
  onAction: (a: Action) => boolean | void;
  interactive: boolean;
  pendingRobberHex?: string | null;
  buildMode?: BuildMode | null;
  onBuildMode?: (mode: BuildMode) => void;
  events?: EventBatch;
}) {
  const you = view.players.find((p) => p.isYou);
  const yourTurn = Boolean(you && you.id === view.currentPlayerId);
  const legal = view.legal;
  const [discard, setDiscard] = useState<ResourceMap>(emptyResources());
  const [plentyOpen, setPlentyOpen] = useState(false);
  const [plentySlots, setPlentySlots] = useState<Array<Resource | null>>([null, null]);
  const [monopolyOpen, setMonopolyOpen] = useState(false);
  const shown = useHeldResources(you?.resources ?? emptyResources(), events, you?.id ?? null);

  const discardCount = countResources(discard);
  const discardNeed = useMemo(() => {
    if (view.phase.type !== "discard" || !you?.resources) return 0;
    const n = countResources(you.resources);
    return n > 7 ? Math.floor(n / 2) : 0;
  }, [view.phase, you]);

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
    <aside className="flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto p-3 md:w-[340px] md:shrink-0">
      <div className="wood-panel p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-gold text-[10px] tracking-[0.28em] uppercase">Ilha das Lanternas</p>
            <h2 className="text-xl leading-none">Colonos</h2>
          </div>
          <DicePair faces={view.dice ?? [1, 1]} rolling={false} empty={!view.dice} />
        </div>
        {view.winnerId ? (
          <p className="bg-primary text-primary-foreground mt-2 px-2 py-1 text-center text-xs">
            Vitória: {view.players.find((p) => p.id === view.winnerId)?.name}
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 text-center text-[11px]">Turno {view.turnNumber || 0}</p>
        )}
      </div>

      {view.phase.type === "main" && you ? (
        <TradePanel view={view} youId={you.id} resources={you.resources} legal={legal} onAction={act} />
      ) : null}

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

      <BuildPanel
        legal={legal}
        buildMode={buildMode}
        onBuildMode={onBuildMode}
        onBuy={(action) => act(action)}
      />

      {you?.resources ? (
        <div className="wood-panel p-3">
          <p className="mb-2 text-sm">Sua mão</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {RESOURCES.map((r) => {
              const n = shown[r];
              return (
                <button
                  key={r}
                  type="button"
                  className={`resource-card ${n === 0 ? "opacity-55" : ""}`}
                  onClick={() => {
                    if (discardNeed) tapDiscard(r);
                  }}
                >
                  <img src={CARD_SPRITE[r]} alt="" className="pixelated h-[4.6rem] w-[2.15rem] object-cover" />
                  <span className="resource-seal">{n}</span>
                  <span className="mt-1 text-[9px] leading-none uppercase">{RESOURCE_LABEL[r]}</span>
                  {you.bankRatios ? <span className="text-[9px] text-[#d4a017]">{you.bankRatios[r]}:1</span> : null}
                  {discardNeed ? <span className="text-[9px] text-[#8a6410]">-{discard[r]}</span> : null}
                </button>
              );
            })}
          </div>
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
          {you?.devCards?.some((c) => c.type === "yearOfPlenty") ? (
            <Button
              variant="outline"
              disabled={!legal.some((a) => a.type === "PLAY_YEAR_OF_PLENTY")}
              onClick={() => {
                setPlentySlots([null, null]);
                setPlentyOpen(true);
              }}
            >
              Jogar Fartura
            </Button>
          ) : null}
          {you?.devCards?.some((c) => c.type === "monopoly") ? (
            <Button
              variant="outline"
              disabled={!legal.some((a) => a.type === "PLAY_MONOPOLY")}
              onClick={() => setMonopolyOpen(true)}
            >
              Jogar Monopólio
            </Button>
          ) : null}
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

      {pendingRobberHex && yourTurn && you ? (
        <div className="flex flex-wrap gap-2">
          {legal
            .filter((a) => a.type === "MOVE_ROBBER" && a.hexId === pendingRobberHex && a.stealFrom)
            .map((a) =>
              a.type === "MOVE_ROBBER" && a.stealFrom ? (
                <Button key={a.stealFrom} onClick={() => act(a)}>
                  Roubar {view.players.find((p) => p.id === a.stealFrom)?.name} (
                  {view.players.find((p) => p.id === a.stealFrom)?.resourceCount ?? 0} cartas)
                </Button>
              ) : null,
            )}
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

      <Dialog open={plentyOpen} onOpenChange={setPlentyOpen}>
        <DialogContent className="border-[#8a6410] bg-[#3d2a1f] text-[#f4e8c8]">
          <DialogHeader>
            <DialogTitle>Ano da Fartura</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Escolha duas cartas do banco. Podem ser iguais.</p>
          <div className="flex gap-2">
            {plentySlots.map((slot, index) => (
              <button
                key={index}
                type="button"
                className="resource-card"
                onClick={() => setPlentySlots((prev) => prev.map((item, i) => (i === index ? null : item)))}
              >
                {slot ? <img src={CARD_SPRITE[slot]} alt="" className="pixelated h-16 w-8 object-cover" /> : <span>?</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {RESOURCES.map((r) => {
              const reserved = plentySlots.filter((slot) => slot === r).length;
              const disabled = view.bank[r] - reserved <= 0;
              return (
                <Button
                  key={r}
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    setPlentySlots((prev) => {
                      const empty = prev.indexOf(null);
                      if (empty < 0) return prev;
                      const next = [...prev];
                      next[empty] = r;
                      return next;
                    })
                  }
                >
                  {RESOURCE_LABEL[r]}
                </Button>
              );
            })}
          </div>
          <Button
            disabled={!plentyAction(legal, plentySlots)}
            onClick={() => {
              const action = plentyAction(legal, plentySlots);
              if (!action) return;
              act(action);
              setPlentyOpen(false);
            }}
          >
            Pegar
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={monopolyOpen} onOpenChange={setMonopolyOpen}>
        <DialogContent className="border-[#8a6410] bg-[#3d2a1f] text-[#f4e8c8]">
          <DialogHeader>
            <DialogTitle>Monopólio</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Escolha o recurso que todo mundo entrega.</p>
          <div className="flex flex-wrap gap-2">
            {RESOURCES.map((r) => (
              <Button
                key={r}
                variant="outline"
                onClick={() => {
                  const action = legal.find((a) => a.type === "PLAY_MONOPOLY" && a.resource === r);
                  if (!action) return;
                  act(action);
                  setMonopolyOpen(false);
                }}
              >
                {RESOURCE_LABEL[r]}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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

export function BuildPanel({
  legal,
  buildMode,
  onBuildMode,
  onBuy,
}: {
  legal: Action[];
  buildMode: BuildMode | null;
  onBuildMode?: (mode: BuildMode) => void;
  onBuy?: (action: Action) => void;
}) {
  return (
    <div className="wood-panel p-2">
      <p className="mb-1 text-[10px] tracking-[0.2em] uppercase text-[#d4a017]">Construir</p>
      <div className="grid grid-cols-2 gap-1">
        <BuildChoice
          label="Estrada"
          parts={["wood", "brick"]}
          enabled={legal.some((a) => a.type === "BUILD_ROAD")}
          pressed={buildMode === "road"}
          onClick={() => onBuildMode?.("road")}
        />
        <BuildChoice
          label="Aldeia"
          parts={["wood", "brick", "sheep", "wheat"]}
          enabled={legal.some((a) => a.type === "BUILD_SETTLEMENT")}
          pressed={buildMode === "settlement"}
          onClick={() => onBuildMode?.("settlement")}
        />
        <BuildChoice
          label="Cidade"
          parts={["wheat", "wheat", "ore", "ore", "ore"]}
          enabled={legal.some((a) => a.type === "BUILD_CITY")}
          pressed={buildMode === "city"}
          onClick={() => onBuildMode?.("city")}
        />
        <BuildChoice
          label="Carta"
          parts={["sheep", "wheat", "ore"]}
          enabled={legal.some((a) => a.type === "BUY_DEV")}
          pressed={false}
          onClick={() => {
            const buy = legal.find((a) => a.type === "BUY_DEV");
            if (buy) onBuy?.(buy);
          }}
        />
      </div>
    </div>
  );
}

export function ResourceStrip({
  resources,
  batch,
  viewerId = null,
}: {
  resources: ResourceMap;
  batch?: EventBatch;
  viewerId?: string | null;
}) {
  const shown = useHeldResources(resources, batch, viewerId);
  return (
    <div className="flex shrink-0 gap-0.5">
      {RESOURCES.map((r) => (
        <span key={r} className="grid w-7 place-items-center leading-none">
          <img src={CHIP_SPRITE[r]} alt={RESOURCE_LABEL[r]} className="pixelated size-5" />
          <span className="text-[10px]">{shown[r]}</span>
        </span>
      ))}
    </div>
  );
}

function BuildChoice({
  label,
  parts,
  enabled,
  pressed,
  onClick,
}: {
  label: string;
  parts: Resource[];
  enabled: boolean;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      aria-pressed={pressed}
      onClick={onClick}
      className={`pixel-btn flex items-center gap-1 px-1.5 py-1 text-left text-[11px] ${
        pressed ? "bg-primary text-primary-foreground" : "bg-secondary"
      } ${enabled ? "" : "opacity-40"}`}
    >
      <span className="shrink-0">{label}</span>
      <span className="flex gap-0.5">
        {parts.map((r, i) => (
          <img key={`${r}-${i}`} src={CHIP_SPRITE[r]} alt="" className="pixelated size-4" />
        ))}
      </span>
    </button>
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

function plentyAction(legal: Action[], slots: Array<Resource | null>): Action | null {
  const [a, b] = slots;
  if (!a || !b) return null;
  return (
    legal.find(
      (action) =>
        action.type === "PLAY_YEAR_OF_PLENTY" &&
        ((action.resources[0] === a && action.resources[1] === b) ||
          (action.resources[0] === b && action.resources[1] === a)),
    ) ?? null
  );
}

function TradePanel({
  view,
  youId,
  resources,
  legal,
  onAction,
}: {
  view: PublicView;
  youId: string;
  resources?: ResourceMap;
  legal: Action[];
  onAction: (action: Action) => void;
}) {
  const [tab, setTab] = useState<"mesa" | "banco">("mesa");
  const [give, setGive] = useState<ResourceMap>(emptyResources());
  const [want, setWant] = useState<ResourceMap>(emptyResources());
  const hand = resources ?? emptyResources();
  const yourTurn = view.currentPlayerId === youId && view.phase.type === "main";
  const emptySide = countResources(give) === 0 || countResources(want) === 0;
  const lacksCards = RESOURCES.some((resource) => give[resource] > hand[resource]);
  const you = view.players.find((player) => player.id === youId);

  return (
    <div id="trocar" className="wood-panel space-y-2 p-2">
      <div className="flex items-center gap-1">
        <p className="mr-auto text-[10px] tracking-[0.2em] text-[#d4a017] uppercase">Trocar</p>
        <button type="button" className={tradeTabClass(tab === "mesa")} onClick={() => setTab("mesa")}>
          Mesa
        </button>
        <button type="button" className={tradeTabClass(tab === "banco")} onClick={() => setTab("banco")}>
          Banco
        </button>
      </div>
      {tab === "mesa" ? (
        <>
          <TradeStepper label="Você dá" value={give} cap={hand} onChange={setGive} />
          <TradeStepper label="Você quer" value={want} onChange={setWant} />
          <Button
            className="h-8 w-full text-xs"
            disabled={!yourTurn || view.tradeOffers.length > 0 || emptySide || lacksCards}
            onClick={() => onAction({ type: "OFFER_TRADE", playerId: youId, give, want })}
          >
            Oferecer à mesa
          </Button>
          <OfferBoard view={view} youId={youId} onAction={onAction} />
        </>
      ) : (
        <div className="space-y-1">
          {RESOURCES.map((resource) => (
            <div key={resource} className="flex flex-wrap items-center gap-1">
              <span className="w-16 text-[10px] uppercase">{RESOURCE_LABEL[resource]}</span>
              <span className="text-[10px] text-[#d4a017]">{you?.bankRatios ? `${you.bankRatios[resource]}:1` : ""}</span>
              {legal
                .filter((action) => action.type === "TRADE_BANK" && action.give === resource)
                .map((action) =>
                  action.type === "TRADE_BANK" ? (
                    <Button key={action.take} size="sm" className="h-6 px-1 text-[10px]" onClick={() => onAction(action)}>
                      Por {RESOURCE_LABEL[action.take]}
                    </Button>
                  ) : null,
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useShownOffer(offer: TradeOffer | null): TradeOffer | null {
  const seen = useRef<TradeOffer | null>(null);
  const [linger, setLinger] = useState<TradeOffer | null>(null);
  useEffect(() => {
    if (offer) {
      seen.current = offer;
      return;
    }
    const prev = seen.current;
    if (!prev) return;
    seen.current = null;
    const pending = Object.entries(prev.responses).filter(([, response]) => response === "pending");
    const rejected = Object.values(prev.responses).filter((response) => response === "rejected").length;
    const accepted = Object.values(prev.responses).some((response) => response === "accepted");
    if (accepted || rejected === 0 || pending.length !== 1) return;
    const lastId = pending[0]?.[0];
    if (!lastId) return;
    setLinger({ ...prev, responses: { ...prev.responses, [lastId]: "rejected" } });
    const timer = window.setTimeout(() => setLinger(null), 1800);
    return () => window.clearTimeout(timer);
  }, [offer]);
  return offer ?? linger;
}

function OfferBoard({
  view,
  youId,
  onAction,
}: {
  view: PublicView;
  youId: string;
  onAction: (action: Action) => void;
}) {
  const offer = useShownOffer(view.tradeOffers[0] ?? null);
  if (!offer) return null;
  const offers = [offer];
  return (
    <ul className="space-y-1">
      {offers.map((offer) => {
        const owner = view.players.find((player) => player.id === offer.from);
        return (
          <li key={offer.id} className="space-y-1">
            <div>
              {owner?.name} oferece {fmt(offer.give)} por {fmt(offer.want)}
            </div>
            {view.players
              .filter((player) => player.id !== offer.from)
              .map((player) => {
                const response = offer.responses[player.id] ?? "pending";
                return (
                  <div key={player.id} data-trade-player={player.name}>
                    {player.name}:{" "}
                    {response === "accepted" ? (
                      <Button
                        size="sm"
                        className="h-6 px-1 text-[10px]"
                        onClick={() => onAction({ type: "ACCEPT_TRADE", playerId: player.id, offerId: offer.id })}
                      >
                        Fechar com {player.name}
                      </Button>
                    ) : response === "rejected" ? (
                      "recusou"
                    ) : player.id === youId ? (
                      <Button
                        size="sm"
                        className="h-6 px-1 text-[10px]"
                        onClick={() => onAction({ type: "ACCEPT_TRADE", playerId: youId, offerId: offer.id })}
                      >
                        Aceitar
                      </Button>
                    ) : (
                      "aguardando"
                    )}
                  </div>
                );
              })}
          </li>
        );
      })}
    </ul>
  );
}

function TradeStepper({
  label,
  value,
  onChange,
  cap,
}: {
  label: string;
  value: ResourceMap;
  onChange: (next: ResourceMap) => void;
  cap?: ResourceMap;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] tracking-wider uppercase">{label}</p>
      <div className="grid grid-cols-5 gap-0.5">
        {RESOURCES.map((resource) => {
          const max = cap ? cap[resource] : 8;
          return (
            <div key={resource} className="flex flex-col items-center gap-0.5">
              <img src={CHIP_SPRITE[resource]} alt="" className="pixelated size-4" />
              <span className="text-[11px] tabular-nums">{value[resource]}</span>
              <span className="flex">
                <button
                  type="button"
                  aria-label={`menos ${label} ${RESOURCE_LABEL[resource]}`}
                  className="pixel-btn bg-secondary px-1 text-[10px] leading-none"
                  disabled={value[resource] <= 0}
                  onClick={() => onChange({ ...value, [resource]: value[resource] - 1 })}
                >
                  -
                </button>
                <button
                  type="button"
                  aria-label={`mais ${label} ${RESOURCE_LABEL[resource]}`}
                  className="pixel-btn bg-secondary px-1 text-[10px] leading-none"
                  disabled={value[resource] >= max}
                  onClick={() => onChange({ ...value, [resource]: value[resource] + 1 })}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tradeTabClass(active: boolean): string {
  return `pixel-btn px-2 py-0.5 text-[11px] ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`;
}

function fmt(m: ResourceMap): string {
  return RESOURCES.filter((r) => m[r] > 0)
    .map((r) => `${m[r]} ${RESOURCE_LABEL[r].toLowerCase()}`)
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
