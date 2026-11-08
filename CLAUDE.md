# Colonos — Ilha das Lanternas

Fan game of Catan's base rules in pixel art. Vite + React 19 + TypeScript + Tailwind v4 + PixiJS v8 (`@pixi/react`). Room server on `ws`.

## Commands

- `npm run dev` — client on 43123, room server on 43124 (Vite proxies `/ws`).
- `npm run check` — typecheck, lint, tests, build. Must stay green.
- `npm run sim -- 50` — 50 bot-only games with rule invariants; prints median rounds and trades.
- `npm run art` — redraws the HUD icons and cards, the board pieces (houses, cities and their two frames, ghosts, number token, pier, boat, road tiles from `src/art/pieces.ts`), the sea tile and the lobby poster (`scripts/art/`, seeded). Pass a folder to also get zoomed contact sheets. It never touches `robber-0/1.png` or the dice.
- Dev scenes: `/?cena=fundacao|turno|construir|ladrao-dois-vizinhos|cartas|porto|troca|descarte|fim`.

## Layout

- `src/core` — pure rules. `reduce(state, action)` validates shape (`validate.ts`) then rules. Never trust actions: they arrive as raw JSON from the server.
- `src/ai/bot.ts` — deterministic heuristic bots (no `Math.random`). Goal planning, expansion search, trades, all dev cards.
- `src/art` — pure procedural pixel art (island painter, props, `sculpt.ts` piece modeler, pieces, palette), shared by the client and `scripts/art.ts`.
- `src/client` — `BoardView.tsx` (Pixi board), `Hud.tsx` (tray: scrolling middle + fixed bottom band), `GameScreen.tsx` (layout, mobile bar).
- `src/server/rooms.ts` — in-memory rooms (`createRoomServer`, tested with real sockets in `tests/rooms.test.ts`). A seat belongs to its token: reloads and drops rejoin the same seat; after 60 s away a bot plays the seat until the person returns. `index.ts` only serves files; in dev it ignores `PORT` (that belongs to Vite).
- `src/client/NetMatch.tsx` + `useNetGame.ts` — online room: waiting room, table, ranking. The seat is kept per tab in `sessionStorage` (auto-resume on reload via `?sala=CODE`) and in `localStorage` for the lobby's "Voltar à sala" button.

## Decisions

- Trades: a responder `ACCEPT_TRADE`s; only the offerer closes with `CONFIRM_TRADE { with }`.
- Dev cards may be played before the roll (official rule). `freeRoads` remembers `after`.
- Ports are spread evenly around the coast; random maps never put 6/8 side by side.
- Roads are drawn as planks in the owner's color. Build targets: parchment dashes (roads) and rings (intersections).
- Camera frames the land plus docks, not the sea.
- The island is one painted world, not tiles: `src/art/world.ts` paints it per map in a Web Worker (`useIslandArt`), 2 texels per world pixel. Biome borders wobble and blend, the coast has its own outline (it only grows past the hexes, so coastal corners stay on land), earth strata show under the south shore, and trees or peaks may lean over neighbors. Props keep clear of the token, corners and road lines. Panels and buttons are blocks with a band of earth under them (`.wood-panel`, `.pixel-btn`).
- Icons are 16 px and cards 24x34 at native size: show them only at 1x or 2x so pixels stay crisp.
- **The robber (`robber-0/1.png`) is the style reference for the whole game** and is never regenerated. Everything on the board follows it: one texel per world pixel, painted large and averaged down (so nearly every pixel is its own color), volume lit from the upper left, hard edges with no outline, muted earth colors, warm lantern glows, and a two-frame idle on the robber's beat (`useIdleBeat`). Pieces are modeled as small 2:1 volumes in `src/art/sculpt.ts`; frame two is `name-1.png`.
- The island is painted at 2 texels per world pixel with smooth tones (`tone`, not ordered dither), then downsampled to one and graded (`grade`: cooler violet shadows, warmer lights, per-pixel grain).
- The table plays a soft sea ambience (WebAudio noise plus distant gulls) that starts on the first tap; the speaker button over the zoom controls mutes all sound and is remembered (`colonos-mute`).
- Each player's longest road is in the public view (`roadLength`) and shown in the player list.

## Copy

Interface text in Brazilian Portuguese, no em dashes. Code and comments in English.

`docs/nuvem/` and `HANDOFF.md` are the previous (Grok) run's notes: history, not binding.
