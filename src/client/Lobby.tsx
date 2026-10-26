import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { CreateGameOptions, GameState } from "../core/types.ts";
import { isMuted, setMuted, sfx } from "./audio.ts";
import { preloadSprites } from "./preload.ts";
import { readSoloSave } from "./solo-save.ts";

export type LobbyIntent =
  | { mode: "solo"; opts: CreateGameOptions; viewerId: string; initial?: GameState }
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
  const [more, setMore] = useState<"none" | "hotseat" | "web">("none");
  const [saved] = useState(() => readSoloSave());

  useEffect(() => {
    preloadSprites();
  }, []);

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
        className="pixelated pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="lobby-vignette absolute inset-0" />
      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-end gap-4 p-4 pb-8 sm:justify-center">
        {saved ? (
          <Button
            className="h-12 w-full text-base"
            onClick={() => {
              sfx("click");
              onStart({ mode: "solo", opts: saved.opts, viewerId: "p1", initial: saved.state });
            }}
          >
            Continuar partida
          </Button>
        ) : null}
        <header className="text-center">
          <img
            src="/sprites/wordmark.png"
            alt="COLONOS"
            className="pixelated mx-auto h-10 w-auto max-w-full drop-shadow-[0_2px_0_#0d0a10] md:h-12"
          />
          <p className="text-gold mt-2 text-xs tracking-[0.38em] uppercase">Ilha das Lanternas</p>
          <p className="text-parchment mx-auto mt-3 max-w-md text-sm drop-shadow-[0_1px_4px_#0d0a10]">
            Funde aldeias, abra estradas e chegue a 10 pontos.
          </p>
        </header>

        <section className="wood-panel p-5">
          <label className="mb-3 block text-sm">
            Seu nome na mesa
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} />
          </label>
          <div className="mb-4 flex gap-2">
            <Button className="flex-1" variant={setup === "beginner" ? "default" : "outline"} onClick={() => setSetup("beginner")}>
              Mapa iniciante
            </Button>
            <Button className="flex-1" variant={setup === "random" ? "default" : "outline"} onClick={() => setSetup("random")}>
              Mapa aleatório
            </Button>
          </div>
          <Button
            className="h-12 w-full text-base"
            onClick={() => {
              sfx("click");
              onStart({ mode: "solo", opts: solo(), viewerId: "p1" });
            }}
          >
            Sentar à mesa (solo, 3 bots)
          </Button>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <button type="button" className="pixel-btn bg-secondary px-3 py-1" onClick={toggleMute}>
              {mute ? "Som: mudo" : "Som: ligado"}
            </button>
            <span className="text-muted-foreground">Fan game educacional</span>
          </div>
        </section>

        <div className="flex gap-2">
          <Button
            variant={more === "hotseat" ? "default" : "secondary"}
            className="flex-1"
            onClick={() => setMore(more === "hotseat" ? "none" : "hotseat")}
          >
            Mesmo computador
          </Button>
          <Button
            variant={more === "web" ? "default" : "secondary"}
            className="flex-1"
            onClick={() => setMore(more === "web" ? "none" : "web")}
          >
            Sala na web
          </Button>
        </div>

        {more === "hotseat" ? (
          <section className="wood-panel p-4">
            <h2 className="text-lg">Hot-seat</h2>
            <p className="text-muted-foreground mb-3 text-sm">Passem o aparelho. 3 ou 4 pessoas, sem bots.</p>
            <div className="mb-3 flex gap-2">
              {[3, 4].map((n) => (
                <Button key={n} size="sm" variant={hotseats === n ? "default" : "outline"} onClick={() => setHotseats(n)}>
                  {n} jogadores
                </Button>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => {
                sfx("click");
                onStart({ mode: "hotseat", opts: hotseat(), viewerId: "p1" });
              }}
            >
              Abrir a mesa
            </Button>
          </section>
        ) : null}

        {more === "web" ? (
          <section className="wood-panel p-4">
            <h2 className="text-lg">Sala compartilhada</h2>
            <p className="text-muted-foreground mb-3 text-sm">Um código de 6 letras. Sem conta.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="text-xs">Bots:</span>
              {[0, 1, 2, 3].map((n) => (
                <Button key={n} size="sm" variant={bots === n ? "default" : "outline"} onClick={() => setBots(n)}>
                  {n}
                </Button>
              ))}
            </div>
            <Button
              className="mb-3 w-full"
              onClick={() => {
                sfx("click");
                onStart({ mode: "host", name, bots, setup });
              }}
            >
              Criar sala
            </Button>
            <div className="flex gap-2">
              <Input
                placeholder="Código"
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
        ) : null}
      </div>
    </div>
  );
}
