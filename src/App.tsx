import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Lobby, type LobbyIntent } from "./client/Lobby.tsx";
import { GameScreen } from "./client/GameScreen.tsx";
import { BoardView } from "./client/BoardView.tsx";
import { Hud } from "./client/Hud.tsx";
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
    return (
      <div className="flex min-h-dvh flex-col md:flex-row">
        <div className="relative min-h-[46vh] flex-1">
          <BoardView view={net.view} onAction={net.dispatch} interactive />
          <button
            type="button"
            className="absolute top-3 left-3 z-10 rounded-md border bg-card/90 px-3 py-1 text-xs"
            onClick={onLeave}
          >
            Sair
          </button>
        </div>
        <Hud view={net.view} onAction={net.dispatch} interactive />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h2 className="text-2xl font-bold">Sala {net.lobby?.code ?? "…"}</h2>
      <p className="text-muted-foreground text-sm">
        Compartilhe o código com amigos. O anfitrião inicia quando houver pelo menos 3 assentos (humanos +
        bots).
      </p>
      <ul className="space-y-1 text-sm">
        {(net.lobby?.players ?? []).map((p) => (
          <li key={p.id}>
            {p.name} {p.isBot ? "· bot" : ""}
          </li>
        ))}
      </ul>
      {net.lobby?.host ? <Button onClick={net.start}>Começar partida</Button> : <p>Aguardando o anfitrião…</p>}
      <Button variant="ghost" onClick={onLeave}>
        Voltar
      </Button>
    </div>
  );
}
