import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { RESOURCES, RESOURCE_LABEL, countResources, emptyResources } from "../core/index.ts";
import type { Action, PublicView, Resource, ResourceMap } from "../core/types.ts";
import { phaseCopy } from "./copy.ts";

export function Hud({
  view,
  onAction,
  interactive,
}: {
  view: PublicView;
  onAction: (a: Action) => void;
  interactive: boolean;
}) {
  const you = view.players.find((p) => p.isYou);
  const yourTurn = Boolean(you && you.id === view.currentPlayerId);
  const legal = view.legal;
  const [give, setGive] = useState<Resource | null>(null);
  const [discard, setDiscard] = useState<ResourceMap>(emptyResources());

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

  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden p-3 md:w-[340px] md:shrink-0">
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="font-pixel text-base tracking-wide">Colonos</CardTitle>
          <p className="text-muted-foreground text-xs">
            {phaseCopy(view.phase, yourTurn && interactive)}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <DiceFace dice={view.dice} />
          {view.winnerId ? (
            <Badge variant="default">
              Vitória: {view.players.find((p) => p.id === view.winnerId)?.name}
            </Badge>
          ) : (
            <Badge variant="secondary">Turno {view.turnNumber || "—"}</Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        {view.players.map((p) => (
          <div
            key={p.id}
            className="rounded-md border px-2 py-1.5 text-xs"
            style={{ borderColor: p.color, opacity: p.id === view.currentPlayerId ? 1 : 0.75 }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-semibold" style={{ color: p.color }}>
                {p.name}
                {p.isYou ? " (você)" : p.isBot ? " · bot" : ""}
              </span>
              <span>{p.publicVp} VP</span>
            </div>
            <div className="text-muted-foreground mt-0.5 flex justify-between">
              <span>{p.resourceCount} cartas</span>
              <span>
                {p.settlementCount}A {p.cityCount}C {p.knightsPlayed}K
              </span>
            </div>
            {view.longestRoadPlayerId === p.id ? <span className="text-[10px]">Maior estrada</span> : null}
            {view.largestArmyPlayerId === p.id ? <span className="text-[10px]"> Maior exército</span> : null}
          </div>
        ))}
      </div>

      {you?.resources ? (
        <Card>
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Sua mão</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {RESOURCES.map((r) => (
              <button
                key={r}
                type="button"
                className="rounded-sm border px-2 py-1 text-xs"
                onClick={() => {
                  if (discardNeed) tapDiscard(r);
                  else setGive(give === r ? null : r);
                }}
              >
                <span className="block text-[10px] uppercase">{RESOURCE_LABEL[r]}</span>
                <span className="text-base font-bold">{you.resources![r]}</span>
                {discardNeed ? <span className="block text-[10px]">-{discard[r]}</span> : null}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {you?.devCards && you.devCards.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {you.devCards.map((c, i) => (
            <Badge key={`${c.type}-${i}`} variant={c.playable ? "default" : "secondary"}>
              {devLabel(c.type)}
              {!c.playable ? " (nova)" : ""}
            </Badge>
          ))}
        </div>
      ) : null}

      {interactive ? (
        <div className="flex flex-wrap gap-2">
          {legal.some((a) => a.type === "ROLL") ? (
            <Button onClick={() => onAction({ type: "ROLL", playerId: you!.id })}>Rolar dados</Button>
          ) : null}
          {legal.some((a) => a.type === "BUY_DEV") ? (
            <Button variant="secondary" onClick={() => onAction({ type: "BUY_DEV", playerId: you!.id })}>
              Comprar carta
            </Button>
          ) : null}
          {legal.some((a) => a.type === "PLAY_KNIGHT") ? (
            <Button variant="outline" onClick={() => onAction({ type: "PLAY_KNIGHT", playerId: you!.id })}>
              Cavaleiro
            </Button>
          ) : null}
          {legal.some((a) => a.type === "PLAY_ROAD_BUILDING") ? (
            <Button
              variant="outline"
              onClick={() => onAction({ type: "PLAY_ROAD_BUILDING", playerId: you!.id })}
            >
              2 estradas
            </Button>
          ) : null}
          {legal.some((a) => a.type === "PLAY_MONOPOLY")
            ? RESOURCES.map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant="outline"
                  onClick={() => onAction({ type: "PLAY_MONOPOLY", playerId: you!.id, resource: r })}
                >
                  Monopólio {RESOURCE_LABEL[r]}
                </Button>
              ))
            : null}
          {legal
            .filter((a) => a.type === "PLAY_YEAR_OF_PLENTY")
            .slice(0, 5)
            .map((a, i) =>
              a.type === "PLAY_YEAR_OF_PLENTY" ? (
                <Button
                  key={i}
                  size="sm"
                  variant="outline"
                  onClick={() => onAction(a)}
                >
                  Fartura {RESOURCE_LABEL[a.resources[0]]}+{RESOURCE_LABEL[a.resources[1]]}
                </Button>
              ) : null,
            )}
          {legal.some((a) => a.type === "END_TURN") ? (
            <Button variant="secondary" onClick={() => onAction({ type: "END_TURN", playerId: you!.id })}>
              Encerrar turno
            </Button>
          ) : null}
        </div>
      ) : null}

      {discardNeed > 0 && you ? (
        <div className="rounded-md border p-2 text-sm">
          <p className="mb-2">Descarte {discardNeed} cartas ({discardCount} escolhidas).</p>
          <Button
            disabled={discardCount !== discardNeed}
            onClick={() => {
              onAction({ type: "DISCARD", playerId: you.id, resources: discard });
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
                <Button key={a.from} onClick={() => onAction(a)}>
                  Roubar {view.players.find((p) => p.id === a.from)?.name}
                </Button>
              ) : null,
            )}
        </div>
      ) : null}

      {yourTurn && view.phase.type === "main" && you && give ? (
        <div className="rounded-md border p-2 text-xs">
          <p className="mb-1">Banco: oferecer {RESOURCE_LABEL[give]}</p>
          <div className="flex flex-wrap gap-1">
            {legal
              .filter((a) => a.type === "TRADE_BANK" && a.give === give)
              .map((a) =>
                a.type === "TRADE_BANK" ? (
                  <Button key={a.take} size="sm" onClick={() => onAction(a)}>
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
            <div key={o.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
              <span>
                {view.players.find((p) => p.id === o.from)?.name} oferece {fmt(o.give)} por {fmt(o.want)}
              </span>
              {you && o.from !== you.id ? (
                <Button size="sm" onClick={() => onAction({ type: "ACCEPT_TRADE", playerId: you.id, offerId: o.id })}>
                  Aceitar
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Separator />
      <ScrollArea className="min-h-24 flex-1">
        <ul className="space-y-1 text-[11px] text-muted-foreground">
          {[...view.log].reverse().map((e, i) => (
            <li key={`${e.text}-${i}`}>{e.text}</li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
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

function DiceFace({ dice }: { dice: [number, number] | null }) {
  if (!dice) return <span className="text-muted-foreground text-xs">Dados: —</span>;
  return (
    <div className="flex items-center gap-1 font-mono text-lg">
      <span className="inline-flex size-8 items-center justify-center rounded-sm border bg-card">{dice[0]}</span>
      <span className="inline-flex size-8 items-center justify-center rounded-sm border bg-card">{dice[1]}</span>
      <span className="text-muted-foreground text-sm">= {dice[0] + dice[1]}</span>
    </div>
  );
}

