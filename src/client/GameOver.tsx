import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { totalVictoryPoints, visibleVictoryPoints } from "../core/scoring.ts";
import type { GameState } from "../core/types.ts";

export function GameOver({
  state,
  onReplay,
  onLobby,
}: {
  state: GameState;
  onReplay: () => void;
  onLobby: () => void;
}) {
  const ranking = [...state.players]
    .map((player) => {
      const visible = visibleVictoryPoints(player, state.longestRoadPlayerId, state.largestArmyPlayerId);
      const cards = player.devCards.filter((card) => card.type === "victory").length;
      return {
        id: player.id,
        name: player.name,
        color: player.color,
        visible,
        cards,
        total: totalVictoryPoints(player, state.longestRoadPlayerId, state.largestArmyPlayerId),
        road: state.longestRoadPlayerId === player.id,
        army: state.largestArmyPlayerId === player.id,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt"));
  const winner = ranking.find((row) => row.id === (state.phase.type === "gameOver" ? state.phase.winner : ""));

  return (
    <Dialog open>
      <DialogContent
        className="border-[#8a6410] bg-[#3d2a1f] text-[#f4e8c8]"
        showCloseButton={false}
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{winner ? `${winner.name} chegou a 10` : "Fim de partida"}</DialogTitle>
        </DialogHeader>
        <ol className="space-y-2 text-sm">
          {ranking.map((row, index) => (
            <li key={row.id} className="wood-panel px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ color: row.color }}>
                  {index + 1}. {row.name}
                </span>
                <span className="text-gold">{row.total} pontos</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                {row.visible} na mesa, {row.cards} {row.cards === 1 ? "carta de ponto" : "cartas de ponto"}
                {row.road ? ", maior estrada" : ""}
                {row.army ? ", maior exército" : ""}
              </p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={onReplay}>
            Jogar de novo
          </Button>
          <Button className="flex-1" variant="secondary" onClick={onLobby}>
            Voltar ao lobby
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
