import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { GameOver } from "./GameOver.tsx";
import { TableLayout } from "./GameScreen.tsx";
import { useNetGame, type NetIntent, type NetLobby } from "./useNetGame.ts";

function roomLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}?sala=${code}`;
}

/** An online room: waiting room, then the table, then the ranking. */
export function NetMatch({ intent, onLeave }: { intent: NetIntent; onLeave: () => void }) {
  const net = useNetGame(intent);
  const code = net.session?.code;

  // The address bar carries the room, so a reload comes straight back.
  useEffect(() => {
    if (code) window.history.replaceState({}, "", `?sala=${code}`);
  }, [code]);

  const exit = () => {
    window.history.replaceState({}, "", window.location.pathname);
    onLeave();
  };
  const leave = () => {
    net.leave();
    exit();
  };

  if (net.status === "gone") {
    return (
      <CenterPanel title="Sala indisponível">
        <p className="text-sm">{net.goneReason}</p>
        <Button className="mt-4 w-full" onClick={exit}>
          Voltar ao lobby
        </Button>
      </CenterPanel>
    );
  }

  if (net.view) {
    const over = net.view.phase.type === "gameOver";
    return (
      <>
        <TableLayout
          view={net.view}
          onAction={net.dispatch}
          interactive={net.status === "online"}
          onLeave={() => {
            if (over || window.confirm("Sair da sala? Um bot assume o seu lugar até o fim da partida.")) leave();
          }}
          events={net.events}
        />
        {net.status === "reconnecting" ? <ReconnectBanner /> : null}
        {over ? (
          <GameOver
            view={net.view}
            onReplay={net.isHost ? net.start : undefined}
            replayLabel="Nova partida nesta sala"
            waitingNote="Quem criou a sala pode começar outra partida."
            onLobby={leave}
          />
        ) : null}
      </>
    );
  }

  if (net.lobby && net.session) {
    return (
      <WaitingRoom
        lobby={net.lobby}
        youId={net.session.playerId}
        isHost={net.isHost}
        reconnecting={net.status === "reconnecting"}
        onStart={net.start}
        onLeave={leave}
      />
    );
  }

  return (
    <CenterPanel title={net.status === "reconnecting" ? "Reconectando…" : "Abrindo a sala…"}>
      <p className="text-muted-foreground text-sm">Falando com o porto. Se demorar, volte e tente de novo.</p>
      <Button variant="secondary" className="mt-4 w-full" onClick={leave}>
        Voltar
      </Button>
    </CenterPanel>
  );
}

function WaitingRoom({
  lobby,
  youId,
  isHost,
  reconnecting,
  onStart,
  onLeave,
}: {
  lobby: NetLobby;
  youId: string;
  isHost: boolean;
  reconnecting: boolean;
  onStart: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = roomLink(lobby.code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie o link da sala:", link);
    }
  };
  const empty = Math.max(0, 3 - lobby.players.length);

  return (
    <CenterPanel title="Sala na web">
      <p className="text-muted-foreground text-xs">Código da sala</p>
      <p className="text-gold text-4xl tracking-[0.3em]">{lobby.code}</p>
      <Button variant="secondary" className="mt-2 w-full" onClick={copy}>
        {copied ? "Link copiado" : "Copiar link para convidar"}
      </Button>
      <p className="text-muted-foreground mt-1 text-[11px]">
        Quem abrir o link entra direto. Mapa {lobby.setup === "random" ? "aleatório" : "iniciante"}.
      </p>

      <ul className="mt-4 space-y-1">
        {lobby.players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 bg-[#2a1c16] px-2 py-1.5 text-sm">
            <span className="size-3 shrink-0" style={{ background: p.color }} />
            <span className="flex-1 truncate">
              {p.id === youId && p.name !== "Você" ? `${p.name} (você)` : p.name}
            </span>
            <span className="text-muted-foreground text-[11px]">
              {p.isBot ? "bot" : p.id === lobby.hostId ? "criou a sala" : p.online ? "pronto" : "reconectando…"}
            </span>
          </li>
        ))}
        {Array.from({ length: 4 - lobby.players.length }, (_, i) => (
          <li key={`empty-${i}`} className="text-muted-foreground border border-dashed border-[#5c4030] px-2 py-1.5 text-xs">
            Lugar livre{i < empty ? ": vira bot se ninguém entrar" : ""}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2">
        {isHost ? (
          <Button className="h-11" onClick={onStart} disabled={reconnecting}>
            Começar partida
          </Button>
        ) : (
          <p className="text-muted-foreground text-center text-sm">Aguardando quem criou a sala começar…</p>
        )}
        <Button variant="ghost" onClick={onLeave}>
          Sair da sala
        </Button>
      </div>
    </CenterPanel>
  );
}

function ReconnectBanner() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-4">
      <p className="wood-panel px-4 py-2 text-sm">Conexão caiu. Reconectando… sua vez fica guardada por 1 minuto.</p>
    </div>
  );
}

function CenterPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <img src="/sprites/poster.png" alt="" className="pixelated pointer-events-none absolute inset-0 h-full w-full object-cover" />
      <div className="lobby-vignette absolute inset-0" />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
        <section className="wood-panel p-5">
          <h2 className="mb-3 text-xl">{title}</h2>
          {children}
        </section>
      </div>
    </div>
  );
}
