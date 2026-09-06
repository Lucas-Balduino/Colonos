import { useState } from "react";
import { BoardView } from "./BoardView.tsx";
import { Hud } from "./Hud.tsx";
import { projectStateFor } from "../core/view.ts";
import { whoseTurn } from "../ai/bot.ts";
import type { Action, GameState, PlayerId, PublicView } from "../core/types.ts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import { sfx } from "./audio.ts";

export function GameScreen({
  state,
  viewerId,
  onAction,
  onLeave,
  hotseat,
}: {
  state: GameState;
  viewerId: PlayerId;
  onAction: (a: Action) => boolean | void;
  onLeave: () => void;
  hotseat?: boolean;
}) {
  const effectiveId = hotseat ? whoseTurn(state) : viewerId;
  const view = projectStateFor(state, effectiveId);
  const interactive = hotseat || whoseTurn(state) === viewerId;
  return <TableLayout view={view} onAction={onAction} interactive={interactive} onLeave={onLeave} />;
}

export function TableLayout({
  view,
  onAction,
  interactive,
  onLeave,
}: {
  view: PublicView;
  onAction: (a: Action) => boolean | void;
  interactive: boolean;
  onLeave: () => void;
}) {
  const [sheet, setSheet] = useState(false);

  const dispatch = (a: Action) => {
    if (
      a.type === "PLACE_SETTLEMENT" ||
      a.type === "PLACE_ROAD" ||
      a.type === "BUILD_SETTLEMENT" ||
      a.type === "BUILD_CITY" ||
      a.type === "BUILD_ROAD" ||
      a.type === "MOVE_ROBBER"
    ) {
      sfx("place");
    }
    return onAction(a);
  };

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <div className="relative min-h-[52vh] flex-1 md:min-h-dvh">
        <BoardView view={view} onAction={dispatch} interactive={interactive} />
        <button type="button" className="wood-panel absolute top-3 left-3 z-10 px-3 py-1 text-xs" onClick={onLeave}>
          Sair
        </button>
        <div className="absolute right-3 bottom-3 z-10 md:hidden">
          <Button size="sm" onClick={() => setSheet(true)}>
            Mesa
          </Button>
          <Sheet open={sheet} onOpenChange={setSheet}>
            <SheetContent
              side="bottom"
              className="max-h-[78vh] overflow-y-auto border-[#8a6410] bg-[#2a2133] p-0"
              showCloseButton
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Ações da mesa</SheetTitle>
              </SheetHeader>
              <Hud view={view} onAction={dispatch} interactive={interactive} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <div className="hidden md:flex md:h-dvh">
        <Hud view={view} onAction={dispatch} interactive={interactive} />
      </div>
    </div>
  );
}
