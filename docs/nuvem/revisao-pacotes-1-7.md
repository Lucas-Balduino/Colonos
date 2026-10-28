---
cursor:
  subagentId: "bc-d66e646b-d5ce-439e-b500-3fbe5ce791bd"
---

# Revisão dos pacotes 1 a 7 do Colonos

Revisão de `main` em `931178b` (commits `8c7244c`, `8d7f36c`, `d11326a`, `40500cc`, `add175a`, `3244aa7`, `931178b`) contra `docs/plano-colonos.md`. Nenhum código foi alterado nesta revisão.

## Resumo

- `npm run check` sai 0 em `931178b`: `tsc -b`, `oxlint` sem erro, 7 arquivos de teste com 31 testes, `vite build`.
- 17 achados: **4 altos, 4 médios, 9 baixos**.
- Os três mais graves:
  1. O ajuste automático enquadra o anel de mar, não a ilha. No celular 390×844 a ilha ocupa 62% da largura e 26% da altura da tela.
  2. Na cena `troca`, nenhum bot aceita nenhuma das 122 ofertas justas possíveis. O aceite do pacote 6 nunca acontece no navegador.
  3. O bot fecha sozinho a troca que aceitou. O jogador não decide, e "Fechar com {nome}" falha no modo online.
- As animações do mundo do pacote 5 tocam de verdade: fichas viajam, a peça cai e o ladrão anda. Vídeos em `media/revisao/`.

## Como foi verificado

- Chrome headless (`--use-gl=swiftshader`) controlado por CDP, em 1440×900 e em 390×844 com emulação de celular e toque. Servidor de desenvolvimento em `http://127.0.0.1:43123`.
- Gravação por `Page.startScreencast` com diferença de pixels por recorte de hex (pacote 5).
- Enumeração em Node (`tsx`) de todas as ofertas justas na cena `troca` e em 300 mãos aleatórias, usando `botTradeResponse` do próprio código (pacote 6).
- Simulação de troca com `reduce` + `pendingBotTrades` para ver quem fecha a troca.
- Três partidas inteiras só de bots com `nextBotAction` para varrer o registro.
- Cliente WebSocket direto no servidor (`:43124`) para o `start` duplicado.

## O que passou

| Pacote | Checagem | Resultado medido |
| --- | --- | --- |
| 1 | `npm run check` | sai 0, 31 testes |
| 1 | Servidor com lixo | 3 respostas "Mensagem inválida.", `curl` imprime `VIVO`, sem stack no log |
| 1 | `start` repetido | segunda vez responde "A partida já começou." |
| 1 | 9 cenas | todas abrem sem erro no console |
| 2 | Vítima do ladrão | casa azul rouba do Marinheiro, casa laranja da Lenhadora |
| 2 | Fartura e Monopólio | +2 minério; Monopólio apagado depois; trigo 1 para 4 |
| 2 | Porto 2:1 | ficha no porto, "2:1" na carta, dica "Porto de lã: 2 lã por 1 recurso à escolha" |
| 2 | Registro sem inglês | 3 partidas inteiras de bots, 0 ocorrências de wood/brick/sheep/wheat/ore |
| 3 | `?cena=construir` | nenhum alvo até escolher Estrada; Esc limpa; Aldeia apagada |
| 3 | Sobreposições DOM | só "Sair", câmera e faixa nas 9 cenas |
| 4 | Toque duplo | 1º toque mostra "Toque de novo para confirmar", 2º funda ("Você fundou uma aldeia.") |
| 4 | Turno no celular | Rolar, Construir, Estrada, rastro, rastro, Encerrar: 6 toques, folha "Mesa" fechada |
| 4 | Contador de render | parado 5 s: 0; varredura de 5 s com 82 movimentos: 25 |
| 5 | Fichas | o número do hex sorteado faz a varredura e a ficha verde chega à casa (`p5-rolar-fichas-quadros.png`) |
| 5 | Mão segura a ficha | `useHeldResources` e `FlyingChip` usam os mesmos 420 ms a partir do mesmo lote |
| 5 | Bots na fundação | aldeias caem com cerca de 1 s entre peças |
| 5 | Ladrão | anda hex a hex até o alvo (`p5-ladrao-quadros.png`) |
| 6 | Respostas uma a uma | Marinheiro 794 ms, Lenhadora 973 ms, Mineiro 1163 ms; a recusa de um não tira a oferta dos outros |
| 7 | Recarregar no meio do turno | fase `main`, mesma mão, 16 peças, 19 linhas de registro depois de "Continuar partida" |
| 7 | `?cena=fim` | diálogo com ranking; "Jogar de novo" abre partida nova |
| 7 | Hot-seat de 3 | "Passe para Azul", mão escondida até "Sou Azul" |
| 7 | Termos de Portugal | o `grep` do plano não acha nada; nenhum travessão em texto de interface |

**Não conclusivo:** tarefas longas acima de 50 ms. Em swiftshader (GPU emulada por software) houve 58 tarefas de 50 a 88 ms durante a varredura do mouse. O ambiente não serve para medir isso. Repetir numa máquina com GPU.

---

## Achados

### A1. Alta. O ajuste automático enquadra o anel de mar, não a ilha

**O que está errado.** `computeFit` divide pela caixa do anel de mar 3 (678,96 × 616) e arredonda o zoom para baixo em passos de 0,25, com mínimo 0,5.

| Tela | Zoom | Ilha medida |
| --- | --- | --- |
| 390×844 (celular) | 0,5 | 242×224 px: 62% da largura, 26,5% da altura e 16,5% da área da tela |
| 1440×900 (computador) | 1,25 | terra ocupa 62% da altura do tabuleiro |

No computador, o aceite "70% da altura" só passa se contar o anel de mar como ilha (86%). No celular, os números dos hexes ficam ilegíveis. A raiz está no próprio plano (pacote 4 manda incluir o anel 3); o Grok seguiu a especificação.

**Onde.** `src/client/BoardView.tsx`, `SEA_EXTENT` (linhas 42 a 61) e `computeFit` (linhas 63 a 68).

**Evidência.**
- `media/revisao/p4-celular-390-fundacao.png`
- `media/revisao/p4-celular-390-turno.png`
- `media/revisao/p4-celular-390-toque-confirmar.png`

**Correção exata.**
1. Trocar `SEA_EXTENT` por `ISLAND_EXTENT`:
   - mesmo laço, com `cubeDistance({ q, r }) > 2` em vez de `> 3`;
   - devolver `{ width: maxX - minX + 52, height: maxY - minY + 52 }`. São 26 px de folga por lado para cais, barcos e espuma; o resultado é 536,97 × 500.
2. Nova `computeFit`:
   ```ts
   function computeFit(w: number, h: number): number {
     if (w < 8 || h < 8) return 1;
     const raw = Math.min(w / ISLAND_EXTENT.width, h / ISLAND_EXTENT.height);
     return Math.min(2, Math.max(0.35, Math.floor(raw * 16) / 16));
   }
   ```
3. Valores esperados:
   - 390×780 (tabuleiro do celular): 0,6875, terra com 333 px de largura (85%);
   - 1092×900 (tabuleiro do computador): 1,75, terra com 784 px de altura (87%).
4. Pinça, "Centralizar" e os níveis continuam usando `fitRef`; nada mais muda.

### A2. Alta. Na cena `troca` nenhum bot aceita troca justa

**O que está errado.** Enumerei as 122 ofertas justas que "Você" pode fazer na cena: mão `{madeira 3, tijolo 1, lã 2}`, dar até 3 e pedir até 2, dar pelo menos o que pede. **0 de 122** recebem aceite de algum bot, incluindo a do aceite "2 madeira por 1 trigo" (Marinheiro, Lenhadora e Mineiro recusam).

O motivo: cada bot tem 2 de cada recurso.
- A aldeia já está completa (falta 0).
- A cidade só precisa de minério, e o jogador não tem minério.
- `botTradeResponse` só aceita se a troca reduzir o que falta para cidade ou aldeia, então a recusa é garantida.

Em 300 mãos aleatórias a mesma heurística aceita 47,3% das ofertas justas. A regra funciona, mas a cena prova só o caminho da recusa. A linha "Você trocou 2 madeira por 1 trigo com Lenhadora." nunca aparece no navegador.

**Onde.**
- `src/dev/scenarios.ts`, cena `troca` (linhas 198 a 206).
- `src/ai/bot.ts`, `botTradeResponse` (linhas 69 a 87).

**Evidência.** `media/revisao/p6-troca-todos-recusam.png`: as três linhas dizem "recusou" 1,2 s depois da oferta.

**Correção exata.**
1. Em `scenarios.ts`, cena `troca`, depois do laço que dá 2 de cada:
   ```ts
   setHand(state, "p3", hand({ wood: 0, brick: 1, sheep: 1, wheat: 3, ore: 1 }));
   ```
   Com essa mão, a Lenhadora recebe 2 madeira e completa a aldeia (falta 1 vira 0). Ao dar 1 trigo fica com 2, e a cidade continua faltando 2. Marinheiro e Mineiro continuam recusando, então a cena mostra os dois caminhos.
2. Em `bot.ts`, ampliar a regra para todos os objetivos sem piorar o melhor deles. Substituir as linhas 78 a 80 por:
   ```ts
   const kinds = ["settlement", "city", "dev", "road"] as const;
   const before = kinds.map((k) => missingFor(player, k));
   const afterMissing = kinds.map((k) => missingFor(fake, k));
   const helps = afterMissing.some((m, i) => m < before[i]!);
   const worseBest = Math.min(...afterMissing) > Math.min(...before);
   if (!helps || worseBest) return "reject";
   ```
   Manter a regra do último trigo ou minério.
3. Em `tests/trade.test.ts`, novo teste: na cena `troca`, a oferta 2 madeira por 1 trigo recebe `"accept"` da Lenhadora (p3) e `"reject"` dos outros dois.

### A3. Alta. O bot fecha sozinho a troca que aceitou; online, "Fechar com" falha

**O que está errado.**

O ciclo hoje é este:
1. `tradeReply` devolve `ACCEPT_TRADE` também quando a resposta já é `"accepted"` (linha 93).
2. O primeiro `ACCEPT_TRADE` só marca `"accepted"`.
3. No timer seguinte (600 a 1200 ms), o próprio bot manda o segundo `ACCEPT_TRADE`, que executa a troca.

Simulação com `reduce` + `pendingBotTrades`:
- rodada 1: `REJECT p2`, `ACCEPT p3`, `REJECT p4`;
- rodada 2: `ACCEPT p3`, a oferta some e o registro diz "Você trocou 2 madeira por 1 trigo com Lenhadora.".

O botão "Fechar com Lenhadora" vive menos de 1,2 s e o jogador nunca decide.

No modo online é pior:
- o botão despacha `ACCEPT_TRADE` com `playerId` do bot (`Hud.tsx` linha 687);
- o servidor recusa com "Ação de outro jogador." (`src/server/index.ts` linha 221);
- os bots do servidor fecham a troca em 520 ms (linha 87).

**Onde.**
- `src/ai/bot.ts` linhas 89 a 101
- `src/core/reduce.ts` linhas 446 a 475
- `src/core/legal.ts` linhas 138 a 155
- `src/core/types.ts` (união `Action`)
- `src/client/Hud.tsx` linhas 680 a 700
- `src/server/index.ts` linha 87

**Correção exata.**
1. `types.ts`: nova ação `{ type: "CONFIRM_TRADE"; playerId: PlayerId; offerId: string; with: PlayerId }`.
2. `reduce.ts`:
   - `ACCEPT_TRADE` só aceita resposta `"pending"`, marca `"accepted"` e retorna;
   - apagar o ramo que executa a troca dentro de `ACCEPT_TRADE`;
   - novo `CONFIRM_TRADE`:
     - exige `offer.from === action.playerId` e `offer.responses[action.with] === "accepted"`;
     - revalida as duas mãos;
     - executa a troca com o mesmo `emit` e o mesmo registro de hoje, e remove a oferta.
3. `legal.ts`:
   - o dono da oferta recebe um `CONFIRM_TRADE` por jogador com `"accepted"`;
   - quem já aceitou não recebe mais `ACCEPT_TRADE`.
4. `bot.ts`, `tradeReply`: apagar a linha `if (response === "accepted") ...`. Bot nunca fecha troca alheia.
5. `Hud.tsx`, botão "Fechar com {nome}":
   ```ts
   onAction({ type: "CONFIRM_TRADE", playerId: youId, offerId: offer.id, with: player.id })
   ```
6. `server/index.ts`: o atraso das respostas de troca dos bots passa a usar `botTradeDelayMs()` em vez de 520 ms. `CONFIRM_TRADE` do dono passa na checagem de `playerId` sem mudança.
7. `src/server/validate.ts` já aceita qualquer `type`; nada a mudar.
8. Testes em `tests/trade.test.ts`:
   - bot com `"accepted"` não gera ação em `pendingBotTrades`;
   - `CONFIRM_TRADE` de quem não é dono falha;
   - `CONFIRM_TRADE` do dono troca as mãos e grava "Você trocou 2 madeira por 1 trigo com Lenhadora.".

### A4. Alta. No computador, "Encerrar turno" e o registro ficam abaixo da dobra

**O que está errado.** O pacote 6 pôs o `TradePanel` fixo no topo da coluna e trocou a coluna para `overflow-y-auto`. Medidas em 1440×900:

| Cena | Altura da coluna | Topo de "Encerrar turno" | Topo do registro |
| --- | --- | --- | --- |
| troca | 1091 | 935 | 995 |
| construir | 1091 | 935 | 995 |
| cartas | 1259 | 1103 | 1163 |

O jogador precisa rolar a coluna para encerrar o turno e para ler o registro.

**Onde.** `src/client/Hud.tsx`: linha 64 (`aside`), linhas 85 a 87 (`TradePanel`), linhas 174 a 223 (ações).

**Evidência.** `media/revisao/p6-hud-encerrar-abaixo-da-dobra.png`: cena `troca` sem rolar, sem "Encerrar turno" e sem registro na tela.

**Correção exata.**
1. Mover o bloco de ações (linhas 174 a 223) para logo depois do cabeçalho (linha 83), antes de tudo.
2. Tirar o `TradePanel` do fluxo fixo:
   - novo estado `tradeOpen`;
   - botão "Trocar" (`variant="outline"`) na linha de ações, visível quando existe `OFFER_TRADE` ou `TRADE_BANK` em `legal`;
   - `TradePanel` aparece logo abaixo das ações só quando `tradeOpen` for verdadeiro ou existir oferta sua aberta;
   - fechar o painel não cancela a oferta.
3. `aside` volta a `overflow-hidden`. O registro fica `min-h-0 flex-1 overflow-y-auto` no fim da coluna.
4. As cartas de desenvolvimento (linhas 159 a 172) passam a ser os próprios botões de jogar: um botão por carta jogável, sem a fileira de etiquetas repetida.

### M1. Média. Jogada ilegal não dá retorno nenhum

**O que está errado.** A seção 2 manda: a peça treme 220 ms, toca o som de erro e a faixa mostra o motivo por 2 s, sem toast. Nenhum pacote recebeu essa tarefa (lacuna do plano), e o código ficou assim:
- `invalid()` (`BoardView.tsx` linhas 423 a 427) chama `toast.error`, e nunca é chamado porque `pickAt` só devolve alvos legais;
- clicar fora de um alvo no modo construção não faz nada;
- a tremida move o mundo inteiro, não a peça;
- `useLocalGame.ts` linha 30 e `useNetGame.ts` linha 38 ainda mostram toast para erro de regra.

**Evidência.** `media/revisao/p1-toast-jogada-ilegal.png`: clique numa aresta ilegal em modo Estrada, sem toast, sem som, sem mudança na faixa.

**Correção exata.**
1. `pickAt` ganha um segundo resultado: com modo ativo (Estrada, Aldeia, Cidade, fundação, ladrão) e nenhum alvo legal no raio, devolver o vértice, a aresta ou o hex mais próximo do tipo do modo, com `illegal: true`.
2. No clique sobre um resultado `illegal`:
   - montar a ação (por exemplo `BUILD_ROAD` com aquele `edgeId`) e despachar;
   - o motor recusa com o motivo em português ("A estrada precisa se conectar à sua rede.", "A regra da distância não permite construir aqui.").
3. `useLocalGame` e `useNetGame`: trocar `toast.error(message)` por `setIllegal({ message, at: Date.now() })` exposto no retorno.
4. `BoardView`:
   - mostrar `illegal.message` como segunda linha da faixa por 2000 ms;
   - desenhar a peça fantasma no alvo recusado deslocando `x` em `+2, -2, +2` px nos quadros do relógio único por 220 ms;
   - `sfx("illegal")`.
5. Apagar `invalid()`, `shakeUntil` e o `toast` desses três arquivos.

### M2. Média. A dica de produção virou terceira linha da faixa

**O que está errado.** A seção 1 permite uma faixa de uma linha (duas no máximo) e uma dica que segue o cursor para "produção do vértice". O pacote 7 pôs "Produz: ..." como terceira linha da faixa. No celular a faixa fica com 3 linhas: "Rodada 1: funde uma aldeia no mapa." / "Toque de novo para confirmar" / "Produz: tijolo ●●●●●, tijolo ●●".

**Onde.** `src/client/BoardView.tsx` linha 892 (faixa) e linhas 895 a 901 (`tipRef`, hoje só porto).

**Evidência.** `media/revisao/p4-celular-390-toque-confirmar.png`.

**Correção exata.**
1. Apagar a linha 892.
2. No `tipRef`:
   - renderizar `produce` quando `active?.kind === "vertex"`, e `portHint` quando for porto;
   - posicionar com o mesmo código que já move a dica de porto.
3. No toque (`armed`), a segunda linha vira `Toque de novo para confirmar. ${produce}`. A faixa nunca passa de 2 linhas.
4. Juntar recursos repetidos: "tijolo ●●●●●●●" em vez de "tijolo ●●●●●, tijolo ●●". Somar pips por terreno antes de montar o texto.

### M3. Média. O celular não tem "Trocar" na barra

**O que está errado.** A seção 2 lista na barra do celular: fichas, ação principal, "Construir", "Trocar" e "Mesa". Também diz "nada essencial ao turno mora só nela [folha Mesa]". A barra tem fichas, ação, "Construir" e "Mesa"; a troca só existe dentro da folha.

**Onde.** `src/client/GameScreen.tsx` linhas 158 a 190.

**Evidência.** `media/revisao/p4-celular-390-turno.png`. A busca por botão "Trocar" em 390×844 não acha nada.

**Correção exata.**
1. Entre "Construir" e "Mesa", botão "Trocar" que abre um `Popover` (o mesmo de "Construir") com o `TradePanel`.
2. O botão fica apagado quando não há `OFFER_TRADE` nem `TRADE_BANK` em `legal`.
3. Para caber em 390 px:
   - fichas com `text-[10px]` e `gap-0.5`;
   - "Construir", "Trocar" e "Mesa" com `px-2`.

### M4. Média. Texto "2:1" e "3:1" dourado solto no mar

**O que está errado.** Os portos desenham `pixiText` com `fill: PALETTE.gold` no mar. A seção 1 proíbe texto solto no mar e dourado sobre o mapa.

**Onde.** `src/client/BoardView.tsx` linhas 1375 a 1387.

**Evidência.** `media/revisao/p2-porto-texto-dourado.png`.

**Correção.** Escopo do pacote 8 (cais com placa entalhada). Não corrigir no pacote de correção; registrar para o pacote 8 apagar o texto e usar a placa.

### B1. Baixa. Linha dourada no rastro de estrada em hover

**O que está errado.** O fantasma de estrada em hover desenha um retângulo de 1 px em `PALETTE.gold`, alfa 0,28. É quase invisível na tela (`media/revisao/p3-estrada-hover-dourada.png`, sem e com hover, ampliado 4×), mas fere a regra "dourado nunca sobre o mapa".

**Onde.** `src/client/BoardView.tsx` linhas 1081 a 1084.

**Correção exata.** Apagar as duas linhas do `if (hovered)` com `PALETTE.gold`. O hover passa a só subir o alfa do rastro de 0,14 para 0,34, como diz a seção 1.

### B2. Baixa. A faixa do ladrão se contradiz

**O que está errado.** Com `pendingRobberHex`, a faixa mostra "Escolha de quem roubar: toque numa casa vizinha ao ladrão." e logo abaixo "Clique num terreno para pousar o ladrão.".

**Onde.** `src/client/BoardView.tsx` linhas 882 a 891 e `boardHint` linha 929.

**Correção exata.** Quando `pendingRobberHex` existir, a segunda linha vira "Ou escolha outro terreno.".

### B3. Baixa. A cena `turno` não prova que a mão espera a ficha

**O que está errado.** A cena rola sempre 4+5 = 9, e o 9 não produz nada para "Você". O aceite do pacote 5 ("a mão só sobe depois que a ficha chega") não dá para observar. Pelo código, o atraso está certo.

**Onde.** `src/dev/scenarios.ts`, cena `turno`.

**Correção exata.** No fim da cena `turno`, procurar uma semente de dado que produza para p1:
```ts
for (let k = 1; k < 500; k++) {
  const probe = structuredClone(state);
  probe.rng = k;
  const r = reduce(probe, { type: "ROLL", playerId: "p1" });
  if (!r.ok || r.state.dice![0] + r.state.dice![1] === 7) continue;
  if (countResources(player(r.state, "p1").resources) > countResources(player(state, "p1").resources)) {
    state.rng = k;
    break;
  }
}
```
Teste em `tests/scenarios.test.ts`: rolar na cena `turno` aumenta a mão de p1.

### B4. Baixa. Texto em inglês e abreviações opacas

**O que está errado.**

| Onde | Hoje | Trocar por |
| --- | --- | --- |
| `src/client/Lobby.tsx` linha 141 | "Hot-seat" | "Mesmo computador" (igual ao botão) |
| `src/client/Lobby.tsx` linha 118 | "Fan game educacional" | "Jogo de fã, sem fins comerciais" |
| `src/components/ui/dialog.tsx` linhas 74 e 112, `src/components/ui/sheet.tsx` linha 80 | "Close" (leitor de tela) | "Fechar" |
| `src/client/HowToPlay.tsx` linha 60 | "Seguinte" (mais comum em Portugal) | "Próximo" |
| `src/client/Hud.tsx` linhas 518 a 520 | placas dos bots "10c" e "2A 0C 0K" ("K" vem de "knight") | `{cards} cartas` e `{settlements} aldeias · {cities} cidades · {knights} cav.`, igual à placa do jogador |
| `src/client/GameOver.tsx` linha 42 | título "Você chegou a 10" (sem "pontos") | `${winner.name} venceu com ${pontos} pontos` |

### B5. Baixa. A fundação não segue o roteiro dos primeiros minutos

**O que está errado.** A seção 2 define:
- "Escolha onde fundar sua primeira aldeia. Bons lugares tocam números altos.";
- "Abra uma estrada a partir da aldeia.";
- na vez dos bots, o nome do bot na faixa ("Lenhadora fundou uma aldeia.");
- "Sua vez: role os dados.".

Hoje a faixa diz "Rodada 1: funde uma aldeia no mapa.", "Ligue uma estrada à aldeia recém-fundada.", "Aguardando o rival fundar uma aldeia…" e "Role os dados (ou jogue um cavaleiro).".

**Onde.** `src/client/copy.ts` linhas 21 a 30.

**Correção exata.**
1. Usar os textos da seção 2.
2. Na vez de outro jogador na fundação, mostrar a última linha do registro (`view.log.at(-1)?.text`) em vez de "Aguardando o rival…".
3. A frase de rolar só cita o cavaleiro quando `PLAY_KNIGHT` estiver em `legal`.

### B6. Baixa. No hot-seat, a oferta para outra pessoa fica "aguardando" para sempre

**O que está errado.** Os outros humanos nunca veem a oferta, porque só a mão de quem está na vez aparece.

**Onde.** `src/client/Hud.tsx`, `OfferBoard` (por volta da linha 680).

**Correção exata.** Quando o jogador da linha for humano e a partida for local (`mode === "hotseat"`), mostrar dois botões nessa linha:
- "Aceitar por {nome}" despacha `ACCEPT_TRADE` com o `playerId` dele;
- "Recusar por {nome}" despacha `REJECT_TRADE`.

As pessoas estão no mesmo aparelho.

### B7. Baixa. O painel de ofertas pisca vazio

**O que está errado.** Quando a última recusa chega, a oferta sai do estado. A lista fica vazia por cerca de 100 ms (medido: vazia em 1054 ms, volta em 1163 ms) antes de `useShownOffer` mostrar a oferta recusada.

**Onde.** `src/client/Hud.tsx`, `useShownOffer` (linhas 631 a 655).

**Correção exata.** Guardar a última oferta vista num `useRef` atualizado durante o render. Quando `view.tradeOffers` perder a oferta, devolver o `ref` no mesmo render, sem esperar o efeito.

### B8. Baixa. O fim de partida online não tem diálogo

**O que está errado.** `GameOver` só aparece quando `onReplay` existe (partida local). Online, a partida termina só com a faixa "Fim de jogo.".

**Onde.** `src/client/GameScreen.tsx` linha 54 (`GameOver` só no ramo local).

**Correção exata.**
1. `src/core/view.ts`: com `phase.type === "gameOver"`, cada jogador da `PublicView` ganha `finalVp` (pontos totais) e `vpCards` (cartas de ponto reveladas).
2. `GameOver.tsx` passa a receber `view: PublicView` em vez de `state: GameState`, e lê esses campos.
3. Renderizar `GameOver` dentro de `TableLayout` sempre que `view.winnerId` existir. Isso cobre o modo online (`src/App.tsx` linha 188).
4. Sem `onReplay`, esconder "Jogar de novo" e manter "Voltar ao lobby".

### B9. Baixa. Botões de câmera abaixo do alvo de toque mínimo

**O que está errado.** A seção 2 pede alvo de toque de no mínimo 44 px. Os botões "+", "−" e "Centralizar" têm 32×32 px no celular, como o pacote 3 mandou.

**Onde.** `src/client/BoardView.tsx`, coluna da câmera (linhas 853 a 869).

**Correção exata.** Classe `size-11 md:size-8` nos três botões.

---

## Pacote de correção: revisão dos pacotes 1 a 7

**Objetivo.** A ilha enche a tela do celular e do computador, a troca entre jogadores tem aceite real e quem fecha é o dono da oferta, o computador encerra o turno sem rolar a coluna, e jogada ilegal explica o motivo na faixa.

**Arquivos.**

- `src/client/BoardView.tsx`:
  - `ISLAND_EXTENT` no lugar de `SEA_EXTENT` (anel 2 + 26 px de folga por lado) e `computeFit` com passo de 1/16 e mínimo 0,35 (achado A1);
  - `pickAt` devolve o alvo ilegal mais próximo no modo ativo; o clique despacha a ação, e o motivo do motor aparece na faixa por 2 s com a peça fantasma tremendo 220 ms; apagar `invalid()`, `shakeUntil` e `toast` (M1);
  - dica de produção dentro do `tipRef`, pips somados por terreno, faixa com no máximo 2 linhas (M2);
  - apagar o retângulo dourado do `DirtTrack` em hover (B1);
  - segunda linha "Ou escolha outro terreno." com `pendingRobberHex` (B2);
  - botões de câmera `size-11 md:size-8` (B9).
- `src/client/useLocalGame.ts` e `src/client/useNetGame.ts`: erro de regra vira `illegal { message, at }` no retorno, sem toast (M1).
- `src/core/types.ts`, `src/core/reduce.ts`, `src/core/legal.ts`: ação `CONFIRM_TRADE { playerId, offerId, with }`; `ACCEPT_TRADE` só marca `"accepted"` (A3).
- `src/ai/bot.ts`: `tradeReply` não age sobre `"accepted"`; `botTradeResponse` avalia aldeia, cidade, carta e estrada sem piorar o melhor objetivo (A2, A3).
- `src/server/index.ts`: atraso de resposta de troca dos bots com `botTradeDelayMs()` (A3).
- `src/dev/scenarios.ts`:
  - cena `troca` com Lenhadora `{ wood: 0, brick: 1, sheep: 1, wheat: 3, ore: 1 }` (A2);
  - cena `turno` com `rng` que produz para p1 (B3).
- `src/client/Hud.tsx`:
  - ações logo depois do cabeçalho;
  - `TradePanel` atrás do botão "Trocar";
  - `aside` sem rolagem e registro `flex-1`;
  - cartas de desenvolvimento como botões únicos (A4);
  - "Fechar com" despacha `CONFIRM_TRADE` (A3);
  - "Aceitar por" e "Recusar por" no hot-seat (B6);
  - `useShownOffer` sem piscar (B7);
  - placas dos bots por extenso (B4).
- `src/client/GameScreen.tsx`:
  - botão "Trocar" na barra do celular com `Popover` do `TradePanel` (M3);
  - `GameOver` dentro de `TableLayout` a partir da `PublicView`, também online, sem "Jogar de novo" (B8).
- `src/core/view.ts` e `src/client/GameOver.tsx`: `finalVp` e `vpCards` na view de fim de jogo; `GameOver` lê a view (B8).
- `src/client/copy.ts`: textos da fundação e do turno da seção 2; na vez do bot, a última linha do registro (B5).
- `src/client/Lobby.tsx`, `src/client/HowToPlay.tsx`, `src/client/GameOver.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`: textos do achado B4.
- `tests/trade.test.ts`:
  - Lenhadora aceita 2 madeira por 1 trigo na cena `troca`;
  - bot `"accepted"` não gera ação;
  - `CONFIRM_TRADE` só do dono;
  - `CONFIRM_TRADE` troca as mãos e grava o registro.
- `tests/scenarios.test.ts`: rolar na cena `turno` aumenta a mão de p1.

**Aceite.**

- `npm run check` sai 0, com os 6 testes novos.
- 390×844, `?cena=fundacao`: zoom 0,6875; os hexes de terra ocupam pelo menos 84% da largura do tabuleiro; os 9 portos aparecem inteiros sem arrastar; os números dos hexes são legíveis em captura.
- 1440×900, `?cena=fundacao`: os hexes de terra ocupam pelo menos 80% da altura do tabuleiro.
- `?cena=troca`, oferecer 2 madeira por 1 trigo:
  - em até 3 s, Marinheiro e Mineiro "recusou" e Lenhadora com o botão "Fechar com Lenhadora";
  - o botão continua lá por 10 s sem ninguém clicar e a mão não muda nesse tempo;
  - ao clicar, a mão muda e o registro diz "Você trocou 2 madeira por 1 trigo com Lenhadora.".
- Sala online com 2 bots, mesma troca para um bot que aceite: "Fechar com {nome}" executa a troca e não aparece "Ação de outro jogador.".
- 1440×900 em `?cena=troca`, `?cena=construir` e `?cena=cartas`, sem rolar e com "Trocar" fechado: "Encerrar turno" inteiro dentro de 900 px, primeira linha do registro visível, `aside.scrollHeight === aside.clientHeight`. Com "Trocar" aberto, "Encerrar turno" continua visível.
- 390×844, `?cena=troca`: tocar "Trocar" na barra abre o painel de troca sem abrir a folha "Mesa".
- `?cena=construir`, modo Estrada, clicar numa aresta longe da rede:
  - nenhum toast;
  - som de erro;
  - a faixa mostra "A estrada precisa se conectar à sua rede." por 2 s e volta;
  - só o fantasma da estrada treme.
- `?cena=fundacao` em 390×844, primeiro toque numa estaca: a faixa tem no máximo 2 linhas. Em 1440×900, passar o mouse sobre uma estaca mostra "Produz: ..." numa dica junto do cursor, fora da faixa.
- `?cena=turno`, rolar: a mão de "Você" sobe só quando a ficha chega à casa.
- Teste novo em `tests/events.test.ts` ou `tests/rules.test.ts`: `projectStateFor` de uma partida em `gameOver` traz `finalVp` e `vpCards` de todos os jogadores.
- `grep -rnE "Hot-seat|Fan game|\"Close\"|>Close<|Seguinte|\}K\b" src` não encontra nada.
- `grep -n "PALETTE.gold" src/client/BoardView.tsx` só encontra o texto de porto (pacote 8).

**Não tocar.** Arte de terreno e sprites, texto e desenho de porto (pacote 8), ambiente e lanternas (pacote 9), regras de jogo fora da troca, `docs/plano-colonos.md`.
