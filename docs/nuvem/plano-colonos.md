---
cursor:
  subagentId: "bc-d66e646b-d5ce-439e-b500-3fbe5ce791bd"
---

# Plano: Colonos no seu melhor estado

Base: [avaliacao-colonos.md](./avaliacao-colonos.md). Norte visual aprovado: [visual-north.md](./visual-north.md). Preferências: o jogo precisa parecer um mundo que está sendo mexido. Peças e marcadores pertencem ao terreno. As bordas do mapa coincidem com estradas e casas.

Este plano foi escrito para o Grok 4.7 executar sem precisar redecidir nada. Cada pacote cabe numa sessão. Se uma frase deste plano conflitar com o código, vale o plano, salvo o item "Não tocar".

## Regras para todos os pacotes

1. Trabalhar no ramo `main` do repositório Colonos. Um commit por pacote (ou alguns, se o pacote for grande), mensagem em português, push ao final.
2. Pilha fixa: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + PixiJS v8 via `@pixi/react`. Não migrar para Phaser, não criar monorepo, não trocar de biblioteca de componentes.
3. Toda cópia nova em português do Brasil, sem travessão (—). Proibido: "rato", "rasto", "ecrã", "telemóvel", "Centrar", "registo", "acções". Usar: "mouse", "rastro", "tela", "celular", "Centralizar", "registro", "ações".
4. Antes de encerrar qualquer pacote, a partir do pacote 1: `npm run check` sai 0 (typecheck, lint sem erro, testes, build).
5. Dev server: `npm run dev` (Vite em `http://127.0.0.1:43123`, WebSocket em `:43124`). As checagens de navegador usam as "cenas de teste" criadas no pacote 1 (`?cena=...`).
6. Não editar nada no store do projeto (`/cursor/stores/...`) nem o outro repositório de Catan.
7. Pixel art: `roundPixels`, sem antialias, sem filtros de blur. Movimento em passos inteiros de pixel e cadência de 12 quadros por segundo nas animações de mundo.

---

## 1. Direção visual

### Paleta

Manter a paleta aprovada em `visual-north.md`. Acrescentar só tokens de luz e sombra, em `src/client/theme.ts`:

| Token | Hex | Uso |
| --- | --- | --- |
| `night` | `#1a1520` | fundo da interface |
| `seaDeep` | `#0c2433` | mar aberto, bordas da tela |
| `sea` | `#16344a` | mar perto da ilha |
| `foam` | `#9ad1e5` | espuma, só na costa |
| `shadow` | `#071018` | sombra dura das peças (alfa 0,35) |
| `lantern` | `#ffcf6b` | halo das lanternas das casas |
| `lanternCore` | `#fff1c2` | miolo do halo |
| `dirt` | `#7a5a38` | clareiras e caminhos |
| `dirtDark` | `#3a2818` | borda de clareira, estacas |
| `gold` | `#d4a017` | só na interface (HUD, botões); nunca como marcador sobre o mapa |

Regras de cor:

- A cor de facção (vermelho `#c44536`, azul `#2b6cb0`, laranja `#d97706`, marfim `#e8e0d0`) aparece só nas peças: telhado, bandeirola, fita da estaca, pedra-marco da estrada. Nunca em contorno, brilho ou faixa sobre o terreno.
- Dourado é cor de interface. Sobre o mapa, nada dourado pulsando.

### Luz

- Uma única direção de luz: do noroeste (cima à esquerda). Toda peça projeta sombra dura de 2 px para baixo e à direita, cor `shadow`, alfa 0,35. Nada de sombra borrada.
- Hora do dia fixa: fim de tarde. O mar escurece para `seaDeep` nas bordas da tela (vinheta em degraus de pixel, não gradiente suave).
- "Ilha das Lanternas": cada aldeia tem uma lanterna com halo pequeno (raio 10 px), cada cidade um halo maior (raio 14 px). Halo em 3 anéis concêntricos de pixel, `lantern` com alfa 0,10, 0,18 e 0,30, miolo `lanternCore`. Tremula alternando 2 quadros com fase aleatória por casa.

### Como as peças assentam no terreno

- Casa e cidade: âncora `{ x: 0.5, y: 0.9 }` exatamente no vértice, sobre a clareira de terra (`VertexPad`) que é parte do chão. Escala única de 0,82 para peça construída e para pré-visualização. Nada de "pular" de tamanho no hover.
- Estrada: caminho de terra (`DirtTrack`) com a pedra-marco da facção no meio. Continua como está; só ganha a animação de "abrir caminho" no pacote 5.
- Ladrão: anda pelo caminho hex a hex (já existe) e tem sombra própria.
- Números: deixam de ser disco de pergaminho flutuante. Viram marco plantado no centro do hex (estaca de madeira com placa ou pedra pintada; decisão de arte no pacote 8).
- Portos: deixam de ser um barco solto com texto no mar. Viram cais de madeira preso à aresta da costa, com placa entalhada mostrando o recurso (pacote 8).
- Marcadores de jogada legal, todos do mundo:
  - vértice legal: **estacas de agrimensor** (duas estacas de 1×5 px, madeira `dirtDark`, ponta na cor da sua facção, ligadas por um fio de 1 px) sobre a clareira;
  - aresta legal: o rastro de terra fraco que já existe (alfa 0,14, 0,34 no hover);
  - terreno legal para o ladrão: nenhum contorno. No hover, a sombra de uma nuvem escurece o hex (`shadow`, alfa 0,25) e o ladrão aparece em pré-visualização com alfa 0,5.

### Animação

- Um relógio único de animação para o tabuleiro inteiro (pacote 4). Nenhum componente com `useTick` próprio.
- Cadência de mundo: 12 quadros por segundo, passos inteiros de pixel.
- Durações fixas: casa cai 6 px em 180 ms com 3 quadros de poeira; estrada se desenha de uma ponta à outra em 240 ms; ladrão 90 ms por hex com pulo de 2 px; recurso produzido sobe 6 px e viaja até a casa dona em 420 ms; carta roubada pula da casa da vítima até a do ladrão em 360 ms.
- Ambiente (pacote 9): mar alterna 2 quadros a 2 fps, espuma alterna 2 deslocamentos a 1,5 fps, fumaça de cidade em 3 quadros a cada 2,5 s, lanternas tremulam.
- `prefers-reduced-motion`: desliga o ambiente e encurta as animações de evento para 1 quadro.

### O que pode ficar sobre o mapa

Permitido, e só isto:

1. Uma faixa de fase na base do tabuleiro, uma linha (duas no máximo quando houver instrução extra).
2. Botão "Sair" no canto superior esquerdo.
3. Controle de câmera compacto no canto inferior direito (vertical: aproximar, afastar, centralizar). Sem texto de dica.
4. Uma dica curta que segue o cursor ao passar sobre um alvo (custo, produção do vértice, taxa do porto). Some ao sair do alvo.
5. Barra de ações do celular (pacote 4), presa na borda de baixo, fora da área da ilha.

Proibido sobre o mapa: contorno dourado, ponto pulsante, domo de vidro, preenchimento chapado colorido sobre hex, texto solto no mar, a mesma frase de fase repetida em dois lugares, toasts para jogada ilegal (usar tremida da peça mais a faixa de fase).

---

## 2. Experiência do jogador

### Os primeiros cinco minutos

1. **Lobby (0 a 15 s).** Nome, mapa iniciante já marcado, botão grande "Sentar à mesa". Se houver partida salva, o primeiro botão é "Continuar partida" (pacote 7).
2. **Mesa carrega (até 2 s).** Painel de madeira com progresso real (já existe).
3. **Primeira aldeia (15 s a 1 min).** Faixa: "Escolha onde fundar sua primeira aldeia. Bons lugares tocam números altos." As estacas mostram os vértices legais. Passar sobre uma estaca mostra a dica "Produz: madeira ●●●●, trigo ●●●●●" (pontos = chance do número). Toque ou clique planta a aldeia, que cai com poeira.
4. **Estrada inicial.** Faixa: "Abra uma estrada a partir da aldeia." Só as arestas da aldeia nova aparecem.
5. **Vez dos bots na fundação.** Cada bot leva 900 ms por peça e a peça cai no mapa com o nome do bot na faixa ("Lenhadora fundou uma aldeia."). O jogador aprende vendo.
6. **Segunda rodada.** Igual, e os recursos iniciais viajam dos hexes até a aldeia nova.
7. **Primeiro turno (por volta de 1 min 30 s).** Faixa: "Sua vez: role os dados." Botão "Rolar dados" é o maior da tela. Ao rolar, os recursos saem dos hexes sorteados e voam até as casas; o contador da mão sobe quando o recurso chega.
8. **Construir.** A barra "Construir" mostra Estrada, Aldeia, Cidade e Carta, cada uma com o custo em fichas. Só o que dá para pagar fica aceso. Escolher "Estrada" mostra os rastros legais; fora desse modo o mapa fica limpo.
9. **Encerrar.** "Encerrar turno". Os bots jogam com as peças animadas no mapa.

### Fluxo do turno

- Estados visíveis, sempre na faixa: rolar, descartar, mover ladrão, escolher vítima, construir ou negociar, estradas grátis, fim.
- "Modo construção": no turno principal nenhum alvo aparece até o jogador escolher Estrada, Aldeia ou Cidade. Esc, botão direito ou tocar de novo no mesmo botão sai do modo. Na fundação, no ladrão e nas estradas grátis o modo é automático.
- Jogada ilegal: a peça treme 220 ms, toca o som de erro e a faixa mostra o motivo por 2 s. Sem toast.
- Ações irreversíveis no toque: primeiro toque pré-visualiza, segundo toque no mesmo alvo confirma (pacote 4). No mouse, um clique basta.

### Retorno

Cada evento do motor tem três respostas: no mundo (animação), som curto e uma linha no registro em português. Detalhe no pacote 5.

### Celular

- A ilha cabe inteira na tela ao abrir (ajuste automático). Pinça aproxima, dois dedos arrastam, um dedo arrasta só com zoom acima do ajuste.
- Barra de ações fixa embaixo: fichas da mão com contagem, ação principal (Rolar / Encerrar / Confirmar), "Construir", "Trocar", "Mesa". Um turno comum (rolar, uma estrada, encerrar) em no máximo 5 toques.
- Alvo de toque com no mínimo 44 px de tela, qualquer que seja o zoom.
- A folha "Mesa" fica com jogadores, registro e cartas; nada essencial ao turno mora só nela.

---

## 3. Pacotes de trabalho

Ordem por valor. Pacotes marcados com **[decisão de arte]** têm uma escolha visual que Lucas precisa aprovar; nesses casos o pacote diz o que implementar primeiro e o que fica esperando a escolha.

### Pacote 1: Base verde e servidor que não cai

**Objetivo.** O build volta a passar, o servidor de salas deixa de cair com qualquer mensagem e existem cenas de teste reproduzíveis para todos os pacotes seguintes.

**Arquivos.**

- `src/client/BoardView.tsx`: só a função `pickAt`. Trocar o `let best` capturado pela closure `consider` por um laço que devolve o melhor alvo sem closure (por exemplo, acumular candidatos num array `{ kind, id, d }[]` e reduzir no fim). O tipo de retorno é `{ kind: "vertex" | "edge" | "hex"; id: string; d: number } | null`. Isso elimina os 7 erros TS2339.
- `package.json`: scripts `"typecheck": "tsc -b --pretty false"` e `"check": "npm run typecheck && npm run lint && npm test && npm run build"`.
- `src/server/validate.ts` (novo): `parseClientMsg(raw: string): ClientMsg | null`. Regras: JSON objeto; `create` com `name` string de até 16 caracteres, `bots` inteiro de 0 a 3, `setup` `"beginner" | "random"`; `join` com `code` casando `/^[A-Z2-9]{6}$/` depois de `toUpperCase`, `name` até 16, `token` string opcional até 64; `start` sem campos; `action` com `action` objeto contendo `type` string e `playerId` string. Qualquer outra coisa devolve `null`.
- `src/server/index.ts`:
  - usar `parseClientMsg`; se `null`, responder `{ type: "error", message: "Mensagem inválida." }`;
  - envolver `handle` em `try/catch` no listener `message`; no `catch`, `console.error` e responder `"Erro no servidor. Tente de novo."`, sem derrubar o processo;
  - `new WebSocketServer({ server, path: "/ws", maxPayload: 4096 })`;
  - `ws.on("error", ...)` que só registra;
  - recusar `start` quando `room.state !== null` com `"A partida já começou."`;
  - `room.lastSeen = Date.now()` a cada mensagem; um `setInterval` de 60 s apaga salas sem socket humano há mais de 30 min (limpar `botTimer`);
  - token com `crypto.randomUUID()` em vez de `Math.random`.
- `src/dev/scenarios.ts` (novo, só em desenvolvimento): `buildScenario(name: ScenarioName): GameState`. Base: `createGame({ setup: "beginner", seed: 7, players: p1 "Você" vermelho, p2 Marinheiro azul, p3 Lenhadora laranja, p4 Mineiro marfim })`. Para avançar a fundação, criar a partida com os quatro `isBot: true`, rodar `nextBotAction` + `reduce` até a fase pedida, depois marcar p1 `isBot: false` e ajustar mãos, cartas e fase diretamente no objeto. Cenas:
  - `fundacao`: partida nova, vez de p1 fundar a primeira aldeia;
  - `turno`: fundação completa, p1 em `roll`, mão `{ wood: 2, brick: 2, sheep: 1, wheat: 2, ore: 3 }`;
  - `construir`: igual a `turno`, mas já em `main` com dado `[3, 4]` registrado e a mesma mão;
  - `ladrao-dois-vizinhos`: p1 em `moveRobber` (`after: "main"`); escolher um hex com aldeias de p2 e p3 e dar 2 cartas a cada um. Se a fundação da semente 7 não tiver esse hex, colocar uma aldeia de p3 num vértice livre desse hex respeitando a distância;
  - `cartas`: p1 em `main`, `devCards` jogáveis `knight`, `yearOfPlenty`, `monopoly`, `roadBuilding`, `playedDevThisTurn: false`;
  - `porto`: p1 com aldeia num vértice de porto 2:1 e 3 cartas do recurso desse porto, fase `main`;
  - `troca`: p1 em `main` com `{ wood: 3, brick: 1, sheep: 2, wheat: 0, ore: 0 }`, bots com 2 de cada;
  - `descarte`: p1 com 9 cartas, fase `discard` com fila `["p1"]`;
  - `fim`: p1 com 9 pontos e recursos para uma cidade, fase `main`.
- `src/client/useLocalGame.ts`: aceitar `initial?: GameState` opcional.
- `src/App.tsx`: em `import.meta.env.DEV`, se `?cena=<nome>` existir, abrir direto um `LocalMatch` solo com `buildScenario(nome)`, `viewerId: "p1"`.
- `tests/server-validate.test.ts` (novo): casos válidos e inválidos de `parseClientMsg`, incluindo `{"type":"join"}`, `"lixo"`, `bots: 9`, `code: "ab"`.
- `tests/scenarios.test.ts` (novo): cada cena constrói sem erro e está na fase prometida.

**Aceite.**

- `npm run check` sai 0.
- Servidor isolado aguenta lixo:

  ```bash
  (PORT=43198 timeout 15 npx tsx src/server/index.ts > /tmp/ws.log 2>&1 &) ; sleep 3
  node -e 'const W=require("ws");const w=new W("ws://127.0.0.1:43198/ws");w.on("open",()=>{w.send("{\"type\":\"join\"}");w.send("lixo");w.send(JSON.stringify({type:"create",bots:9}));setTimeout(()=>process.exit(0),800)})'
  curl -s -m 2 http://127.0.0.1:43198/ && echo VIVO
  ```

  Saída termina em `VIVO`; `/tmp/ws.log` não tem `TypeError` nem stack trace de processo encerrado.
- Navegador: `http://127.0.0.1:43123/?cena=fundacao` abre a mesa com a faixa pedindo a primeira aldeia; `?cena=ladrao-dois-vizinhos` abre já movendo o ladrão. Cada cena da lista abre sem erro no console.
- Navegador: criar sala na web, "Começar partida", e clicar de novo em "Começar partida" em outra aba do anfitrião (ou reenviar `start`): aparece "A partida já começou." e o tabuleiro não reinicia.

**Não tocar.** Regras em `src/core`, bots, visual do tabuleiro (exceto `pickAt`), sprites.

---

### Pacote 2: O jogador decide: ladrão, cartas e portos

**Objetivo.** Corrigir as jogadas em que hoje o jogo decide pelo jogador ou esconde informação: vítima do ladrão, Fartura, Monopólio, porto 2:1 sem recurso, registro em inglês, regra de banco sem cartas.

**Arquivos.**

- `src/client/BoardView.tsx`:
  - estado local `pendingRobberHex: string | null`;
  - `clickHex`: juntar todas as ações `MOVE_ROBBER` do hex. Se nenhuma tiver `stealFrom`, despachar a única. Se houver exatamente 1 vítima, despachar a ação dela. Se houver 2 ou mais, guardar `pendingRobberHex`, desenhar o ladrão em pré-visualização nesse hex e deixar clicáveis só as casas das vítimas nos vértices desse hex;
  - `pickAt` ganha o tipo `"victim"` (vértices com construção de vítima no `pendingRobberHex`, raio `VERTEX_PICK`);
  - clicar na casa da vítima despacha `MOVE_ROBBER` com `stealFrom`; clicar em outro hex legal troca o hex; `Esc` limpa;
  - faixa: "Escolha de quem roubar: toque numa casa vizinha ao ladrão.";
  - portos 2:1: desenhar `CHIP_SPRITE[port.resource]` (escala 0,75) ao lado do texto "2:1"; portos 3:1 continuam "3:1". Passar o mouse sobre o porto (novo tipo `"port"` no `pickAt`, raio 18) mostra a dica HTML "Porto de lã: 2 lã por 1 recurso à escolha" ou "Porto geral: 3 iguais por 1 à escolha".
- `src/client/Hud.tsx`:
  - enquanto `pendingRobberHex` existir (passar do `BoardView` via callback para `TableLayout`), mostrar também botões "Roubar {nome} ({n} cartas)" como alternativa acessível;
  - **Fartura**: um único botão "Jogar Fartura" abre um `Dialog` do shadcn com dois espaços e as 5 cartas de recurso; pode escolher o mesmo recurso duas vezes; botão "Pegar" despacha a ação legal com `resources: [a, b]` (procurar em `legal` qualquer ordem); recurso sem estoque no banco aparece apagado. Remover o `.slice(0, 5)`;
  - **Monopólio**: um botão "Jogar Monopólio" abre `Dialog` com as 5 cartas; escolher despacha;
  - troca com o banco: cada carta da mão mostra a melhor taxa ("4:1", "3:1" ou "2:1") abaixo do nome.
- `src/core/view.ts` e `src/core/types.ts`: `PublicView.you.bankRatios: Record<Resource, 2 | 3 | 4>` calculado com `bestBankRatio`.
- `src/core/reduce.ts`:
  - registro com nomes em português via `RESOURCE_LABEL` em minúsculas: `trocou 4 madeira por 1 minério`, `monopolizou trigo`, `O banco não tem trigo suficiente.`;
  - produção com banco curto, regra do almanaque, por recurso: se o banco cobre tudo, paga todos; se não cobre e só um jogador receberia, paga `min(devido, banco)`; se dois ou mais receberiam, ninguém recebe aquele recurso;
  - `END_TURN`: registrar "passou o turno" antes de `nextTurn`, com o nome de quem passou.
- `tests/rules.test.ts`: novos testes:
  - roubo com `stealFrom` tira de quem foi escolhido;
  - banco com 1 trigo e um único credor de 2 paga 1;
  - banco com 1 trigo e dois credores não paga ninguém;
  - log de `TRADE_BANK` contém "madeira" e não contém "wood";
  - `legalActions` com Fartura oferece `["ore","ore"]` quando o banco tem minério.

**Aceite.**

- `npm run check` sai 0, com os 5 testes novos.
- `?cena=ladrao-dois-vizinhos`: clicar no hex com duas vítimas não rouba ninguém ainda; a faixa pede a vítima; clicar na casa azul rouba do Marinheiro (registro: "Você roubou uma carta de Marinheiro."). Repetir a cena e clicar na casa laranja rouba da Lenhadora.
- `?cena=cartas`: "Jogar Fartura" permite pegar 2 minérios; a mão mostra +2 minério. Depois disso o botão de Monopólio fica apagado (uma carta de desenvolvimento por turno). Recarregar a cena: "Jogar Monopólio" abre o diálogo com 5 recursos e escolher trigo traz o trigo dos bots.
- `?cena=porto`: o porto 2:1 mostra a ficha do recurso; a carta desse recurso na mão mostra "2:1"; o hover no porto mostra a dica certa.
- Registro de uma partida inteira contra bots: nenhuma palavra `wood`, `brick`, `sheep`, `wheat` ou `ore`.

**Não tocar.** Visual dos marcadores (pacote 3), câmera, servidor, bots (exceto se um teste exigir ajustar a escolha de vítima: o bot continua mandando `stealFrom`).

---

### Pacote 3: Marcadores no chão, não sobre o mapa

**Objetivo.** Tirar do tabuleiro tudo o que é interface por cima do mundo e criar o "modo construção". É o pacote que mais atende à direção de Lucas. **[decisão de arte]**: o desenho das estacas. Implementar a versão procedural abaixo; Lucas aprova ou pede sprite depois, sem bloquear o pacote.

**Arquivos.**

- `src/client/GameScreen.tsx`: estado `buildMode: "road" | "settlement" | "city" | null` em `TableLayout`, zerado quando a fase muda ou depois de uma construção bem-sucedida. Passar para `BoardView` e `Hud`. Tecla `Esc` zera.
- `src/client/BoardView.tsx`:
  - filtros de alvo: no `main`, `settleTargets` só com `buildMode === "settlement"`, `cityTargets` só com `"city"`, `roadTargets` só com `"road"`. Em `setupSettlement`, `setupRoad`, `freeRoads` e `moveRobber`, alvos sempre visíveis;
  - apagar `PulseDot`, `RobberTarget` e `HarvestGlow`;
  - novo `SurveyStakes({ color })`: duas estacas verticais de 1×5 px em `x = -4` e `x = +4`, `y` de -6 a -1, cor `0x3a2818`; topo de 1×2 px na cor da facção; fio de 1 px entre os topos, `0xf4e8c8` alfa 0,5. Desenhado sobre o `VertexPad` com alfa 0,55;
  - vértice legal sem hover: `VertexPad` + `SurveyStakes`. Com hover: casa (ou cidade) da sua facção, alfa 0,65, mesma escala 0,82 das construídas. Remover o uso de `settlement-ghost.png` e `city-ghost.png`;
  - `moveRobber`: hex legal sem hover não muda. Com hover, preencher o hex com `0x071018` alfa 0,25 e desenhar o ladrão em pré-visualização com alfa 0,5;
  - número sorteado: em vez de escalar o marcador 1,08, subir 2 px por 600 ms (pixel inteiro);
  - mover o controle de câmera para o canto inferior direito, em coluna: "+", "−", "Centralizar" (ícones `lucide-react` `Plus`, `Minus`, `LocateFixed`, 32×32 px, classe `pixel-btn`). Tirar o texto "Zoom" e a dica da barra superior;
  - a faixa inferior de fase vira a única fonte de instrução; a segunda linha usa o texto de `boardHint` só quando houver alvo;
  - corrigir `boardHint`: "Toque no rastro de terra junto da aldeia.", "Arraste o mapa. A roda do mouse aproxima.", "Transforme a aldeia em cidade.".
- `src/client/Hud.tsx`:
  - remover a faixa `gold-ribbon` com `phaseCopy` (a fase fica só no tabuleiro);
  - trocar o painel "Custos" por "Construir": quatro botões em grade 2×2, cada um com o nome e as fichas do custo: Estrada, Aldeia, Cidade, Carta. Aceso quando existe ação legal correspondente (`BUILD_ROAD`, `BUILD_SETTLEMENT`, `BUILD_CITY`, `BUY_DEV`). Estrada, Aldeia e Cidade alternam `buildMode`; Carta despacha `BUY_DEV`. O botão do modo ativo fica pressionado.
- `src/client/copy.ts`: textos da faixa para `buildMode` ativo: "Escolha onde abrir a estrada.", "Escolha onde fundar a aldeia.", "Escolha qual aldeia vira cidade.".

**Aceite.**

- `npm run check` sai 0.
- `?cena=fundacao`, captura de tela: nenhum ponto dourado, nenhum domo de vidro, nenhuma casa translúcida fora do hover. Estacas visíveis nos vértices legais. Passar o mouse sobre uma estaca mostra a casa vermelha do mesmo tamanho de uma casa construída.
- `?cena=construir`: o mapa não mostra alvo nenhum. Clicar "Estrada" no painel Construir mostra só os rastros legais; `Esc` limpa; clicar "Aldeia" sem aldeia legal deixa o botão apagado.
- `?cena=ladrao-dois-vizinhos`: nenhum contorno dourado nos hexes; hover num hex legal escurece só aquele hex e mostra o ladrão translúcido.
- Sobre o tabuleiro existem só: "Sair", controle de câmera no canto inferior direito e a faixa de fase. Em nenhum momento a frase de fase aparece duas vezes na tela.

**Não tocar.** `src/core`, servidor, sprites de terreno, `DirtTrack` construído (só o fantasma entra no filtro de modo).

---

### Pacote 4: Câmera, toque e celular

**Objetivo.** A ilha cabe em qualquer tela, o celular joga um turno sem abrir a folha, e o tabuleiro para de redesenhar à toa.

**Arquivos.**

- `src/client/BoardView.tsx`:
  - **ajuste**: calcular os limites da ilha incluindo o anel de mar 3 (`seaRing` com distância 3). `fit = clamp(floor(min(w / largura, h / altura) * 0.94 * 4) / 4, 0.5, 2)`. O zoom passa a ser `fit * nivel`, com `nivel` em `[1, 1.5, 2, 3]` e teto absoluto 3;
  - roda do mouse: passo de um nível, aproximando em direção ao cursor (ajustar `pan` para manter fixo o ponto do mundo sob o cursor);
  - pinça: dois ponteiros ativos (`Map<pointerId, {x,y}>`) mudam o zoom continuamente entre `fit` e 3; ao soltar, arredondar para múltiplo de 0,25. Dois dedos movendo juntos arrastam. Um dedo só arrasta quando o zoom está acima de `fit`;
  - raio de toque em pixels de tela: `VERTEX_PICK_PX = 22`, `EDGE_PICK_PX = 16`, `HEX_PICK_PX = 40`, convertidos em mundo dividindo pelo zoom; com `pointerType === "touch"` multiplicar por 1,4;
  - confirmação no toque: com `pointerType === "touch"`, o primeiro toque num alvo legal só seleciona (pré-visualização + faixa "Toque de novo para confirmar"); o segundo toque no mesmo alvo despacha. Tocar em outro lugar cancela. Mouse continua com um clique;
  - `setHover` só quando `kind` ou `id` mudarem;
  - **relógio único**: criar `src/client/anim-clock.tsx` com `AnimClockProvider` (um `useTick` que atualiza `frame = floor(ms / 83)`, 12 fps, num store externo) e `useAnimFrame()` via `useSyncExternalStore`. Só os componentes animados (ladrão, futuros efeitos) assinam. O `BoardView` não re-renderiza por quadro;
  - camadas estáticas (anel de mar, `IslandBase`, sprites de terreno, `CoastFoam`, números, portos) dentro de um `pixiContainer` com `cacheAsTexture` ligado (Pixi v8), recacheado quando `view.board.hexes`, `robberHexId` ou as texturas mudarem;
  - contador só de desenvolvimento: `if (import.meta.env.DEV) window.__colonosBoardRenders = (window.__colonosBoardRenders ?? 0) + 1` no corpo do componente.
- `src/client/GameScreen.tsx`: no celular (`md:hidden`), barra fixa de 64 px na base com: fichas dos 5 recursos com contagem; botão principal derivado de `legal` na ordem `ROLL` → "Rolar dados", descarte pendente → "Descartar", `END_TURN` → "Encerrar turno"; botão "Construir" que abre um `Popover` com o painel Construir do pacote 3; botão "Mesa" que abre a folha atual. A faixa de fase fica logo acima da barra.
- `src/client/Hud.tsx`: extrair `BuildPanel` e `ResourceStrip` como componentes reutilizados pela barra do celular.

**Aceite.**

- `npm run check` sai 0.
- Navegador em 390×844 (emulação de dispositivo), `?cena=fundacao`: a ilha inteira e a costa aparecem sem arrastar; um toque numa estaca mostra a casa e "Toque de novo para confirmar"; o segundo toque funda.
- 390×844, `?cena=turno`: rolar, abrir "Construir", escolher Estrada, tocar duas vezes num rastro, "Encerrar turno": no máximo 6 toques e nenhum abre a folha "Mesa".
- 1440×900, `?cena=fundacao`: a ilha ocupa pelo menos 70% da altura da área do tabuleiro.
- Desempenho, console do navegador em `?cena=fundacao`: zerar `window.__colonosBoardRenders = 0`, esperar 5 s sem mexer: o valor continua 0. Mover o mouse por toda a ilha durante 5 s: valor final abaixo de 60.
- Gravação de 5 s no painel Performance do Chrome movendo o mouse sobre a ilha: nenhuma tarefa longa acima de 50 ms.

**Não tocar.** `src/core`, servidor, regras de marcador do pacote 3, arte.

---

### Pacote 5: Motor com eventos e retorno no mundo

**Objetivo.** Cada coisa que acontece no jogo aparece no mundo: recursos viajam, casas caem, estradas se abrem, cartas roubadas pulam. O cliente deixa de adivinhar eventos comparando estados.

**Arquivos.**

- `src/core/types.ts`: `GameEvent` (união):
  - `rolled { dice }`;
  - `produced { hexId, playerId, vertexId, resource, amount }`;
  - `built { kind: "road" | "settlement" | "city", id, playerId }`;
  - `robberMoved { from, to, playerId }`;
  - `stole { thief, victim, resource: Resource | null }`;
  - `discarded { playerId, count }`;
  - `tradedBank { playerId, give, take, ratio }`;
  - `tradedPlayers { from, to, give, take }`;
  - `devBought { playerId }`;
  - `devPlayed { playerId, card }`;
  - `award { kind: "longestRoad" | "largestArmy", playerId: PlayerId | null }`;
  - `won { playerId }`.
- `src/core/reduce.ts`: `ReduceResult` ok passa a ter `events: GameEvent[]`. Emitir nos pontos já existentes, sem mudar regra. Um `produced` por construção por hex.
- `src/core/view.ts`: `projectEventsFor(events, viewerId)`: em `stole`, `resource` vira `null` para quem não é ladrão nem vítima.
- `src/protocol.ts` e `src/server/index.ts`: mensagem `view` ganha `events` projetados.
- `src/client/useLocalGame.ts` e `src/client/useNetGame.ts`: expor `events` com número de sequência crescente.
- `src/client/fx/FxLayer.tsx` (novo): container Pixi acima das peças que consome a fila de eventos com as durações da seção 1:
  - `produced`: ficha `CHIP_SPRITE[resource]` (escala 0,5) sobe 6 px no centro do hex e anda em passos de pixel até o vértice dono;
  - `built`: peça cai 6 px com 3 quadros de poeira (quadrados de 2 px cor `dirt`);
  - `built` de estrada: o `DirtTrack` revela da ponta mais perto da rede até a outra;
  - `stole`: verso de carta (retângulo 6×8 `parchment` com borda `goldDark`) pula da casa da vítima à do ladrão;
  - `award`: bandeirola de 3 quadros sobre a casa mais recente do dono;
  - som por evento via `sfx`.
- `src/client/BoardView.tsx` e `src/client/Hud.tsx`: apagar os efeitos que detectam mudança por comparação (`prevDice`, `prevBuildings`, `pops`, `flash`) e ler da fila de eventos. Os contadores da mão sobem quando a ficha chega (atraso de 420 ms em `ResourceStrip`).
- Ritmo dos bots: `useLocalGame` espera a fila de efeitos esvaziar (no máximo 900 ms) antes da próxima ação de bot.
- `tests/events.test.ts` (novo): soma de `produced` por jogador bate com a variação da mão depois de `ROLL`; `stole.resource` é `null` na projeção de um terceiro; `built` sai em todas as construções.

**Aceite.**

- `npm run check` sai 0.
- `?cena=turno`, rolar: fichas saem dos hexes sorteados e chegam às casas; a mão só sobe depois que a ficha chega. Gravar vídeo curto.
- Turnos dos bots: cada aldeia cai com poeira, cada estrada se desenha; o registro continua em português.
- `?cena=ladrao-dois-vizinhos`, roubar: uma carta pula da casa da vítima para a sua.
- Nenhum `performance.now()` no corpo de render (`npm run lint` sem o aviso `react(purity)`).

**Não tocar.** Semântica das regras (só adicionar eventos), arte, câmera.

---

### Pacote 6: Troca entre jogadores

**Objetivo.** O jogador consegue propor troca para a mesa, os bots respondem cada um por si, e uma recusa não apaga a oferta para os outros.

**Arquivos.**

- `src/core/types.ts`: `GameState.offerSeq: number`; `TradeOffer.responses: Record<PlayerId, "pending" | "rejected">`.
- `src/core/reduce.ts`:
  - id da oferta `t${state.offerSeq++}` (hoje é `state.log.length`, que trava em 80 e repete);
  - `REJECT_TRADE` marca só a resposta de quem recusou; a oferta sai quando todos recusaram;
  - `CANCEL_TRADE` e `END_TURN` removem as ofertas do jogador do turno;
  - no máximo uma oferta aberta por vez;
  - `ACCEPT_TRADE` revalida as duas mãos.
- `src/core/legal.ts`: `REJECT_TRADE` só para quem ainda está `pending`.
- `src/ai/bot.ts`: `botTradeResponse(state, botId, offer)`: aceita se o que recebe reduz o que falta para cidade ou aldeia e se não entrega o último trigo ou minério quando já pode fazer cidade; senão recusa. Cada bot responde uma vez, com atraso de 600 a 1200 ms (via o motor de ritmo do pacote 5).
- `src/client/Hud.tsx`: painel "Trocar" com abas "Mesa" e "Banco".
  - Mesa: duas linhas de 5 contadores ("Você dá", "Você quer"), botão "Oferecer à mesa" (desabilitado com lado vazio ou sem as cartas), lista de respostas por jogador ("aguardando", "recusou", botão "Fechar com {nome}" quando o bot aceitar).
  - Banco: a troca de banco atual, com as taxas.
- `tests/trade.test.ts` (novo): id único com o log cheio; recusa de um mantém a oferta para os outros; aceitar sem cartas falha; oferta some no fim do turno.

**Aceite.**

- `npm run check` sai 0.
- `?cena=troca`: oferecer 2 madeira por 1 trigo. Em até 3 s cada bot mostra uma resposta. Se algum aceitar, as mãos mudam e o registro diz "Você trocou 2 madeira por 1 trigo com Lenhadora."
- Uma recusa de um bot não tira a oferta da lista dos outros.

**Não tocar.** Câmera, arte, servidor (além do que o tipo novo exigir para compilar).

---

### Pacote 7: Primeiros cinco minutos e fim de partida

**Objetivo.** Quem nunca jogou entende o que fazer; a partida tem começo guiado, fim celebrado, e sobrevive a uma recarga.

**Arquivos.**

- `src/client/Lobby.tsx`: texto do cartaz "Funde aldeias, abra estradas e chegue a 10 pontos." (tirar "tiles de três polegadas"); hot-seat "Passem o aparelho. 3 ou 4 pessoas, sem bots."; botão "Continuar partida" no topo quando existir `localStorage["colonos-solo-v1"]`.
- `src/client/useLocalGame.ts`: salvar o `GameState` em `localStorage["colonos-solo-v1"]` depois de cada ação (só solo); apagar no fim de jogo ou ao sair confirmando.
- `src/client/BoardView.tsx`: dica de produção ao passar sobre vértice legal na fundação: "Produz: madeira ●●●●, trigo ●●●●●" (pontos = pips do número, 1 a 5).
- `src/ai/bot.ts` ou o motor de ritmo: na fundação, 900 ms por peça de bot.
- `src/client/HowToPlay.tsx` (novo): `Dialog` com 5 páginas curtas (Objetivo, Fundação, Turno, Ladrão, Cartas), aberto pelo botão "?" no cabeçalho da HUD.
- `src/client/GameOver.tsx` (novo): `Dialog` no `gameOver` com ranking (pontos visíveis + cartas de ponto reveladas, maior estrada, maior exército), botões "Jogar de novo" (mesmas opções, semente nova) e "Voltar ao lobby".
- `src/client/GameScreen.tsx`: hot-seat com tela de passagem: quando `whoseTurn` muda para outro humano, cobrir a mesa com "Passe para {nome}" e o botão "Sou {nome}" antes de mostrar a mão.
- `src/client/copy.ts` e demais textos: varrer termos de Portugal (lista nas regras gerais).

**Aceite.**

- `npm run check` sai 0.
- Solo do lobby: recarregar a página no meio do turno e clicar "Continuar partida" volta ao mesmo estado (mesma mão, mesmas peças).
- `?cena=fim`: construir a cidade abre o diálogo de fim com o ranking; "Jogar de novo" começa outra partida.
- Hot-seat de 3: ao encerrar o turno, a mão do próximo só aparece depois de "Sou {nome}".
- `grep -rniE "\brato\b|rasto|Centrar|ecrã|telemóvel|cidadela" src` não encontra nada.

**Não tocar.** Regras, arte de terreno, servidor.

---

### Pacote 8: Portos, números e mar da ilha **[decisão de arte]**

**Objetivo.** Os três elementos que ainda parecem adesivo sobre o mapa passam a fazer parte da ilha.

**Decisões que Lucas precisa tomar antes (o Grok implementa a opção A se não houver resposta):**

1. Marcador de número: **A** estaca com placa de madeira (14×16 px, número entalhado, 6 e 8 em vermelho `#b24a32`) ou **B** pedra chata pintada (16×12 px).
2. Porto: **A** cais de tábuas saindo da aresta da costa com placa do recurso, sem barco, ou **B** cais com barco pequeno ancorado.
3. Mar: **A** uma textura contínua de água (`TilingSprite` 32×32) sob a ilha, sem hexes de mar, ou **B** manter os hexes de mar e redesenhar o sprite para não mostrar costura.

**Arquivos.**

- `scripts/generate-sprites.mjs` e `scripts/process-art.mjs`: novos sprites `token-stake.png` (ou `token-stone.png`), `port-pier.png` e `port-sign-{wood,brick,sheep,wheat,ore,any}.png` (placas 12×10), `sea-tile.png` (32×32, sem costura). Sem arte de terceiros.
- `src/client/assets.ts`: registrar os sprites novos em `BOARD_URLS`.
- `src/client/BoardView.tsx`:
  - `NumberToken` usa o sprite novo, com âncora na base (`y: 0.9`) plantado 6 px abaixo do centro do hex, e sombra de 2 px;
  - porto: cais desenhado a partir do ponto médio da aresta da costa para fora, rotacionado pela normal da aresta, placa no fim do cais. Remover o texto solto `pixiText` "2:1/3:1"; a taxa aparece na placa e na dica;
  - mar opção A: `pixiTilingSprite` cobrindo o retângulo do anel 4, abaixo da ilha; remover o laço `seaRing` de sprites.

**Aceite.**

- `npm run check` sai 0.
- `?cena=porto` em 3x: cada cais toca a aresta da costa nos dois vértices do porto; a placa mostra o recurso; nada de texto flutuando no mar.
- Captura em 1x: nenhuma costura hexagonal visível na água.
- Números legíveis em 1x a 1440×900 e a 390×844.

**Não tocar.** Sprites de terreno, regras, HUD.

---

### Pacote 9: Ilha viva: luz, ambiente e som **[decisão de arte]**

**Objetivo.** O mundo respira mesmo quando ninguém joga.

**Decisão de Lucas:** intensidade das lanternas (padrão: valores da seção 1) e se a ilha fica no fim de tarde (padrão) ou alterna dia e noite a cada rodada (não implementar sem aprovação).

**Arquivos.**

- `src/client/fx/Ambient.tsx` (novo), assinando `useAnimFrame()`:
  - mar com 2 quadros alternando a 2 fps (segundo quadro gerado deslocando a textura 1 px);
  - espuma com 2 deslocamentos (1,5 px e 2,5 px) a 1,5 fps;
  - halo de lanterna por aldeia e cidade (seção 1), 2 quadros de tremulação com fase por vértice;
  - fumaça de cidade, 3 quadros de 3×3 px subindo, a cada 2,5 s com fase por vértice;
  - sombra dura de 2 px sob casas, cidades e ladrão.
- `src/client/audio.ts`: ambiente gerado no WebAudio (ruído filtrado para mar e vento, ganho 0,02), começa no primeiro clique na mesa, respeita o mudo.
- `prefers-reduced-motion`: `Ambient` não monta.

**Aceite.**

- `npm run check` sai 0.
- Vídeo de 10 s parado em `?cena=construir`: água e espuma se mexem, lanternas tremulam, fumaça sobe das cidades.
- `window.__colonosBoardRenders` continua 0 em 5 s parado (o ambiente não re-renderiza o `BoardView`).
- Com "Som: mudo" nada toca; com som ligado, o ambiente é baixo e para ao sair da mesa.

**Não tocar.** Regras, HUD, arte de terreno.

---

### Pacote 10: Sala online que aguenta queda

**Objetivo.** Recarregar ou perder a rede não tira ninguém da partida; um jogador ausente não trava a mesa.

**Arquivos.**

- `src/client/useNetGame.ts`: guardar `{ code, token }` em `sessionStorage` (uma por aba); ao montar `NetMatch` com dados salvos, mandar `join` com `token`; reconectar sozinho com espera de 1, 2, 4 e 8 s; mostrar "Reconectando…" na faixa.
- `src/App.tsx`: entrar direto em `NetMatch` se a aba tiver sessão salva.
- `src/server/index.ts`:
  - `seats[].connected` no `lobby` e na `view`;
  - ping a cada 20 s e encerrar socket sem pong;
  - se o jogador da vez estiver desconectado há 60 s, o bot joga por ele até voltar ("{nome} caiu. Um bot segura a vez.");
  - mover o laço de bots para `src/ai/driver.ts` (novo), usado pelo servidor e pelo `useLocalGame`.
- `tests/server-room.test.ts` (novo): sobe o servidor numa porta livre, cria sala, entra, derruba o socket, reentra com token, recebe a `view`.

**Aceite.**

- `npm run check` sai 0.
- Duas abas na mesma sala: recarregar a aba do convidado volta para a mesma cadeira, com a mesma mão.
- Fechar a aba do jogador da vez: depois de 60 s o bot joga por ele; reabrir e voltar devolve o controle.

**Não tocar.** Regras, visual.

---

### Pacote 11: Bots justos e determinísticos

**Objetivo.** Bots reproduzíveis por semente, sem travar a partida, e um simulador que vigia as regras.

**Arquivos.**

- `src/ai/bot.ts`: tirar `Math.random()` (cavaleiro na rolagem); usar um rng próprio do bot derivado de `seed` da partida e do id do bot (mulberry32 de `src/core/rng.ts`), guardado fora do `GameState`. Estrada da fundação aponta para o vértice livre de maior pontuação a dois passos, em vez de `legal[0]`. Se o bot não construir há 20 turnos, priorizar carta de desenvolvimento e troca de banco que levem a uma estrada nova. Bots passam a jogar Monopólio (recurso que os adversários mais produzem) e Construção de Estradas (hoje essas cartas ficam paradas na mão deles). Estrada no turno principal escolhe a aresta que leva ao vértice livre de maior pontuação, em vez de `roads[0]`.
- `scripts/sim.ts` (novo) e script `"sim": "tsx scripts/sim.ts 50"`: 50 partidas de 4 bots (metade iniciante, metade aleatória), falha se `reduce` recusar uma ação que `legalActions` ofereceu, se recursos do banco + mãos não somarem 19 por tipo, ou se uma partida passar de 400 turnos.
- `package.json`: `check` passa a incluir `npm run sim`.

**Aceite.**

- `npm run sim` sai 0 e imprime partidas terminadas 50/50 e mediana de turnos.
- Duas execuções com a mesma semente geram o mesmo registro.

**Não tocar.** Regras, visual, servidor.

---

## 4. O que aproveitar do outro Catan (`cursor/rules-core-6a44`)

O código desse ramo não abriu nesta sessão (Origin respondeu 403). As recomendações abaixo vêm da RFC `architecture-rfc.md`, e o Grok deve portar a ideia, não arquivos.

Aproveitar, porque corrige fraqueza real do Colonos:

- `apply` devolvendo `events` (pacote 5): hoje o cliente adivinha eventos comparando estados.
- Troca doméstica fechada como um único comando depois do "sim", com `acceptDomestic` do bot (pacote 6): hoje a recusa de um bot apaga a oferta.
- Vítima do ladrão escolhida explicitamente (pacote 2).
- Regra de banco curto com exceção de credor único (pacote 2).
- Bot com rng próprio e só com a vista do jogador (pacote 11).
- `npm run sim` com invariantes e `typecheck` como critério de "estável" (pacotes 1 e 11).
- Token por assento em `sessionStorage` e `seats.connected` (pacote 10).

Não aproveitar: Phaser 4 (o Pixi já funciona e a troca não melhora nada que o jogador sinta), monorepo de pacotes, rolagem para decidir quem começa, comando `reveal-victory` (a vitória automática do Colonos com cartas de ponto ocultas é aceitável).
