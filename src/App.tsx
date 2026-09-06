import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Lobby, type LobbyIntent } from "./client/Lobby.tsx";
import { GameScreen, TableLayout } from "./client/GameScreen.tsx";
import { useLocalGame } from "./client/useLocalGame.ts";
import { useNetGame } from "./client/useNetGame.ts";
import type { CreateGameOptions } from "./core/types.ts";

type Screen =
  | { kind: "lobby" }
  | { kind: "local"; opts: CreateGameOptions; viewerId: string; hotseat: boolean }
  | { kind: "net"; intent: Extract<LobbyIntent, { mode: "host" } | { mode: "join" }> };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "lobby" });

  return (
    <>
      {screen.kind === "lobby" ? (
        <Lobby
          onStart={(intent) => {
            if (intent.mode === "solo") {
              setScreen({ kind: "local", opts: intent.opts, viewerId: intent.viewerId, hotseat: false });
            } else if (intent.mode === "hotseat") {
              setScreen({ kind: "local", opts: intent.opts, viewerId: intent.viewerId, hotseat: true });
            } else {
              setScreen({ kind: "net", intent });
            }
          }}
        />
      ) : null}
      {screen.kind === "local" ? (
        <LocalMatch
          opts={screen.opts}
          viewerId={screen.viewerId}
          hotseat={screen.hotseat}
          onLeave={() => setScreen({ kind: "lobby" })}
        />
      ) : null}
      {screen.kind === "net" ? (
        <NetMatch intent={screen.intent} onLeave={() => setScreen({ kind: "lobby" })} />
      ) : null}
      <Toaster />
    </>
  );
}

function LocalMatch({
  opts,
  viewerId,
  hotseat,
  onLeave,
}: {
  opts: CreateGameOptions;
  viewerId: string;
  hotseat: boolean;
  onLeave: () => void;
}) {
  const { state, dispatch } = useLocalGame(opts, viewerId);
  return (
    <GameScreen state={state} viewerId={viewerId} onAction={dispatch} onLeave={onLeave} hotseat={hotseat} />
  );
}

function NetMatch({
  intent,
  onLeave,
}: {
  intent: Extract<LobbyIntent, { mode: "host" } | { mode: "join" }>;
  onLeave: () => void;
}) {
  const net = useNetGame();

  useEffect(() => {
    if (intent.mode === "host") net.create(intent.name, intent.bots, intent.setup);
    else net.join(intent.code, intent.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect once per mount
  }, []);

  if (net.view) {
    return <TableLayout view={net.view} onAction={net.dispatch} interactive onLeave={onLeave} />;
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <div className="wood-panel p-5">
        <p className="text-gold text-[10px] tracking-[0.28em] uppercase">Sala</p>
        <h2 className="text-2xl font-bold">{net.lobby?.code ?? (net.connected ? "…" : "Conectando…")}</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {net.connected
            ? "Compartilhe o código com amigos. O anfitrião inicia quando houver pelo menos 3 assentos (humanos + bots)."
            : "Abrindo o porto… se travar, volte ao lobby e tente de novo."}
        </p>
        {(net.lobby?.players ?? []).length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">Ninguém sentou ainda.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {net.lobby!.players.map((p) => (
              <li key={p.id}>
                {p.name} {p.isBot ? "· bot" : ""}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {net.lobby?.host ? <Button onClick={net.start}>Começar partida</Button> : <p>Aguardando o anfitrião…</p>}
          <Button variant="ghost" onClick={onLeave}>
            Voltar
          </Button>
        </div>
      </div>
    </div>
  );
}
