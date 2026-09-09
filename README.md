# Colonos — Ilha das Lanternas

Fan game educacional em pixel art com as **regras base de Catan**: tabuleiro hexagonal modular, dados, recursos, estradas/aldeias/cidades, ladrão, cartas de desenvolvimento e pontuação até 10 VP.

Identidade visual: paleta de madeira e ouro velho, tiles hexagonais 16-bit com a mesma linguagem de borda (prado) e de canto (clareira de terra), para o mapa parecer um mundo só. Casas assentam nas clareiras. HUD em bandeja de madeira. O motor em `src/core` é puro.

- **Solo**: você contra 3 bots heurísticos
- **Hot-seat**: 3–4 humanos no mesmo navegador
- **Sala web**: código de 6 caracteres, servidor autoritativo (WebSocket)

Catan é marca da Catan GmbH. Este repositório não é um produto oficial.

## Rodar localmente

```bash
npm install
npm test
npm run dev
```

Abre o cliente em `http://127.0.0.1:43123`. O proxy `/ws` aponta para o servidor na porta `43124`.

## Produção (Docker)

```bash
docker compose up --build
```

A aplicação escuta em `43123` (estáticos + WebSocket no mesmo processo).

## Render

Use o [`render.yaml`](render.yaml): serviço Docker com `PORT` injetado. Nenhuma chave de API é necessária.

## Arquitetura

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). O motor em `src/core` é puro TypeScript (`reduce(state, action)`); o cliente (PixiJS + React) e o servidor só hospedam esse reducer.
