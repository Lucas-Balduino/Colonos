import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { CreateGameOptions } from "../core/types.ts";
import { isMuted, setMuted, sfx } from "./audio.ts";

export type LobbyIntent =
  | { mode: "solo"; opts: CreateGameOptions; viewerId: string }
  | { mode: "hotseat"; opts: CreateGameOptions; viewerId: string }
  | { mode: "host"; name: string; bots: number; setup: "beginner" | "random" }
  | { mode: "join"; name: string; code: string };

const COLORS = ["#c44536", "#2b6cb0", "#d97706", "#e8e0d0"];

export function Lobby({ onStart }: { onStart: (intent: LobbyIntent) => void }) {
  const [name, setName] = useState("Você");
  const [setup, setSetup] = useState<"beginner" | "random">("beginner");
  const [code, setCode] = useState("");
  const [hotseats, setHotseats] = useState(4);
  const [bots, setBots] = useState(3);
  const [mute, setMute] = useState(isMuted());

  const solo = (): CreateGameOptions => ({
    setup,
    seed: Date.now() >>> 0,
    players: [
      { id: "p1", name, color: COLORS[0]!, isBot: false },
      { id: "p2", name: "Marinheiro", color: COLORS[1]!, isBot: true },
      { id: "p3", name: "Lenhadora", color: COLORS[2]!, isBot: true },
      { id: "p4", name: "Mineiro", color: COLORS[3]!, isBot: true },
    ],
  });

  const hotseat = (): CreateGameOptions => ({
    setup,
    seed: Date.now() >>> 0,
    players: ["Vermelho", "Azul", "Laranja", "Marfim"].slice(0, hotseats).map((n, i) => ({
      id: `p${i + 1}`,
      name: n,
      color: COLORS[i]!,
      isBot: false,
    })),
  });

  const toggleMute = () => {
    const next = !mute;
    setMuted(next);
    setMute(next);
    if (!next) sfx("click");
  };

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <img
        src="/sprites/poster.png"
        alt=""
        className="pixelated pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="from-night/90 to-night/70 absolute inset-0 bg-gradient-to-b" />
      <div className="relative mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-5 p-4">
        <header className="text-center">
          <img src="/sprites/wordmark-hero.png" alt="COLONOS" className="pixelated mx-auto h-20 w-auto max-w-full md:h-28" />
          <p className="text-gold mt-2 text-xs tracking-[0.32em] uppercase">Ilha das Lanternas</p>
          <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm">
            Funde aldeias, abre estradas e disputa 10 pontos de vitória nas regras base de Catan. Mesa pixelada, ladrão
            à solta, lanternas na costa.
          </p>
          <button type="button" className="pixel-btn bg-secondary mt-3 px-3 py-1 text-xs" onClick={toggleMute}>
            {mute ? "Som: mudo" : "Som: ligado"}
          </button>
        </header>

        <section className="wood-panel p-5">
          <h2 className="text-xl">Nova partida</h2>
          <p className="text-muted-foreground mb-4 text-sm">Escolha o mapa e como sentar à mesa.</p>
          <label className="mb-3 block text-sm">
            Seu nome
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} />
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button variant={setup === "beginner" ? "default" : "outline"} onClick={() => setSetup("beginner")}>
              Mapa iniciante
            </Button>
            <Button variant={setup === "random" ? "default" : "outline"} onClick={() => setSetup("random")}>
              Mapa aleatório
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              onClick={() => {
                sfx("click");
                onStart({ mode: "solo", opts: solo(), viewerId: "p1" });
              }}
            >
              Solo contra 3 bots
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              onClick={() => {
                sfx("click");
                onStart({ mode: "hotseat", opts: hotseat(), viewerId: "p1" });
              }}
            >
              Hot-seat ({hotseats} jogadores)
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span>Hot-seat:</span>
            {[3, 4].map((n) => (
              <Button key={n} size="sm" variant={hotseats === n ? "default" : "outline"} onClick={() => setHotseats(n)}>
                {n}
              </Button>
            ))}
          </div>
        </section>

        <section className="wood-panel p-5">
          <h2 className="text-xl">Sala na web</h2>
          <p className="text-muted-foreground mb-3 text-sm">Mesmo código, amigos no navegador. Sem conta.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="text-xs">Bots na sala:</span>
            {[0, 1, 2, 3].map((n) => (
              <Button key={n} size="sm" variant={bots === n ? "default" : "outline"} onClick={() => setBots(n)}>
                {n}
              </Button>
            ))}
          </div>
          <Button
            onClick={() => {
              sfx("click");
              onStart({ mode: "host", name, bots, setup });
            }}
          >
            Criar sala
          </Button>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Código da sala"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <Button
              variant="secondary"
              disabled={code.length < 4}
              onClick={() => {
                sfx("click");
                onStart({ mode: "join", name, code });
              }}
            >
              Entrar
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
