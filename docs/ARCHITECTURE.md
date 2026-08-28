# RFC: Colonos — Catan Pixel Art (MVP)

Fan game educacional inspirado nas regras base de Catan (Catan GmbH). Produto: **Colonos**. UI em **pt-BR**. Escopo: regras base 3–4 jogadores (solo preenche com bots). Fora de escopo: Cidades e Cavaleiros, 5–6 jogadores, marítimos extras.

## Stack

- TypeScript estrito, Vite 6 + React 19, Tailwind + shadcn/ui
- PixiJS v8 + `@pixi/react` para o tabuleiro pixel-perfect (`NEAREST`)
- Motor puro em `src/core` (`reduce(state, action)` determinístico)
- Vitest para regras; `ws` autoritativo para salas
- Docker: estático + Node no mesmo processo em produção

## Princípio

`GameState` é um snapshot serializável. Toda jogada é uma `Action`. `reduce` valida regras e devolve o próximo estado ou `RuleError`. Solo e multiplayer usam o mesmo reducer. Clientes online só enviam intenções e recebem `PublicView` filtrada (mão própria; contagens alheias).

## Tabuleiro

Hexes pointy-top, axial `(q, r)`, cube `s = -q-r`. Terra: distância ≤ 2 (19 hexes). Vértices canônicos = 3 hexes adjacentes ordenados (54). Arestas = par ordenado de vértices (72). Portos: 9 arestas costeiras (4× 3:1, 5× 2:1).

## Turnos

Setup (aldeia+estrada, ida e volta) → loop: rolar → (7: descarte, ladrão, roubo) ou produção → comércio/construção/cartas → fim do turno. Vitória: 10 VP no próprio turno.

## IA

Heurística: pips × diversidade × portos; cidades > aldeias em 6/8; ladrão no líder; trocas que destravam o próximo build.

## Multiplayer

Salas em memória, código de 6 caracteres, `playerToken` para reconnect. Sem auth/DB. Sem chaves de API.
