import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Lobby, type LobbyIntent } from "./client/Lobby.tsx";
import { GameScreen, TableLayout } from "./client/GameScreen.tsx";
import { useLocalGame } from "./client/useLocalGame.ts";
import { useNetGame } from "./client/useNetGame.ts";
import { buildScenario, isScenarioName, type ScenarioName } from "./dev/scenarios.ts";
import { clearSoloSave } from "./client/solo-save.ts";
import type { CreateGameOptions, GameState } from "./core/types.ts";

type LocalScreen = {
  kind: "local";
  opts: CreateGameOptions;
  viewerId: string;
  hotseat: boolean;
  initial?: GameState;
  persist: boolean;
  id: number;
};

type Screen =
  | { kind: "lobby" }
  | LocalScreen
  | { kind: "net"; intent: Extract<LobbyIntent, { mode: "host" } | { mode: "join" }> }
  | { kind: "scene"; name: ScenarioName };

function sceneFromUrl(): ScenarioName | null {
  if (!import.meta.env.DEV) return null;
  const name = new URLSearchParams(window.location.search).get("cena");
  return name && isScenarioName(name) ? name : null;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const scene = sceneFromUrl();
    return scene ? { kind: "scene", name: scene } : { kind: "lobby" };
  });

  return (
    <>
      {screen.kind === "lobby" ? (
        <Lobby
          onStart={(intent) => {
            if (intent.mode === "solo") {
              setScreen({
                kind: "local",
                opts: intent.opts,
                viewerId: intent.viewerId,
                hotseat: false,
                initial: intent.initial,
                persist: true,
                id: Date.now(),
              });
            } else if (intent.mode === "hotseat") {
              setScreen({
                kind: "local",
                opts: intent.opts,
                viewerId: intent.viewerId,
                hotseat: true,
                persist: false,
                id: Date.now(),
              });
            } else {
              setScreen({ kind: "net", intent });
            }
          }}
        />
      ) : null}
      {screen.kind === "local" ? (
        <LocalMatch
          key={screen.id}
          opts={screen.opts}
          viewerId={screen.viewerId}
          hotseat={screen.hotseat}
          initial={screen.initial}
          persist={screen.persist}
          onLeave={() => setScreen({ kind: "lobby" })}
          onReplay={() =>
            setScreen({
              ...screen,
              id: screen.id + 1,
              initial: undefined,
              opts: { ...screen.opts, seed: (Date.now() >>> 0) || 1 },
            })
          }
        />
      ) : null}
      {screen.kind === "net" ? (
        <NetMatch intent={screen.intent} onLeave={() => setScreen({ kind: "lobby" })} />
      ) : null}
      {screen.kind === "scene" ? (
        <SceneMatch
          name={screen.name}
          onLeave={() => {
            window.history.replaceState({}, "", window.location.pathname);
            setScreen({ kind: "lobby" });
          }}
        />
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
  onReplay,
  initial,
  persist,
}: {
  opts: CreateGameOptions;
  viewerId: string;
  hotseat: boolean;
  onLeave: () => void;
  onReplay: () => void;
  initial?: GameState;
  persist: boolean;
}) {
  const { state, dispatch, events } = useLocalGame(opts, viewerId, initial, persist);
  return (
    <GameScreen
      state={state}
      viewerId={viewerId}
      onAction={dispatch}
      onLeave={() => {
        if (persist && state.phase.type !== "gameOver") {
          if (!window.confirm("Sair da partida? O jogo salvo neste aparelho será apagado.")) return;
          clearSoloSave();
        }
        onLeave();
      }}
      onReplay={onReplay}
      hotseat={hotseat}
      events={events}
    />
  );
}

const SCENE_OPTS: CreateGameOptions = {
  setup: "beginner",
  seed: 7,
  players: [
    { id: "p1", name: "Você", color: "#c44536", isBot: false },
    { id: "p2", name: "Marinheiro", color: "#2b6cb0", isBot: true },
    { id: "p3", name: "Lenhadora", color: "#d97706", isBot: true },
    { id: "p4", name: "Mineiro", color: "#e8e0d0", isBot: true },
  ],
};

function SceneMatch({ name, onLeave }: { name: ScenarioName; onLeave: () => void }) {
  const [boot] = useState(() => buildScenario(name));
  const [round, setRound] = useState({ n: 0, seed: SCENE_OPTS.seed ?? 7 });
  return (
    <LocalMatch
      key={round.n}
      opts={{ ...SCENE_OPTS, seed: round.seed }}
      viewerId="p1"
      hotseat={false}
      onLeave={onLeave}
      onReplay={() => setRound((value) => ({ n: value.n + 1, seed: (Date.now() >>> 0) || 1 }))}
      initial={round.n === 0 ? boot : undefined}
      persist={false}
    />
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
      <TableLayout view={net.view} onAction={net.dispatch} interactive onLeave={onLeave} events={net.events} />
    );
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
