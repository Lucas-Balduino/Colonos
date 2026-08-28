import { BoardView } from "./BoardView.tsx";
import { Hud } from "./Hud.tsx";
import { projectStateFor } from "../core/view.ts";
import { whoseTurn } from "../ai/bot.ts";
import type { Action, GameState, PlayerId } from "../core/types.ts";

export function GameScreen({
  state,
  viewerId,
  onAction,
  onLeave,
  hotseat,
}: {
  state: GameState;
  viewerId: PlayerId;
  onAction: (a: Action) => void;
  onLeave: () => void;
  hotseat?: boolean;
}) {
  const effectiveId = hotseat ? whoseTurn(state) : viewerId;
  const view = projectStateFor(state, effectiveId);
  const interactive = hotseat || whoseTurn(state) === viewerId;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <div className="relative min-h-[46vh] flex-1 md:min-h-dvh">
        <BoardView view={view} onAction={onAction} interactive={interactive} />
        <button
          type="button"
          className="absolute top-3 left-3 z-10 rounded-md border bg-card/90 px-3 py-1 text-xs"
          onClick={onLeave}
        >
          Sair
        </button>
      </div>
      <Hud view={view} onAction={onAction} interactive={interactive} />
    </div>
  );
}
