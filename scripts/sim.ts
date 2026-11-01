/** Plays bot-only games and checks rule invariants. Usage: npm run sim [-- games] */
import { createGame, reduce } from "../src/core/reduce.ts";
import { nextBotAction, staleBotOffer } from "../src/ai/bot.ts";
import { countResources } from "../src/core/resources.ts";
import { RESOURCES, type GameState } from "../src/core/types.ts";

const games = Number(process.argv[2] ?? 50);
const rounds: number[] = [];
const wins = new Map<number, number>();
let trades = 0;
let failures = 0;

function invariants(s: GameState): string | null {
  for (const r of RESOURCES) {
    const total = s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0);
    if (total !== 19) return `recurso ${r} soma ${total}`;
  }
  for (const p of s.players) {
    if (p.settlements.length + p.settlementsLeft !== 5) return `aldeias de ${p.name}`;
    if (p.roads.length + p.roadsLeft !== 15) return `estradas de ${p.name}`;
    if (p.cities.length + p.citiesLeft !== 4) return `cidades de ${p.name}`;
    if (countResources(p.resources) < 0) return "mão negativa";
  }
  return null;
}

for (let g = 1; g <= games; g++) {
  let s = createGame({
    seed: g * 7919,
    setup: g % 2 ? "random" : "beginner",
    players: [0, 1, 2, 3].map((i) => ({ name: `Bot${i}`, color: "", isBot: true })),
  });
  let steps = 0;
  while (s.phase.type !== "gameOver" && steps < 20000) {
    const a = nextBotAction(s) ?? staleBotOffer(s);
    if (!a) { console.log(`jogo ${g}: travou em ${s.phase.type}`); failures++; break; }
    if (a.type === "CONFIRM_TRADE") trades++;
    const r = reduce(s, a);
    if (!r.ok) { console.log(`jogo ${g}: ação ilegal ${a.type}: ${r.error.message}`); failures++; break; }
    s = r.state;
    const bad = invariants(s);
    if (bad) { console.log(`jogo ${g}: invariante quebrada: ${bad}`); failures++; break; }
    steps++;
  }
  if (s.phase.type === "gameOver") {
    rounds.push(s.turnNumber);
    const seat = s.players.findIndex((p) => p.id === (s.phase as { winner: string }).winner);
    wins.set(seat, (wins.get(seat) ?? 0) + 1);
  } else if (steps >= 20000) { console.log(`jogo ${g}: não terminou (rodada ${s.turnNumber})`); failures++; }
}
rounds.sort((a, b) => a - b);
const median = rounds[Math.floor(rounds.length / 2)];
console.log(`${rounds.length}/${games} terminaram. Rodadas: mediana ${median}, mín ${rounds[0]}, máx ${rounds.at(-1)}`);
console.log(`Vitórias por assento: ${[0, 1, 2, 3].map((i) => wins.get(i) ?? 0).join(" / ")}. Trocas entre jogadores: ${trades}`);
process.exit(failures ? 1 : 0);
