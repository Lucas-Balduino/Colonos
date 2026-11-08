import { useEffect, useState } from "react";
import { startAmbience, stopAmbience } from "./audio.ts";
import { BoardView } from "./BoardView.tsx";
import type { BuildMode } from "./copy.ts";
import { GameOver } from "./GameOver.tsx";
import { BuildPanel, Hud, OfferPanel, offerShownTo, ResourceStrip } from "./Hud.tsx";
import { projectStateFor } from "../core/view.ts";
import { whoseTurn } from "../ai/bot.ts";
import { emptyResources } from "../core/resources.ts";
import type { Action, GameState, PlayerId, PublicView } from "../core/types.ts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { EventBatch } from "./fx/batch.ts";

export function GameScreen({
  state,
  viewerId,
  onAction,
  onLeave,
  onReplay,
  hotseat,
  events,
}: {
  state: GameState;
  viewerId: PlayerId;
  onAction: (a: Action) => boolean | void;
  onLeave: () => void;
  onReplay?: () => void;
  hotseat?: boolean;
  events: EventBatch;
}) {
  const turnId = whoseTurn(state);
  const [revealed, setRevealed] = useState(turnId);
  const passing = Boolean(hotseat && state.phase.type !== "gameOver" && turnId !== revealed);
  const effectiveId = hotseat ? (passing ? revealed : turnId) : viewerId;
  const view = projectStateFor(state, effectiveId);
  const interactive = !passing && (hotseat || turnId === viewerId);
  const nextName = state.players.find((player) => player.id === turnId)?.name ?? "o próximo";
  return (
    <>
      <TableLayout view={view} onAction={onAction} interactive={interactive} onLeave={onLeave} events={events} />
      {passing ? (
        <div data-pass-screen className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0d0a10] px-6">
          <div className="wood-panel w-full max-w-sm p-6 text-center">
            <p className="text-xl">Passe para {nextName}</p>
            <p className="text-muted-foreground mt-2 text-sm">A mão só aparece depois da confirmação.</p>
            <Button className="mt-4 h-11 w-full" onClick={() => setRevealed(turnId)}>
              Sou {nextName}
            </Button>
          </div>
        </div>
      ) : null}
      {state.phase.type === "gameOver" && onReplay ? (
        <GameOver view={projectStateFor(state, viewerId)} onReplay={onReplay} onLobby={onLeave} />
      ) : null}
    </>
  );
}

const EMPTY_EVENTS: EventBatch = { seq: 0, events: [] };

export function TableLayout({
  view,
  onAction,
  interactive,
  onLeave,
  events = EMPTY_EVENTS,
}: {
  view: PublicView;
  onAction: (a: Action) => boolean | void;
  interactive: boolean;
  onLeave: () => void;
  events?: EventBatch;
}) {
  const [sheet, setSheet] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [pendingRobberHex, setPendingRobberHex] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState<BuildMode | null>(null);

  useEffect(() => {
    setBuildMode(null);
  }, [view.phase]);

  useEffect(() => {
    startAmbience();
    return () => stopAmbience(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBuildMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dispatch = (a: Action) => {
    const result = onAction(a);
    if (
      result !== false &&
      (a.type === "BUILD_ROAD" ||
        a.type === "BUILD_SETTLEMENT" ||
        a.type === "BUILD_CITY" ||
        a.type === "PLACE_ROAD" ||
        a.type === "PLACE_SETTLEMENT")
    ) {
      setBuildMode(null);
    }
    return result;
  };

  const chooseBuild = (mode: BuildMode) => setBuildMode((prev) => (prev === mode ? null : mode));

  const you = view.players.find((p) => p.isYou);
  const resources = you?.resources ?? emptyResources();
  const discardPending = view.phase.type === "discard" && Boolean(you && view.phase.queue.includes(you.id));
  const roll = view.legal.find((a) => a.type === "ROLL");
  const end = view.legal.find((a) => a.type === "END_TURN");
  const primary = roll
    ? { label: "Rolar dados", run: () => dispatch(roll) }
    : discardPending
      ? { label: "Descartar", run: () => setSheet(true) }
      : end
        ? { label: "Encerrar turno", run: () => dispatch(end) }
        : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0a1c26] md:flex-row">
      <div className="relative min-h-0 min-w-0 flex-1">
        <BoardView
          view={view}
          onAction={dispatch}
          interactive={interactive}
          onPendingRobber={setPendingRobberHex}
          buildMode={buildMode}
          onClearBuild={() => setBuildMode(null)}
          events={events}
        />
        <button type="button" className="wood-panel absolute top-3 left-3 z-10 px-3 py-1 text-xs" onClick={onLeave}>
          Sair
        </button>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetContent
            side="bottom"
            className="max-h-[78vh] overflow-y-auto border-[#8a6410] bg-[#3d2a1f] p-0 pt-8"
            showCloseButton
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Ações da mesa</SheetTitle>
            </SheetHeader>
            <Hud
              view={view}
              onAction={dispatch}
              interactive={interactive}
              pendingRobberHex={pendingRobberHex}
              buildMode={buildMode}
              onBuildMode={chooseBuild}
              events={events}
            />
          </SheetContent>
        </Sheet>
      </div>
      {offerShownTo(view.tradeOffers[0], you?.id) && !sheet ? (
        <div className="shrink-0 border-t-2 border-[#8a6410] bg-[#2a1c16] p-2 md:hidden">
          <OfferPanel view={view} youId={you?.id ?? null} onAction={dispatch} />
        </div>
      ) : null}
      <div className="flex h-16 shrink-0 items-center gap-1 border-t-2 border-[#8a6410] bg-[#1a1520] px-1 md:hidden">
        <ResourceStrip resources={resources} batch={events} viewerId={you?.id ?? null} />
        {primary ? (
          <Button className="h-11 min-w-0 flex-1 px-2 text-xs" onClick={primary.run}>
            {primary.label}
          </Button>
        ) : (
          <span className="flex-1" />
        )}
        <Popover open={buildOpen} onOpenChange={setBuildOpen}>
          <PopoverTrigger asChild>
            <Button variant="secondary" className="h-11 px-2 text-xs">
              Construir
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-64">
            <BuildPanel
              legal={view.legal}
              buildMode={buildMode}
              onBuildMode={(mode) => {
                chooseBuild(mode);
                setBuildOpen(false);
              }}
              onBuy={(action) => {
                dispatch(action);
                setBuildOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <Button variant="secondary" className="h-11 px-2 text-xs" onClick={() => setSheet(true)}>
          Mesa
        </Button>
      </div>
      <div className="wood-dock hidden md:flex md:h-dvh">
        <Hud
          view={view}
          onAction={dispatch}
          interactive={interactive}
          pendingRobberHex={pendingRobberHex}
          buildMode={buildMode}
          onBuildMode={chooseBuild}
          events={events}
        />
      </div>
    </div>
  );
}
