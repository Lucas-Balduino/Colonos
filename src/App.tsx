import { useState } from "react";
import { Toaster } from "@/components/ui/sonner.tsx";
import { Lobby } from "./client/Lobby.tsx";
import { GameScreen } from "./client/GameScreen.tsx";
import { NetMatch } from "./client/NetMatch.tsx";
import { readNetSession, type NetIntent } from "./client/useNetGame.ts";
import { useLocalGame } from "./client/useLocalGame.ts";
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
  | { kind: "net"; intent: NetIntent; id: number }
  | { kind: "scene"; name: ScenarioName };

function sceneFromUrl(): ScenarioName | null {
  if (!import.meta.env.DEV) return null;
  const name = new URLSearchParams(window.location.search).get("cena");
  return name && isScenarioName(name) ? name : null;
}

/** `?sala=CODE`: our own seat comes back; anyone else gets the join form filled in. */
function roomFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("sala")?.toUpperCase() ?? null;
  return code && /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

export default function App() {
  const [linkCode] = useState(roomFromUrl);
  const [screen, setScreen] = useState<Screen>(() => {
    const scene = sceneFromUrl();
    if (scene) return { kind: "scene", name: scene };
    const session = readNetSession("tab");
    if (linkCode && session?.code === linkCode) return { kind: "net", intent: { mode: "resume", session }, id: Date.now() };
    return { kind: "lobby" };
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
              setScreen({ kind: "net", intent, id: Date.now() });
            }
          }}
          joinCode={linkCode}
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
        <NetMatch key={screen.id} intent={screen.intent} onLeave={() => setScreen({ kind: "lobby" })} />
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
