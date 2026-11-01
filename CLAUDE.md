# Colonos — Ilha das Lanternas

Fan game of Catan's base rules in pixel art. Vite + React 19 + TypeScript + Tailwind v4 + PixiJS v8 (`@pixi/react`). Room server on `ws`.

## Commands

- `npm run dev` — client on 43123, room server on 43124 (Vite proxies `/ws`).
- `npm run check` — typecheck, lint, tests, build. Must stay green.
- `npm run sim -- 50` — 50 bot-only games with rule invariants; prints median rounds and trades.
- Dev scenes: `/?cena=fundacao|turno|construir|ladrao-dois-vizinhos|cartas|porto|troca|descarte|fim`.

## Layout

- `src/core` — pure rules. `reduce(state, action)` validates shape (`validate.ts`) then rules. Never trust actions: they arrive as raw JSON from the server.
- `src/ai/bot.ts` — deterministic heuristic bots (no `Math.random`). Goal planning, expansion search, trades, all dev cards.
- `src/client` — `BoardView.tsx` (Pixi board), `Hud.tsx` (tray: scrolling middle + fixed bottom band), `GameScreen.tsx` (layout, mobile bar).
- `src/server` — in-memory rooms. In dev it ignores `PORT` (that belongs to Vite).

## Decisions

- Trades: a responder `ACCEPT_TRADE`s; only the offerer closes with `CONFIRM_TRADE { with }`.
- Dev cards may be played before the roll (official rule). `freeRoads` remembers `after`.
- Ports are spread evenly around the coast; random maps never put 6/8 side by side.
- Roads are drawn as planks in the owner's color. Build targets: parchment dashes (roads) and rings (intersections).
- Camera frames the land plus docks, not the sea.

## Copy

Interface text in Brazilian Portuguese, no em dashes. Code and comments in English.

`docs/nuvem/` and `HANDOFF.md` are the previous (Grok) run's notes: history, not binding.
