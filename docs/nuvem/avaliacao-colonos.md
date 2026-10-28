---
cursor:
  subagentId: "bc-d66e646b-d5ce-439e-b500-3fbe5ce791bd"
---

# Avaliação do Colonos

Revisão completa do Colonos (ramo `main`, último commit `08a8b93`), em 26/10/2026. Plano de correção: [plano-colonos.md](./plano-colonos.md).

## Como foi avaliado

- Leitura de todo o código de jogo: `src/core`, `src/ai`, `src/client`, `src/server`, `tests`.
- `npm test` (15 testes, todos passam), `npx tsc -b` (falha), `npm run lint` (10 avisos), `npm run build` (falha).
- Simulação de 200 partidas só de bots contra o motor real, num script temporário fora do repositório.
- Teste de robustez do servidor de salas numa instância isolada (porta 43198).
- Partida solo no navegador contra 3 bots, em desktop, e capturas reais em celular (390×844, Chrome com emulação de toque).
- Comparação com a RFC do outro Catan (`architecture-rfc.md`). O código do ramo `cursor/rules-core-6a44` não abriu nesta sessão (Origin respondeu 403), então a comparação usa só a RFC.

Os achados estão em ordem de impacto em como o jogo se sente e se joga.

## O que está sólido

Antes dos problemas, o que não precisa mudar:

- **O motor de regras aguenta.** 200 partidas de 4 bots: nenhum erro de regra, nenhuma quebra de conservação (banco + mãos sempre 19 por recurso), nenhum mapa com 6 e 8 vizinhos, mediana de 32 turnos por partida, 90% terminam em até 42.
- **O motor é rápido.** Clonar o estado inteiro a cada ação custa 0,175 ms. Não é gargalo.
- **A arte de terreno por hex funciona.** As bordas dos hexes coincidem com estradas e casas, e as casas assentam no chão ([14-zoom-3x.png](../media/avaliacao/14-zoom-3x.png)).
- **Estrada como caminho de terra** já parece parte do chão.

---

## 1. O tabuleiro ainda fala como interface, não como mundo

**O que está errado.** Durante a fundação, todo vértice legal recebe um domo translúcido (o sprite `settlement-ghost.png`) mais um ponto dourado pulsando. São cerca de 50 domos cobrindo a ilha inteira. Quando o ladrão anda, os 17 hexes legais ganham um contorno dourado pulsando. Quando sai um número, o hex recebe um preenchimento dourado chapado. Por cima de tudo isso:

- uma barra de zoom com texto de dica ocupa o topo do mapa;
- a mesma frase de fase aparece duas vezes, no tabuleiro e na HUD.

**Onde.** `src/client/BoardView.tsx`: vértices nas linhas 544 a 583 (`PulseDot`, fantasma com alfa 0,55), `RobberTarget` (885 a 903), `HarvestGlow` (905 a 917), barra de zoom (587 a 609), faixa de fase (610 a 614). Em `src/client/Hud.tsx`, linha 88, a mesma frase.

**Por que importa.** É exatamente o contrário da direção de Lucas: os marcadores parecem adesivos de interface sobre o mapa, e o pedido é que pertençam ao terreno. O domo de vidro não existe nesse mundo. Na primeira tela do jogo, a ilha parece coberta por uma grade de botões.

![Fundação: domos em todos os vértices](../media/avaliacao/03-setup-hover-vertice.png)

![Fundação em 1x: barra de zoom e faixa de fase sobre o mapa](../media/avaliacao/02-setup-primeira-aldeia.png)

## 2. No celular, a ilha não cabe e o turno mora numa gaveta

**O que está errado.** Em 390×844:

- A ilha sai cortada nas duas laterais. O zoom 1x é fixo e não se ajusta à tela: a ilha tem cerca de 485 px de largura de mundo, e a tela tem 390.
- O tabuleiro ocupa 600 px de altura e deixa uma faixa escura vazia de 244 px embaixo, onde só existe o botão "Mesa".
- A barra de zoom cobre o topo do mapa.
- Para rolar dados, ver a mão ou encerrar o turno é preciso abrir a folha "Mesa", que cobre cerca de 80% da tela e começa repetindo a frase de fase.
- Não existe zoom de pinça.
- O raio de toque é medido em pixels de mundo (`VERTEX_PICK = 30`, `EDGE_PICK = 20`).
- Não há confirmação no toque, então um toque errado gasta recursos.

**Onde.** `src/client/BoardView.tsx` (zoom fixo nas linhas 126 e 376 a 379, raios nas linhas 23 a 26); `src/client/GameScreen.tsx` (linhas 58 a 85).

**Por que importa.** No celular, o jogo pede abrir e fechar uma gaveta várias vezes por turno, e o mapa, que é o mundo, aparece cortado.

![Celular: ilha cortada, faixa morta embaixo](../media/avaliacao/21-mesa-mobile.png)

![Celular: a folha Mesa cobre o jogo](../media/avaliacao/22-sheet-mobile.png)

## 3. O jogo escolhe por você de quem roubar

**O que está errado.** Para cada hex, `legalActions` gera uma ação `MOVE_ROBBER` por vítima, já com `stealFrom` preenchido. Ao clicar no hex, o tabuleiro pega a primeira ação daquele hex. Quando duas pessoas têm casas no hex, o roubo vai sempre para a primeira da lista, sem perguntar. Por isso a fase `steal` e os botões "Roubar {nome}" da HUD nunca aparecem pelo tabuleiro.

**Onde.** `src/core/legal.ts`, linhas 45 a 57; `src/client/BoardView.tsx`, `robberTargets` (linhas 207 a 213) e `clickHex` (324 a 329); `src/client/Hud.tsx`, linhas 259 a 271.

**Por que importa.** Escolher a vítima é a decisão tática do ladrão. Hoje ela não existe para o humano.

## 4. Não dá para propor troca a outro jogador

**O que está errado.**

- A HUD só mostra "Aceitar" em ofertas recebidas. Não existe tela para criar uma oferta, embora o motor aceite `OFFER_TRADE`.
- Se a oferta existisse, ela morreria na hora. `nextBotAction` percorre os bots, o primeiro que não gosta manda `REJECT_TRADE`, e `REJECT_TRADE` apaga a oferta para todos.
- O id da oferta é `t${state.log.length}-${id}`. O registro trava em 80 linhas, então os ids passam a se repetir.

**Onde.** `src/client/Hud.tsx` (só 290 a 305); `src/ai/bot.ts`, linha 90; `src/core/reduce.ts`, linhas 320 a 357.

**Por que importa.** Negociar é metade do Catan. Contra bots, a única troca possível é com o banco.

## 5. Porto 2:1 não diz qual recurso troca

**O que está errado.** Todo porto 2:1 usa o mesmo sprite `port-2.png` e o texto "2:1". O campo `port.resource` nunca é desenhado. A HUD também não mostra a taxa de cada recurso na troca com o banco.

**Onde.** `src/client/BoardView.tsx`, linhas 486 a 514.

**Por que importa.** Escolher onde fundar perto de um porto é uma decisão central, e o jogador não tem como saber o que cada porto oferece. Os cais à esquerda de [03-setup-hover-vertice.png](../media/avaliacao/03-setup-hover-vertice.png) mostram só "2:1".

## 6. Fartura e Monopólio mal servidos

**O que está errado.**

- O motor oferece 25 pares ordenados para Fartura. A HUD mostra só os 5 primeiros (`.slice(0, 5)`), que são todos madeira mais alguma coisa. Nunca dá para pegar dois minérios, por exemplo.
- Monopólio despeja cinco botões soltos na área de ações.

**Onde.** `src/client/Hud.tsx`, linhas 219 a 235; `src/core/legal.ts`, linhas 164 a 177.

**Por que importa.** Uma carta comprada fica quase inútil, e o jogador não entende por quê.

## 7. O mundo não reage nem respira

**O que está errado.**

- Produção é um brilho dourado de 0,7 s; nenhum recurso sai do hex e chega à casa.
- As peças dos bots aparecem prontas. A animação de surgir não anima: a escala usa `performance.now()` dentro do render e só muda quando algo de fora re-renderiza (linhas 281 a 296 e 557).
- Roubo, troca e carta comprada existem só como linha no registro.
- Os dados rolam só na HUD.
- O mar e a espuma são estáticos. Não há fumaça, luz nem som ambiente.
- A "Ilha das Lanternas" não tem lanternas acesas no tabuleiro.

**Onde.** `src/client/BoardView.tsx` (efeitos que comparam estados, linhas 254 a 296); `src/client/audio.ts` (só bipes de evento).

**Por que importa.** "Um mundo que está sendo interagido" pede que cada ação tenha consequência visível no mundo. Hoje o mundo é uma foto, e a história do turno dos bots fica escondida no registro.

![Meio de jogo: ilha parada, história no registro](../media/avaliacao/15-mesa-meio-de-jogo.png)

## 8. O build não passa

**O que está errado.** `npx tsc -b` dá 7 erros TS2339 em `BoardView.tsx`, nas linhas 389 e 402 a 404. A variável `best` de `pickAt`, atribuída dentro de uma closure, é estreitada para `never`. `npm run build` (`tsc -b && vite build`) para aí. `npm test` passa porque o Vitest não checa tipos.

**Onde.** `src/client/BoardView.tsx`, linhas 346 a 374.

**Por que importa.** `npm start` (produção) serve `dist/`, que não é gerado. O jogo não pode ser publicado, e qualquer agente que confie só em `npm test` acha que está tudo verde.

## 9. O servidor de salas cai com uma mensagem

**O que está errado.**

- Uma única mensagem `{"type":"join"}` derruba o processo inteiro (`TypeError: Cannot read properties of undefined (reading 'toUpperCase')` em `src/server/index.ts:126`), e com ele todas as salas. Não há validação de mensagem, `try/catch`, limite de tamanho nem `ws.on("error")`.
- O anfitrião pode mandar `start` de novo no meio da partida, e ela reinicia.
- Salas nunca expiram.
- O token de retorno é gravado no `localStorage` e nunca lido: recarregar a aba tira o jogador da sala.
- Quem cai durante a própria vez trava a mesa para sempre.

**Onde.** `src/server/index.ts` (linhas 84 a 223 e 260 a 266); `src/client/useNetGame.ts`.

**Por que importa.** O modo online não aguenta uso real. Entrar numa sala funciona: testei pelo proxy do Vite, e o convidado recebeu `joined` e `lobby`.

## 10. Números e mar emolduram a ilha como um tabuleiro de papelão

**O que está errado.**

- Os números são discos de pergaminho grandes, com cerca de um quarto da largura do hex, e dominam o terreno.
- O mar é feito de hexes, e o anel externo termina num hexágono em degraus sobre o fundo escuro. O mundo acaba numa borda geométrica visível.
- Os portos são barcos e cais soltos na água com texto ao lado.

**Onde.** `src/client/BoardView.tsx`: `NumberToken` (821 a 856), anel de mar (437 a 452), portos (486 a 514).

**Por que importa.** Esses três elementos são o que ainda faz a ilha parecer peça de tabuleiro físico, e não lugar.

![Ilha pequena no centro, mar em degraus](../media/avaliacao/15-mesa-meio-de-jogo.png)

## 11. Texto em inglês, em português de Portugal, e repetido

**O que está errado.**

- O registro mostra ids internos: "Lenhadora trocou 4 brick por 1 wheat", "monopolizou ore", "Banco sem ore suficiente" (`src/core/reduce.ts`).
- Há termos de Portugal na interface: "Toque no rasto de terra", "A roda do rato aproxima", "Centrar", "Passem o rato", "cidadela" (no resto do jogo é "cidade").
- A placa do jogador mostra "Você (você)".
- O lobby diz "tiles de três polegadas", meta-texto que não pertence ao mundo.

**Onde.** `src/core/reduce.ts`; `src/client/BoardView.tsx` (`boardHint`, 620 a 633); `src/client/Lobby.tsx` (76 e 130); `src/client/Hud.tsx` (102 e 121).

**Por que importa.** Quebra a imersão e o pedido explícito de português do Brasil.

![Registro com recursos em inglês](../media/avaliacao/13-log.png)

![Lobby no celular](../media/avaliacao/20-lobby-mobile.png)

## 12. Os primeiros cinco minutos e o fim não têm forma

**O que está errado.**

- Não há explicação nenhuma: o jogo abre direto na fundação, com cerca de 50 domos e a frase "Funde uma aldeia no mapa". Nada diz o que é um bom lugar; a produção do vértice não aparece no hover.
- Os bots fundam a 450 a 800 ms por peça, sem animação, e o jogador não vê o que aconteceu.
- O fim de jogo é uma faixa "Vitória: {nome}" na HUD, sem ranking e sem "jogar de novo".
- Recarregar a página perde a partida solo.
- No hot-seat, a mão do próximo jogador aparece na hora, sem tela de passagem.

**Onde.** `src/client/Lobby.tsx`, `src/client/Hud.tsx` (91 a 97), `src/client/useLocalGame.ts`, `src/client/GameScreen.tsx` (linha 24).

**Por que importa.** É o trecho que decide se alguém continua jogando.

![Primeira rolagem: a instrução está no mapa, o botão de rolar fica na coluna lateral](../media/avaliacao/05-primeira-rolagem.png)

## 13. Desempenho: o tabuleiro redesenha tudo o tempo todo

**O que está errado.**

- Cada `PulseDot`, cada `RobberTarget` e o ladrão têm um `useTick` próprio que faz `setState` a cada quadro. Na fundação, são cerca de 50 componentes React atualizando 60 vezes por segundo.
- `onPointerMove` chama `setHover` com um objeto novo a cada movimento do mouse, o que re-renderiza as 72 arestas, os 54 vértices e os 19 hexes, mesmo sem mudar o alvo.
- Nenhuma camada estática (mar, terreno, números, portos) usa cache.

**Onde.** `src/client/BoardView.tsx` (386 a 389, 644 a 650, 868 a 903).

**Por que importa.** Em celular médio, isso vira travada e bateria. E cada animação nova prevista no plano pioraria o quadro se o relógio não for único.

## 14. Arquitetura frágil no cliente

**O que está errado.**

- O laço dos bots vive num `useEffect` com `setTimeout` (`useLocalGame.ts`) e está duplicado no servidor (`scheduleBots`).
- Os eventos do jogo são adivinhados no cliente comparando estados (dados, ladrão, construções), em vez de virem do motor.
- O bot usa `Math.random()` (cavaleiro na rolagem, atraso), então a partida não se reproduz por semente.
- `projectStateFor` e `legalActions` rodam a cada render.
- Os 10 avisos do lint apontam o mesmo padrão: ref lida durante o render, `setState` dentro de efeito, `performance.now()` no render.
- Cobertura de testes: 15 testes, nenhum de troca, porto, maior estrada, maior exército, Monopólio, Fartura, roubo ou vitória, e nenhum do servidor.

**Por que importa.** Cada pacote visual do plano depende de eventos confiáveis e de um laço de bots fora do React. Sem isso, animação vira remendo.

## 15. Desvios de regra e bots

**O que está errado.**

- **Banco curto:** quando o banco não cobre a produção, ninguém recebe, mesmo que só um jogador tenha direito. O almanaque manda pagar o que houver nesse caso. Está em `src/core/reduce.ts`, produção.
- **Bots e cartas:** os bots nunca jogam Monopólio nem Construção de Estradas, e essas cartas ficam paradas na mão deles. Estrada da fundação é `legal[0]` e estrada do turno é `roads[0]`.
- **Bloqueio:** 1% das partidas só de bots (2 de 200) entram num ciclo de mais de 500 turnos: ninguém consegue construir, e eles só rolam, descartam e trocam com o banco.

**Por que importa.** Pouco visível para o humano, mas deixa os bots previsíveis e fracos, e a regra do banco é um erro objetivo.

---

## Comparação com o outro Catan

A RFC descreve soluções para seis fraquezas reais do Colonos:

- `apply` devolve `events`, o que resolve os achados 7 e 14.
- Troca doméstica fechada como um comando só depois do "sim", com a resposta do bot consultada antes, o que resolve o achado 4.
- Vítima do ladrão explícita no comando, o que resolve o achado 3.
- Regra do banco curto com a exceção do credor único, o que resolve o achado 15.
- Bot com rng próprio e lendo só a vista do jogador, o que resolve o achado 14.
- `typecheck` e simulação com invariantes como critério de "estável", o que resolve o achado 8 e o resto do 15.

O plano porta essas ideias, não arquivos. Não vale migrar para Phaser 4 nem para monorepo: o custo é alto e o jogador não sentiria diferença.

## Notas sobre a evidência

- As capturas de desktop vêm da partida jogada pelo agente de navegador. As de celular (20, 21, 22) foram refeitas com Chrome em 390×844 e toque emulado, porque as primeiras tinham saído em tamanho de desktop.
- Não houve um 7 nem carta de desenvolvimento na partida jogada. Os achados 3, 5 e 6 vêm do código e foram conferidos linha a linha; o pacote 1 do plano cria cenas de teste para reproduzi-los no navegador.
- O relatório `internal/colonos-quality-report.md`, do agente de navegador, diz que entrar em sala falha e que o celular não tem botão "Mesa". As duas coisas não se confirmaram: a entrada funciona pelo protocolo, e o botão existe em 390 px ([21-mesa-mobile.png](../media/avaliacao/21-mesa-mobile.png)).
