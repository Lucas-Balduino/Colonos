import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { CreateGameOptions } from "../core/types.ts";

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
    players: ["Vermelho", "Azul", "Laranja", "Branco"].slice(0, hotseats).map((n, i) => ({
      id: `p${i + 1}`,
      name: n,
      color: COLORS[i]!,
      isBot: false,
    })),
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 p-4">
      <header className="text-center">
        <p className="text-primary mb-1 text-xs tracking-[0.3em] uppercase">Ilha pixelada</p>
        <h1 className="text-5xl font-bold tracking-wide md:text-7xl">COLONOS</h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm">
          Funde aldeias, abre estradas e disputa 10 pontos de vitória nas regras base de Catan.
          Tabuleiro hexagonal, ladrão, cartas de desenvolvimento e bots com fome de tijolo.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Nova partida</CardTitle>
          <CardDescription>Escolha o mapa e como sentar à mesa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block text-sm">
            Seu nome
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant={setup === "beginner" ? "default" : "outline"} onClick={() => setSetup("beginner")}>
              Mapa iniciante
            </Button>
            <Button variant={setup === "random" ? "default" : "outline"} onClick={() => setSetup("random")}>
              Mapa aleatório
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => onStart({ mode: "solo", opts: solo(), viewerId: "p1" })}>
              Solo contra 3 bots
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              onClick={() => onStart({ mode: "hotseat", opts: hotseat(), viewerId: "p1" })}
            >
              Hot-seat ({hotseats} jogadores)
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span>Hot-seat:</span>
            {[3, 4].map((n) => (
              <Button key={n} size="sm" variant={hotseats === n ? "default" : "outline"} onClick={() => setHotseats(n)}>
                {n}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sala na web</CardTitle>
          <CardDescription>Mesmo código, amigos no navegador. Sem conta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs">Bots na sala:</span>
            {[0, 1, 2, 3].map((n) => (
              <Button key={n} size="sm" variant={bots === n ? "default" : "outline"} onClick={() => setBots(n)}>
                {n}
              </Button>
            ))}
          </div>
          <Button onClick={() => onStart({ mode: "host", name, bots, setup })}>Criar sala</Button>
          <div className="flex gap-2">
            <Input
              placeholder="Código da sala"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <Button variant="secondary" disabled={code.length < 4} onClick={() => onStart({ mode: "join", name, code })}>
              Entrar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
