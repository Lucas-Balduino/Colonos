import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import type { PublicView } from "../core/types.ts";

/** Final ranking. Hidden victory cards are revealed here. */
export function GameOver({
  view,
  onReplay,
  replayLabel = "Jogar de novo",
  waitingNote,
  onLobby,
}: {
  view: PublicView;
  /** Missing when only someone else can start the next game. */
  onReplay?: () => void;
  replayLabel?: string;
  waitingNote?: string;
  onLobby: () => void;
}) {
  const ranking = view.players
    .map((p) => {
      const final = view.final?.find((f) => f.id === p.id);
      const cards = final?.victoryCards ?? 0;
      return {
        ...p,
        cards,
        total: final?.total ?? p.publicVp,
        road: view.longestRoadPlayerId === p.id,
        army: view.largestArmyPlayerId === p.id,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt"));
  const winner = ranking.find((row) => row.id === view.winnerId);
  const youWon = Boolean(winner?.isYou);

  return (
    <Dialog open>
      <DialogContent
        className="border-[#8a6410] bg-[#3d2a1f] text-[#f4e8c8]"
        showCloseButton={false}
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{youWon ? "Você venceu!" : winner ? `${winner.name} venceu` : "Fim de partida"}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Rodada {view.turnNumber}. As cartas de ponto escondidas foram reveladas.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-2 text-sm">
          {ranking.map((row, index) => (
            <li key={row.id} className="wood-panel px-3 py-2" style={index === 0 ? { borderColor: "#d4a017" } : undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ color: row.color === "#e8e0d0" ? "#f4e8c8" : row.color }}>
                  {index + 1}. {row.isYou ? "Você" : row.name}
                </span>
                <span className="text-gold">{row.total} pontos</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                {row.settlementCount} {row.settlementCount === 1 ? "aldeia" : "aldeias"}, {row.cityCount}{" "}
                {row.cityCount === 1 ? "cidade" : "cidades"}
                {row.cards ? `, ${row.cards} ${row.cards === 1 ? "carta de ponto" : "cartas de ponto"}` : ""}
                {row.road ? ", maior estrada" : ""}
                {row.army ? ", maior exército" : ""}
              </p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onReplay ? (
            <Button className="flex-1" onClick={onReplay}>
              {replayLabel}
            </Button>
          ) : waitingNote ? (
            <p className="text-muted-foreground flex-1 self-center text-center text-xs">{waitingNote}</p>
          ) : null}
          <Button className="flex-1" variant="secondary" onClick={onLobby}>
            Voltar ao lobby
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
