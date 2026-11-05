import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { RESOURCES, RESOURCE_LABEL, countResources, emptyResources } from "../core/index.ts";
import type { Action, DevCardType, Presence, PublicPlayerView, PublicView, Resource, ResourceMap, TradeOffer } from "../core/types.ts";
import { CARD_SPRITE, CHIP_SPRITE, diceSprite, settlementSprite } from "./assets.ts";
import { sfx } from "./audio.ts";
import type { BuildMode } from "./copy.ts";
import type { EventBatch } from "./fx/batch.ts";
import { useHeldResources } from "./fx/held.ts";
import { HowToPlay } from "./HowToPlay.tsx";

/**
 * The table tray. A scrolling middle (players, hand, cards, build, log) and a
 * fixed bottom with whatever needs an answer now (offers, discard, robbery)
 * above the turn buttons. Nothing important ever scrolls out of view.
 */
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
  const legal = view.legal;
  const [discard, setDiscard] = useState<ResourceMap>(emptyResources());
  const [tradeOpen, setTradeOpen] = useState(false);
  const [plentyOpen, setPlentyOpen] = useState(false);
  const [monopolyOpen, setMonopolyOpen] = useState(false);
  const shown = useHeldResources(you?.resources ?? emptyResources(), events, you?.id ?? null);

  const discarding = view.phase.type === "discard" && view.phase.queue[0] === you?.id;
  const discardNeed = discarding && you?.resources ? Math.floor(countResources(you.resources) / 2) : 0;

  useEffect(() => {
    if (!discarding) setDiscard(emptyResources());
  }, [discarding]);

  const act = (a: Action) => {
    sfx("click");
    return onAction(a);
  };

  const tapCard = (r: Resource) => {
    if (!discardNeed || !you?.resources) return;
    const owned = you.resources[r];
    setDiscard((prev) => {
      const next = { ...prev };
      const room = discardNeed - countResources(prev);
      if (next[r] < owned && room > 0) next[r] += 1;
      else next[r] = 0;
      return next;
    });
  };

  const canTrade = interactive && legal.some((a) => a.type === "END_TURN");

  return (
    <aside className="flex h-full min-h-0 w-full flex-col md:w-[352px] md:shrink-0">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 pb-2">
        <TableHeader view={view} />
        <PlayerList view={view} />
        {you?.resources ? (
          <HandPanel hand={shown} ratios={you.bankRatios} discard={discardNeed ? discard : null} onTap={tapCard} />
        ) : null}
        {you?.devCards && you.devCards.length > 0 ? (
          <DevCards
            cards={you.devCards}
            legal={legal}
            interactive={interactive}
            onPlay={(type) => {
              if (type === "yearOfPlenty") setPlentyOpen(true);
              else if (type === "monopoly") setMonopolyOpen(true);
              else {
                const a = legal.find((x) => x.type === (type === "knight" ? "PLAY_KNIGHT" : "PLAY_ROAD_BUILDING"));
                if (a) act(a);
              }
            }}
          />
        ) : null}
        <BuildPanel legal={legal} buildMode={buildMode} onBuildMode={onBuildMode} onBuy={(a) => act(a)} />
        <GameLog view={view} />
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t-4 border-[#8a6410] bg-[#2a1c16] p-3">
        <OfferPanel view={view} youId={you?.id ?? null} onAction={act} />
        {discardNeed > 0 && you ? (
          <DiscardPanel
            need={discardNeed}
            chosen={discard}
            onClear={() => setDiscard(emptyResources())}
            onConfirm={() => {
              act({ type: "DISCARD", playerId: you.id, resources: discard });
              setDiscard(emptyResources());
            }}
          />
        ) : null}
        <RobberyPanel view={view} pendingRobberHex={pendingRobberHex} onAction={act} />
        <TurnButtons view={view} interactive={interactive} canTrade={canTrade} onTrade={() => setTradeOpen(true)} onAction={act} />
      </div>

      {you ? (
        <>
          <TradeDialog open={tradeOpen} onOpenChange={setTradeOpen} view={view} you={you} onAction={act} />
          <PlentyDialog open={plentyOpen} onOpenChange={setPlentyOpen} view={view} onAction={act} />
          <MonopolyDialog open={monopolyOpen} onOpenChange={setMonopolyOpen} legal={legal} onAction={act} />
        </>
      ) : null}
    </aside>
  );
}

// ---------- header and players ----------

function TableHeader({ view }: { view: PublicView }) {
  return (
    <div className="wood-panel flex items-center justify-between gap-2 px-3 py-2">
      <div>
        <p className="text-gold text-[10px] tracking-[0.24em] uppercase">Ilha das Lanternas</p>
        <p className="text-muted-foreground text-[11px]">{view.turnNumber > 0 ? `Rodada ${view.turnNumber}` : "Fundação"}</p>
      </div>
      <div className="flex items-center gap-2">
        <DicePair dice={view.dice} />
        <HowToPlay />
      </div>
    </div>
  );
}

function DicePair({ dice }: { dice: [number, number] | null }) {
  if (!dice) return <span className="text-muted-foreground text-[11px]">sem dados</span>;
  const total = dice[0] + dice[1];
  return (
    <div className="flex items-center gap-1" aria-label={`Dados: ${total}`}>
      <img src={diceSprite(dice[0])} alt="" className="pixelated size-9" />
      <img src={diceSprite(dice[1])} alt="" className="pixelated size-9" />
      <span className={`w-6 text-center text-lg leading-none ${total === 7 ? "text-[#e05a4a]" : "text-gold"}`}>{total}</span>
    </div>
  );
}

function PlayerList({ view }: { view: PublicView }) {
  return (
    <div className="flex flex-col gap-2">
      {view.players.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          current={p.id === view.currentPlayerId && view.phase.type !== "gameOver"}
          winner={p.id === view.winnerId}
          longest={view.longestRoadPlayerId === p.id}
          army={view.largestArmyPlayerId === p.id}
          presence={view.presence?.[p.id]}
        />
      ))}
    </div>
  );
}

function PlayerRow({
  player,
  current,
  winner,
  longest,
  army,
  presence,
}: {
  player: PublicPlayerView;
  current: boolean;
  winner: boolean;
  longest: boolean;
  army: boolean;
  presence?: Presence;
}) {
  const nameColor = player.color === "#e8e0d0" ? "#f4e8c8" : player.color;
  return (
    <div
      className={`wood-panel flex items-center gap-2 px-2 py-1.5 ${current ? "" : "opacity-80"}`}
      style={{ borderColor: current || winner ? "#d4a017" : player.color }}
    >
      <span className="grid size-8 shrink-0 place-items-center" style={{ background: `${player.color}33` }}>
        <img src={settlementSprite(player.color)} alt="" className="pixelated size-7" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm leading-tight">
          <span className="truncate font-semibold" style={{ color: nameColor }}>
            {player.isYou ? "Você" : player.name}
          </span>
          {player.isBot ? <span className="text-muted-foreground text-[10px]">bot</span> : null}
          {presence === "away" ? <span className="text-[10px] text-[#e0b33a]">reconectando…</span> : null}
          {presence === "autopilot" ? <span className="text-[10px] text-[#e0b33a]">bot no lugar</span> : null}
          {current ? <span className="gold-ribbon px-1 text-[9px] leading-tight">VEZ</span> : null}
        </p>
        <p className="text-muted-foreground flex flex-wrap gap-x-2 text-[11px] leading-tight">
          <span>
            {player.resourceCount} {player.resourceCount === 1 ? "carta" : "cartas"}
          </span>
          <span>{player.devCount} desenv.</span>
          <span className={army ? "text-[#e0b33a]" : undefined}>{player.knightsPlayed} cav.</span>
          <span className={longest ? "text-[#e0b33a]" : undefined} title="Estrada contínua mais longa. Com 5 ou mais, vale a maior estrada.">
            estrada {player.roadLength}
          </span>
        </p>
        {longest || army ? (
          <p className="text-[10px] leading-tight text-[#e0b33a]">
            {[longest ? "Maior estrada +2" : null, army ? "Maior exército +2" : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-gold text-xl leading-none">{player.publicVp}</p>
        <p className="text-muted-foreground text-[9px] uppercase">pontos</p>
      </div>
    </div>
  );
}

// ---------- hand and cards ----------

function HandPanel({
  hand,
  ratios,
  discard,
  onTap,
}: {
  hand: ResourceMap;
  ratios?: Record<Resource, 2 | 3 | 4>;
  discard: ResourceMap | null;
  onTap: (r: Resource) => void;
}) {
  const total = countResources(hand);
  return (
    <div className="wood-panel grass-lip p-2 pt-3">
      <p className="mb-1.5 flex justify-between text-xs">
        <span>Sua mão</span>
        <span className={total > 7 ? "text-[#e05a4a]" : "text-muted-foreground"}>
          {total} {total === 1 ? "carta" : "cartas"}
          {total > 7 ? " · risco no 7" : ""}
        </span>
      </p>
      {ratios && RESOURCES.some((r) => ratios[r] === 3) ? (
        <p className="mb-1 text-[10px] text-[#9ad1e5]">Porto 3:1: troque 3 cartas iguais por 1 no banco.</p>
      ) : null}
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map((r) => {
          const n = hand[r];
          const picked = discard?.[r] ?? 0;
          const port = ratios && ratios[r] === 2 ? 2 : null;
          return (
            <button
              key={r}
              type="button"
              disabled={!discard}
              onClick={() => onTap(r)}
              className={`hand-card ${n === 0 ? "opacity-40" : ""} ${picked ? "hand-card-on" : ""} ${discard ? "cursor-pointer" : "cursor-default"}`}
              aria-label={`${n} ${RESOURCE_LABEL[r]}`}
            >
              <span className="relative">
                <img src={CARD_SPRITE[r]} alt="" className="pixelated h-[68px] w-12" />
                <span className="resource-seal">{n}</span>
              </span>
              <span className="mt-1 text-[9px] leading-none uppercase">{RESOURCE_LABEL[r]}</span>
              {port ? <span className="mt-0.5 bg-[#16344a] px-1 text-[9px] text-[#9ad1e5]">porto {port}:1</span> : null}
              {picked ? <span className="absolute inset-x-0 top-6 text-center text-sm font-bold text-[#c44536]">-{picked}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const DEV_INFO: Record<DevCardType, { name: string; hint: string }> = {
  knight: { name: "Cavaleiro", hint: "Move o ladrão e rouba uma carta." },
  victory: { name: "Ponto de vitória", hint: "Vale 1 ponto. Fica oculto." },
  roadBuilding: { name: "Estradas", hint: "Duas estradas grátis." },
  yearOfPlenty: { name: "Fartura", hint: "Duas cartas do banco." },
  monopoly: { name: "Monopólio", hint: "Todos entregam um recurso." },
};

const DEV_ACTION: Partial<Record<DevCardType, Action["type"]>> = {
  knight: "PLAY_KNIGHT",
  roadBuilding: "PLAY_ROAD_BUILDING",
  yearOfPlenty: "PLAY_YEAR_OF_PLENTY",
  monopoly: "PLAY_MONOPOLY",
};

function DevCards({
  cards,
  legal,
  interactive,
  onPlay,
}: {
  cards: Array<{ type: DevCardType; playable: boolean }>;
  legal: Action[];
  interactive: boolean;
  onPlay: (type: DevCardType) => void;
}) {
  const groups = new Map<DevCardType, { total: number; ready: number }>();
  for (const c of cards) {
    const g = groups.get(c.type) ?? { total: 0, ready: 0 };
    g.total += 1;
    if (c.playable) g.ready += 1;
    groups.set(c.type, g);
  }
  return (
    <div className="wood-panel grass-lip p-2 pt-3">
      <p className="mb-1.5 text-xs">Cartas de desenvolvimento</p>
      <div className="flex flex-col gap-1">
        {[...groups.entries()].map(([type, g]) => {
          const actionType = DEV_ACTION[type];
          const can = interactive && actionType ? legal.some((a) => a.type === actionType) : false;
          const note =
            type === "victory"
              ? "conta no fim"
              : g.ready === 0
                ? "nova: jogue no próximo turno"
                : can
                  ? "toque para jogar"
                  : "1 carta por turno, na sua vez";
          return (
            <button
              key={type}
              type="button"
              disabled={!can}
              onClick={() => onPlay(type)}
              className={`pixel-btn flex items-center gap-2 px-2 py-1 text-left ${can ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              title={DEV_INFO[type].hint}
            >
              <img src={CARD_SPRITE[type]} alt="" className="pixelated h-[34px] w-6" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-tight">
                  {DEV_INFO[type].name}
                  {g.total > 1 ? ` ×${g.total}` : ""}
                </span>
                <span className={`block text-[10px] leading-tight ${can ? "" : "text-muted-foreground"}`}>{note}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
    <div className="wood-panel grass-lip p-2 pt-3">
      <p className="mb-1.5 text-xs">Construir</p>
      <div className="grid grid-cols-2 gap-1">
        <BuildChoice
          label="Estrada"
          points="0 pt"
          parts={["wood", "brick"]}
          enabled={legal.some((a) => a.type === "BUILD_ROAD")}
          pressed={buildMode === "road"}
          onClick={() => onBuildMode?.("road")}
        />
        <BuildChoice
          label="Aldeia"
          points="1 pt"
          parts={["wood", "brick", "sheep", "wheat"]}
          enabled={legal.some((a) => a.type === "BUILD_SETTLEMENT")}
          pressed={buildMode === "settlement"}
          onClick={() => onBuildMode?.("settlement")}
        />
        <BuildChoice
          label="Cidade"
          points="2 pt"
          parts={["wheat", "wheat", "ore", "ore", "ore"]}
          enabled={legal.some((a) => a.type === "BUILD_CITY")}
          pressed={buildMode === "city"}
          onClick={() => onBuildMode?.("city")}
        />
        <BuildChoice
          label="Carta"
          points="?"
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

function BuildChoice({
  label,
  points,
  parts,
  enabled,
  pressed,
  onClick,
}: {
  label: string;
  points: string;
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
      className={`pixel-btn flex flex-col gap-0.5 px-1.5 py-1 text-left ${
        pressed ? "bg-primary text-primary-foreground" : enabled ? "bg-[#4a5a2a]" : "bg-secondary opacity-55"
      }`}
    >
      <span className="flex justify-between text-xs leading-tight">
        <span>{label}</span>
        <span className="text-[10px] opacity-75">{points}</span>
      </span>
      <span className="flex gap-0.5">
        {parts.map((r, i) => (
          <img key={`${r}-${i}`} src={CHIP_SPRITE[r]} alt={RESOURCE_LABEL[r]} className="pixelated size-4" />
        ))}
      </span>
    </button>
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
          <img src={CHIP_SPRITE[r]} alt={RESOURCE_LABEL[r]} className="pixelated size-4" />
          <span className="text-[11px]">{shown[r]}</span>
        </span>
      ))}
    </div>
  );
}

function GameLog({ view }: { view: PublicView }) {
  const lines = [...view.log].reverse().slice(0, 40);
  return (
    <div className="parchment-log min-h-28 flex-1 overflow-hidden">
      <ul className="h-full space-y-0.5 overflow-y-auto p-2 text-[11px] text-[#3d2a1f]">
        {lines.map((e, i) => {
          const color = view.players.find((p) => p.id === e.playerId)?.color;
          return (
            <li key={`${view.log.length - i}-${e.text}`} className={i === 0 ? "font-bold" : ""}>
              {color ? <span className="mr-1 inline-block size-2" style={{ background: color }} /> : null}
              {e.text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- the bottom band ----------

function TurnButtons({
  view,
  interactive,
  canTrade,
  onTrade,
  onAction,
}: {
  view: PublicView;
  interactive: boolean;
  canTrade: boolean;
  onTrade: () => void;
  onAction: (a: Action) => boolean | void;
}) {
  const roll = view.legal.find((a) => a.type === "ROLL");
  const end = view.legal.find((a) => a.type === "END_TURN");
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  if (view.phase.type === "gameOver") {
    const winner = view.players.find((p) => p.id === view.winnerId);
    return (
      <p className="gold-ribbon px-2 py-2 text-center text-sm">{winner?.isYou ? "Você venceu!" : `${winner?.name} venceu.`}</p>
    );
  }
  if (!interactive || (!roll && !end)) {
    return (
      <p className="text-muted-foreground py-1 text-center text-xs">
        {current?.isYou ? "Siga a instrução no mapa." : `Vez de ${current?.name ?? "outro jogador"}…`}
      </p>
    );
  }
  return (
    <div className="flex gap-2">
      {end ? (
        <Button variant="secondary" className="h-11 flex-1" disabled={!canTrade} onClick={onTrade}>
          Trocar
        </Button>
      ) : null}
      {roll ? (
        <Button className="h-11 flex-[2] text-base" onClick={() => onAction(roll)}>
          Rolar dados
        </Button>
      ) : null}
      {end ? (
        <Button className="h-11 flex-[2]" onClick={() => onAction(end)}>
          Encerrar turno
        </Button>
      ) : null}
    </div>
  );
}

export function OfferPanel({
  view,
  youId,
  onAction,
}: {
  view: PublicView;
  youId: string | null;
  onAction: (a: Action) => boolean | void;
}) {
  const offer = useLingeringOffer(view.tradeOffers[0] ?? null);
  if (!offer || !youId) return null;
  const owner = view.players.find((p) => p.id === offer.from);
  const mine = offer.from === youId;
  const myAnswer = offer.responses[youId];
  const canAccept = view.legal.some((a) => a.type === "ACCEPT_TRADE" && a.offerId === offer.id);
  const live = view.tradeOffers.some((o) => o.id === offer.id);

  return (
    <div className="parchment-log p-2 text-xs text-[#2a1c12]">
      <p className="mb-1">
        <b>{mine ? "Sua oferta" : `${owner?.name} oferece`}</b>
      </p>
      <OfferLine give={offer.give} want={offer.want} mine={mine} />
      {mine ? (
        <div className="mt-1.5 space-y-1">
          {view.players
            .filter((p) => p.id !== youId)
            .map((p) => {
              const r = offer.responses[p.id] ?? "pending";
              const confirm = view.legal.find((a) => a.type === "CONFIRM_TRADE" && a.offerId === offer.id && a.with === p.id);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span>{p.name}</span>
                  {confirm && live ? (
                    <Button size="xs" onClick={() => onAction(confirm)}>
                      Fechar com {p.name}
                    </Button>
                  ) : (
                    <span className={r === "rejected" ? "text-[#a03a2c]" : "text-[#6a5a40]"}>
                      {r === "rejected" ? "recusou" : r === "accepted" ? "topou" : "pensando…"}
                    </span>
                  )}
                </div>
              );
            })}
          {live ? (
            <Button
              size="xs"
              variant="secondary"
              className="w-full"
              onClick={() => onAction({ type: "CANCEL_TRADE", playerId: youId, offerId: offer.id })}
            >
              Retirar oferta
            </Button>
          ) : (
            <p className="text-center text-[#a03a2c]">Ninguém topou.</p>
          )}
        </div>
      ) : myAnswer === "pending" && live ? (
        <div className="mt-1.5 flex gap-1">
          <Button
            size="xs"
            className="flex-1"
            disabled={!canAccept}
            onClick={() => onAction({ type: "ACCEPT_TRADE", playerId: youId, offerId: offer.id })}
          >
            {canAccept ? "Topar" : "Faltam cartas"}
          </Button>
          <Button
            size="xs"
            variant="secondary"
            className="flex-1"
            onClick={() => onAction({ type: "REJECT_TRADE", playerId: youId, offerId: offer.id })}
          >
            Recusar
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-[#6a5a40]">
          {myAnswer === "accepted" ? `Você topou. ${owner?.name} decide se fecha.` : "Você recusou."}
        </p>
      )}
    </div>
  );
}

function OfferLine({ give, want, mine }: { give: ResourceMap; want: ResourceMap; mine: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <ChipList map={give} />
      <span className="text-[10px]">{mine ? "por" : "em troca de"}</span>
      <ChipList map={want} />
    </div>
  );
}

function ChipList({ map }: { map: ResourceMap }) {
  return (
    <span className="flex flex-wrap items-center gap-0.5">
      {RESOURCES.filter((r) => map[r] > 0).map((r) => (
        <span key={r} className="flex items-center gap-0.5 bg-[#e8d9a8] px-1">
          <b>{map[r]}</b>
          <img src={CHIP_SPRITE[r]} alt={RESOURCE_LABEL[r]} className="pixelated size-4" />
        </span>
      ))}
    </span>
  );
}

/** Keeps an offer nobody took on screen briefly, so people see how it ended. */
function useLingeringOffer(offer: TradeOffer | null): TradeOffer | null {
  const last = useRef<TradeOffer | null>(null);
  const [linger, setLinger] = useState<TradeOffer | null>(null);
  useEffect(() => {
    if (offer) {
      last.current = offer;
      setLinger(null);
      return;
    }
    const prev = last.current;
    last.current = null;
    if (!prev) return;
    const nobody = Object.values(prev.responses).every((r) => r !== "accepted");
    if (!nobody) return;
    setLinger({ ...prev, responses: Object.fromEntries(Object.keys(prev.responses).map((k) => [k, "rejected"])) });
    const timer = window.setTimeout(() => setLinger(null), 1600);
    return () => window.clearTimeout(timer);
  }, [offer]);
  return offer ?? linger;
}

function DiscardPanel({
  need,
  chosen,
  onClear,
  onConfirm,
}: {
  need: number;
  chosen: ResourceMap;
  onClear: () => void;
  onConfirm: () => void;
}) {
  const n = countResources(chosen);
  return (
    <div className="parchment-log p-2 text-xs text-[#2a1c12]">
      <p>
        <b>Saiu 7.</b> Escolha {need} {need === 1 ? "carta" : "cartas"} para devolver: toque nas cartas da sua mão.
      </p>
      <div className="mt-1.5 flex items-center gap-1">
        <ChipList map={chosen} />
        <span className="ml-auto">
          {n}/{need}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1">
        <Button size="xs" variant="secondary" onClick={onClear} disabled={n === 0}>
          Limpar
        </Button>
        <Button size="xs" className="flex-1" disabled={n !== need} onClick={onConfirm}>
          Devolver {need}
        </Button>
      </div>
    </div>
  );
}

function RobberyPanel({
  view,
  pendingRobberHex,
  onAction,
}: {
  view: PublicView;
  pendingRobberHex: string | null;
  onAction: (a: Action) => boolean | void;
}) {
  const picks: Action[] =
    view.phase.type === "steal"
      ? view.legal.filter((a) => a.type === "STEAL")
      : pendingRobberHex
        ? view.legal.filter((a) => a.type === "MOVE_ROBBER" && a.hexId === pendingRobberHex && a.stealFrom)
        : [];
  if (picks.length === 0) return null;
  return (
    <div className="parchment-log p-2 text-xs text-[#2a1c12]">
      <p className="mb-1">
        <b>De quem roubar?</b> Uma carta ao acaso.
      </p>
      <div className="flex flex-wrap gap-1">
        {picks.map((a) => {
          const id = a.type === "STEAL" ? a.from : a.type === "MOVE_ROBBER" ? a.stealFrom : undefined;
          const p = view.players.find((x) => x.id === id);
          return (
            <Button key={id} size="xs" onClick={() => onAction(a)} style={{ background: p?.color, color: "#1a1520" }}>
              {p?.name} ({p?.resourceCount} cartas)
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- dialogs ----------

function TradeDialog({
  open,
  onOpenChange,
  view,
  you,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: PublicView;
  you: PublicPlayerView;
  onAction: (a: Action) => boolean | void;
}) {
  const [tab, setTab] = useState<"mesa" | "banco">("mesa");
  const [give, setGive] = useState<ResourceMap>(emptyResources());
  const [want, setWant] = useState<ResourceMap>(emptyResources());
  const [bankGive, setBankGive] = useState<Resource | null>(null);
  const [bankTake, setBankTake] = useState<Resource | null>(null);
  const hand = you.resources ?? emptyResources();
  const offerOpen = view.tradeOffers.length > 0;

  useEffect(() => {
    if (!open) return;
    setGive(emptyResources());
    setWant(emptyResources());
    setBankGive(null);
    setBankTake(null);
  }, [open]);

  const overlap = RESOURCES.some((r) => give[r] > 0 && want[r] > 0);
  const offerProblem = offerOpen
    ? "Já há uma oferta na mesa"
    : countResources(give) === 0
      ? "Escolha o que você dá"
      : countResources(want) === 0
        ? "Escolha o que você quer"
        : overlap
          ? "Não peça o mesmo recurso que dá"
          : null;

  const bankAction = view.legal.find((a) => a.type === "TRADE_BANK" && a.give === bankGive && a.take === bankTake);
  const ratio = (r: Resource) => you.bankRatios?.[r] ?? 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-[#8a6410] bg-[#3d2a1f] text-[#f4e8c8]">
        <DialogHeader>
          <DialogTitle>Trocar</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Com os jogadores, vocês combinam o preço. Com o banco, a taxa é fixa: 4 por 1, ou menos com porto.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1">
          <button type="button" className={tabClass(tab === "mesa")} onClick={() => setTab("mesa")}>
            Jogadores
          </button>
          <button type="button" className={tabClass(tab === "banco")} onClick={() => setTab("banco")}>
            Banco e portos
          </button>
        </div>
        {tab === "mesa" ? (
          <div className="space-y-3">
            <Stepper label="Você dá" value={give} cap={hand} onChange={setGive} />
            <Stepper label="Você quer" value={want} onChange={setWant} />
            <Button
              className="h-10 w-full"
              disabled={Boolean(offerProblem)}
              onClick={() => {
                const ok = onAction({ type: "OFFER_TRADE", playerId: you.id, give, want });
                if (ok !== false) onOpenChange(false);
              }}
            >
              {offerProblem ?? "Oferecer à mesa"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[11px] uppercase">Você entrega</p>
              <div className="grid grid-cols-5 gap-1">
                {RESOURCES.map((r) => (
                  <PickChip
                    key={r}
                    resource={r}
                    caption={`${ratio(r)} por 1`}
                    selected={bankGive === r}
                    disabled={hand[r] < ratio(r)}
                    onClick={() => setBankGive(r)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase">Você recebe 1</p>
              <div className="grid grid-cols-5 gap-1">
                {RESOURCES.map((r) => (
                  <PickChip
                    key={r}
                    resource={r}
                    caption={`banco: ${view.bank[r]}`}
                    selected={bankTake === r}
                    disabled={r === bankGive || view.bank[r] === 0}
                    onClick={() => setBankTake(r)}
                  />
                ))}
              </div>
            </div>
            <Button
              className="h-10 w-full"
              disabled={!bankAction}
              onClick={() => {
                if (bankAction) onAction(bankAction);
                setBankTake(null);
              }}
            >
              {bankGive && bankTake
                ? `Trocar ${ratio(bankGive)} ${RESOURCE_LABEL[bankGive].toLowerCase()} por 1 ${RESOURCE_LABEL[bankTake].toLowerCase()}`
                : "Escolha o que entrega e o que recebe"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickChip({
  resource,
  caption,
  selected,
  disabled,
  onClick,
}: {
  resource: Resource;
  caption: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`pixel-btn flex flex-col items-center py-1 ${selected ? "bg-primary text-primary-foreground" : "bg-secondary"} ${disabled ? "opacity-35" : ""}`}
    >
      <img src={CHIP_SPRITE[resource]} alt={RESOURCE_LABEL[resource]} className="pixelated size-8" />
      <span className="text-[9px] leading-tight">{RESOURCE_LABEL[resource]}</span>
      {caption ? <span className="text-[9px] leading-tight opacity-75">{caption}</span> : null}
    </button>
  );
}

function Stepper({
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
      <p className="mb-1 text-[11px] uppercase">{label}</p>
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map((r) => {
          const max = cap ? cap[r] : 6;
          return (
            <div key={r} className="flex flex-col items-center gap-0.5 bg-[#2a1c16] py-1">
              <img src={CHIP_SPRITE[r]} alt="" className="pixelated size-8" />
              <span className="text-[9px] leading-tight">{RESOURCE_LABEL[r]}</span>
              <span className="text-base leading-tight tabular-nums">{value[r]}</span>
              <span className="flex gap-0.5">
                <button
                  type="button"
                  aria-label={`menos ${RESOURCE_LABEL[r]}`}
                  className="pixel-btn bg-secondary w-5 text-xs disabled:opacity-35"
                  disabled={value[r] <= 0}
                  onClick={() => onChange({ ...value, [r]: value[r] - 1 })}
                >
                  -
                </button>
                <button
                  type="button"
                  aria-label={`mais ${RESOURCE_LABEL[r]}`}
                  className="pixel-btn bg-secondary w-5 text-xs disabled:opacity-35"
                  disabled={value[r] >= max}
                  onClick={() => onChange({ ...value, [r]: value[r] + 1 })}
                >
                  +
                </button>
              </span>
              {cap ? <span className="text-muted-foreground text-[9px]">tem {cap[r]}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlentyDialog({
  open,
  onOpenChange,
  view,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: PublicView;
  onAction: (a: Action) => boolean | void;
}) {
  const [slots, setSlots] = useState<Array<Resource | null>>([null, null]);
  useEffect(() => {
    if (open) setSlots([null, null]);
  }, [open]);
  const [a, b] = slots;
  const action =
    a && b
      ? view.legal.find(
          (x) =>
            x.type === "PLAY_YEAR_OF_PLENTY" &&
            ((x.resources[0] === a && x.resources[1] === b) || (x.resources[0] === b && x.resources[1] === a)),
        )
      : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-[#8a6410] bg-[#3d2a1f] text-[#f4e8c8]">
        <DialogHeader>
          <DialogTitle>Fartura</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">Pegue duas cartas do banco. Podem ser iguais.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-2">
          {slots.map((slot, i) => (
            <button
              key={i}
              type="button"
              className="resource-card h-20 w-14 justify-center"
              onClick={() => setSlots((prev) => prev.map((s, j) => (j === i ? null : s)))}
            >
              {slot ? <img src={CARD_SPRITE[slot]} alt={RESOURCE_LABEL[slot]} className="pixelated h-[68px] w-12" /> : "?"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {RESOURCES.map((r) => {
            const taken = slots.filter((s) => s === r).length;
            return (
              <PickChip
                key={r}
                resource={r}
                caption={`banco: ${view.bank[r]}`}
                selected={taken > 0}
                disabled={view.bank[r] - taken <= 0 || !slots.includes(null)}
                onClick={() =>
                  setSlots((prev) => {
                    const i = prev.indexOf(null);
                    if (i < 0) return prev;
                    const next = [...prev];
                    next[i] = r;
                    return next;
                  })
                }
              />
            );
          })}
        </div>
        <Button
          disabled={!action}
          onClick={() => {
            if (!action) return;
            onAction(action);
            onOpenChange(false);
          }}
        >
          Pegar as duas
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function MonopolyDialog({
  open,
  onOpenChange,
  legal,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legal: Action[];
  onAction: (a: Action) => boolean | void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-[#8a6410] bg-[#3d2a1f] text-[#f4e8c8]">
        <DialogHeader>
          <DialogTitle>Monopólio</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Todos os outros jogadores entregam a você todas as cartas desse recurso.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-1">
          {RESOURCES.map((r) => (
            <PickChip
              key={r}
              resource={r}
              caption=""
              selected={false}
              disabled={!legal.some((a) => a.type === "PLAY_MONOPOLY" && a.resource === r)}
              onClick={() => {
                const a = legal.find((x) => x.type === "PLAY_MONOPOLY" && x.resource === r);
                if (!a) return;
                onAction(a);
                onOpenChange(false);
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function tabClass(active: boolean): string {
  return `pixel-btn flex-1 px-2 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`;
}
