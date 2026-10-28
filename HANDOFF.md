# Handoff: Colonos, Ilha das Lanternas

Documento para continuar o projeto no PC, sem a sessão de nuvem. Escrito em 28 de outubro de 2026. O código neste commit é o de `main`, cabeça `931178b` ("A partida continua, ensina e termina."), mais este handoff e a cópia dos documentos da nuvem.

O jogo é um fan game educacional das regras base de Catan, para 3 ou 4 jogadores, em pixel art original. Catan é marca da Catan GmbH. Este repositório não é um produto oficial.

## Como ficar com o projeto no PC

Esta sessão roda numa máquina de nuvem. Ela não grava arquivos no disco do seu computador. O que dá para levar é o git.

1. Nesta conversa do agente, use o botão de criar repositório (o pill "Create repo") e escolha GitHub ou o forge que você usa. Isso publica `main` com este handoff.
2. No PC:

```bash
git clone <url-do-repositorio-que-voce-acabou-de-criar>
cd <pasta>
npm install
npm run dev
```

3. Abra `http://127.0.0.1:43123`. Precisa de Node `>= 22.12`.

`npm test` roda os testes. `npm run check` é o critério de "verde": typecheck, lint, testes e build. No commit `931178b` esse comando sai 0, com 7 arquivos e 31 testes.

Produção: `docker compose up --build`, porta `43123`. Há também `render.yaml`. Nenhuma chave de API.

## O que este repositório passou a conter

Antes, o plano, a revisão e as capturas viviam só no armazenamento do agente. Agora estão no git:

- `HANDOFF.md`: este arquivo.
- `docs/nuvem/`: plano, revisão, avaliação, norte visual, RFC antiga, notas e relatórios. Índice em `docs/nuvem/LEIA-ME.md`.
- `docs/evidencias/`: capturas da avaliação, dos pacotes 3, 4 e 6, e da revisão (incluindo dois vídeos curtos das animações).
- `docs/ARCHITECTURE.md`: arquitetura do código que realmente existe.
- `public/sprites/`: os 54 sprites que o jogo carrega.
- `src/`: o jogo.

Não entrou a pasta de arte intermediária gerada durante experimentos visuais (dezenas de folhas de sprite que o jogo não usa). O que o jogo desenha está em `public/sprites/`.

## Como o código está organizado

Pilha real, travada pelo plano: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, PixiJS v8 via `@pixi/react`. Não migrar para Phaser e não criar monorepo. A RFC em `docs/nuvem/architecture-rfc.md` ainda fala em Phaser e em pacotes `@catan/*`. Isso foi superado. Se a RFC e o código discordarem, vale o código e o `docs/nuvem/plano-colonos.md`.

| Pasta | Papel |
| --- | --- |
| `src/core` | Motor puro. `reduce(state, action)` devolve o próximo estado ou um erro. Sem DOM e sem Pixi. |
| `src/ai/bot.ts` | Heurística dos bots. Fica fora do motor. |
| `src/client` | Lobby, mesa, HUD, tabuleiro Pixi, efeitos, som, save solo. |
| `src/server` | Salas em memória, WebSocket em `/ws`, porta `43124` no dev. |
| `src/dev/scenarios.ts` | Cenas de teste, só em desenvolvimento. |
| `src/protocol.ts` | Mensagens do cliente e do servidor. |
| `tests` | Regras, eventos, troca, cenas e validação do servidor. |

Solo e sala usam o mesmo `reduce`. O cliente online recebe uma vista filtrada: a mão própria e só a contagem da mão dos outros.

Tabuleiro: hex pointy-top, axial `(q, r)`, terra até distância 2 (19 hexes, 54 vértices, 72 arestas, 9 portos). `HEX_SIZE` 56. Sorteio só pelo `rng` mulberry32 guardado no estado.

Modos: solo contra 3 bots, hot-seat de 3 ou 4 pessoas no mesmo aparelho, sala web com código de 6 letras. Sem conta, sem banco de dados, sem matchmaking. Fora de escopo: expansões e 5 ou 6 jogadores.

Partida solo salva em `localStorage["colonos-solo-v1"]`. O lobby mostra "Continuar partida" quando essa chave existe.

## Cenas de teste

Com `npm run dev`, em desenvolvimento:

`http://127.0.0.1:43123/?cena=fundacao`

As outras: `turno`, `construir`, `ladrao-dois-vizinhos`, `cartas`, `porto`, `troca`, `descarte`, `fim`. A definição está em `src/dev/scenarios.ts`.

## O que já foi feito

Pacotes 1 a 7 do plano, um commit cada, em `main`:

| Pacote | Commit | O que entregou |
| --- | --- | --- |
| 1 | `8c7244c` | Build verde, servidor que não cai com lixo, cenas `?cena=` |
| 2 | `8d7f36c` | Vítima do ladrão, Fartura, Monopólio, porto 2:1, registro em português |
| 3 | `d11326a` | Estacas no chão, modo construção, HUD sem faixa duplicada |
| 4 | `40500cc` | Câmera, toque com confirmação, barra do celular |
| 5 | `add175a` | Eventos do motor e animações no mapa |
| 6 | `3244aa7` | Troca entre jogadores, um bot de cada vez |
| 7 | `931178b` | Como jogar, fim de partida, continuar depois de recarregar, hot-seat |

Antes disso, o histórico construiu o motor, o lobby, o tabuleiro Pixi e a identidade Ilha das Lanternas.

## O que a revisão encontrou

A revisão está inteira em `docs/nuvem/revisao-pacotes-1-7.md`. Ela não confiou no relatório de "nenhum aceite falhou": reexecutou `npm run check` e jogou no navegador em 1440×900 e em 390×844. Resultado: 17 achados, 4 altos, 4 médios, 9 baixos. O código desses achados não foi corrigido. O pacote de correção, no fim daquele arquivo, é o próximo trabalho.

Os quatro altos:

1. A câmera enquadra o anel de mar, não a ilha. No celular 390×844 o zoom fica 0,5 e a ilha ocupa cerca de 62% da largura e 26% da altura. Correção: enquadrar a terra (anel 2) com 26 px de folga de cada lado e passo de zoom de 1/16. A frase que mandava incluir o anel 3 está no próprio plano, pacote 4. O plano, nesse ponto, está errado.
2. Na cena `troca`, nenhum bot aceita oferta justa. Das 122 ofertas justas possíveis, zero são aceitas, inclusive "2 madeira por 1 trigo". Os bots da cena já completaram a aldeia e só precisam de minério, que o jogador não tem. Com mãos aleatórias a mesma regra aceita cerca de 47%. A cena é que não prova o aceite.
3. O bot que aceita uma troca fecha a troca sozinho, cerca de 1 s depois. O botão "Fechar com {nome}" quase não aparece. Na sala online esse botão falha com "Ação de outro jogador.". Correção: ação `CONFIRM_TRADE`, só o dono da oferta fecha.
4. No computador, com o painel de troca aberto, "Encerrar turno" e o registro ficam abaixo da dobra. Em `troca` o botão está em y 935 numa tela de 900 px. Em `cartas`, em y 1103.

Médios que importam no dia a dia: jogada ilegal não treme a peça nem explica o motivo na faixa (e ainda existe toast); a dica "Produz: ..." virou uma terceira linha da faixa; o celular não tem "Trocar" na barra; o texto "2:1" dourado no mar é assunto do pacote 8.

Baixos: linha dourada no rastro em hover, faixa do ladrão contraditória, cena `turno` que não produz para o jogador, textos "Hot-seat", "Fan game educacional", "Close" e "Seguinte", placas "10c" e "2A 0C 0K", hot-seat sem como responder oferta de outra pessoa, painel de oferta que pisca vazio, fim de partida online sem diálogo, botões de câmera de 32 px.

O que a revisão confirmou como funcionando: servidor aguenta lixo, `start` repetido responde "A partida já começou.", as 9 cenas abrem, vítima do ladrão, Fartura, Monopólio, porto, registro sem as palavras wood/brick/sheep/wheat/ore, modo construção, toque duplo no celular, turno do celular em 6 toques sem abrir a folha Mesa, contador de render parado em 0, fichas e ladrão animados, recarga no meio do turno, diálogo de fim, tela "Passe para {nome}".

As animações do pacote 5 estão em `docs/evidencias/revisao/p5-rolar-fichas.mp4` e `p5-ladrao-roubo.mp4`.

## O que ainda não foi feito

Pacotes 8 a 11 do plano. Nenhum começou.

- Pacote 8, decisão de arte. Números plantados no hex, cais no lugar do texto no mar, mar sem costura. Se ninguém escolher, o plano manda a opção A: estaca com placa, cais sem barco, textura contínua de água.
- Pacote 9, decisão de arte. Mar, espuma, lanternas e fumaça animados, som ambiente baixo. Hora do dia fica no fim de tarde, salvo aprovação para alternar dia e noite.
- Pacote 10. Sala que sobrevive a recarregar a página, com token na aba, ping, e bot segurando a vez de quem caiu por 60 s.
- Pacote 11. Bots sem `Math.random`, mesma semente gera o mesmo registro, e `npm run sim` com 50 partidas vigiando as regras.

Ordem recomendada no PC: primeiro o pacote de correção da revisão, depois 8, 9, 10 e 11. Um commit por pacote, mensagem em português, `npm run check` verde antes de seguir.

## Regras que o plano impõe a quem continuar

- Trabalhar em `main`, salvo pedido explícito de outro ramo.
- Cópia nova em português do Brasil, sem travessão. Não usar "rato", "rasto", "ecrã", "telemóvel", "Centrar", "registo", "acções". Usar "mouse", "rastro", "tela", "celular", "Centralizar", "registro", "ações".
- Pixel art: `roundPixels`, sem antialias, sem blur. Animação de mundo a 12 quadros por segundo, em passos inteiros de pixel.
- Dourado é cor de interface. Sobre o mapa, a cor de facção só aparece nas peças.
- Sobre o mapa só podem ficar: a faixa de fase (no máximo duas linhas), o botão "Sair", o controle de câmera sem texto, uma dica que segue o cursor, e a barra do celular.
- Jogada ilegal: a peça treme 220 ms, toca o som de erro, a faixa mostra o motivo por 2 s. Sem toast. Isso ainda não está assim. É o achado médio 1.

## Preferências visuais

De `docs/nuvem/preferences.md` e do plano:

- Pixel 16-bit, madeira e ouro velho sobre noite, ilha vista de cima.
- Peças parecem parte do mundo: caminho de terra, casa na clareira. Nada de interface flutuando sobre o terreno.
- Paleta e detalhes em `docs/nuvem/visual-north.md` e na seção 1 de `docs/nuvem/plano-colonos.md`.

## Quadro de tarefas que existia na nuvem

Copiado de `docs/nuvem/notes.md`. Os links de sessão daquele arquivo não abrem fora da nuvem.

Feito: avaliação e plano, norte visual, sprites, visual da mesa, pacotes 1 a 3, pacotes 4 a 7.

Em aberto naquele quadro: decidir a arte das estacas, dos números e da luz. A revisão dos pacotes 1 a 7 foi concluída depois do quadro e está em `docs/nuvem/revisao-pacotes-1-7.md`. A fila seguinte é o pacote de correção e os pacotes 8 a 11.

## Onde olhar primeiro no PC

1. `HANDOFF.md` (este arquivo).
2. `docs/nuvem/revisao-pacotes-1-7.md`, seção "Pacote de correção".
3. `docs/nuvem/plano-colonos.md`, pacotes 8 a 11.
4. `npm run dev` e uma cena, por exemplo `?cena=troca`, para ver os achados altos com os olhos.
