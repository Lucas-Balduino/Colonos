---
cursor:
  subagentId: "bc-f73fba86-b8b2-506b-a273-eed62236b28d"
---

# Contexto do projeto

RFC completo: [architecture-rfc.md](./architecture-rfc.md). As decisões abaixo estão travadas.

## Objetivo

Jogo web das regras base de Catan para 3 ou 4 jogadores, em pixel art original. Solo no browser, sem conta e sem chave. Sala em tempo real opcional, com o mesmo núcleo de regras como autoridade.

## Fora de escopo

Expansões, 5–6 jogadores, login, banco de dados, matchmaking, arte ou texto oficial da Catan GmbH, P2P.

## Restrições

- TypeScript strict. Node `>=22.12.0`. Monorepo npm workspaces.
- O núcleo é puro: sem DOM, Phaser, React ou `ws`. `apply(state, command)` não muta o estado de entrada.
- Sorteio só dentro do estado (`rng` mulberry32, d6 por rejeição). Mesma semente e mesmos comandos, mesmo resultado.
- Cliente de sala recebe `PlayerView`. Mão alheia e baralho de desenvolvimento não saem do processo que detém o estado.
- Bots são heurística fora do núcleo. Não entram na sala de rede nesta fase.
- Solo precisa funcionar sem servidor.

## Decisões travadas

- Tabuleiro: Phaser `4.2.1`, `render.smoothPixelArt: true`. Chrome: Vite 6 + React 19.
- Sala: Node + `ws` no mesmo HTTP server que serve o build estático. Path `/ws`.
- Testes: Vitest (`npm test` = `vitest run`). Estável exige também `typecheck`, `sim` e o build do cliente. Docker só depois disso.
- Grade: axial pointy-top, raio 2. 19 hexes, 54 vértices, 72 arestas, 9 portos. Terrenos 4/4/4/3/3/1 (floresta, pasto, campos, colinas, montanhas, deserto).
- Mapa padrão: embaralhamento com semente + espiral A–R a partir do canto oeste, anti-horário, pulando o deserto. Mapa de iniciantes é tabela futura, não bloqueia.
- Preparação em cobra. Turno intercala troca e construção depois do dado. Vitória aos 10, só no próprio turno.
- Pacotes: `@catan/rules`, `@catan/bots`, `@catan/client`, `@catan/server`.
- Ordem da Fase 2: regras com teste primeiro, cliente solo, bots, salas.

## Fase 2

Implementar a partir do RFC. Skills: `test-driven-development` no núcleo, `verification-before-completion` antes de declarar estável. Shell para os comandos de teste; pesquisa web só se a API citada do Phaser ou do `ws` tiver mudado.
