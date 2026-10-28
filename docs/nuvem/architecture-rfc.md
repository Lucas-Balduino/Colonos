---
cursor:
  subagentId: "bc-f73fba86-b8b2-506b-a273-eed62236b28d"
---

# RFC 01 — Arquitetura: Catan (regras base) em pixel art

Status: travado. A Fase 2 implementa este documento. Não há segunda passagem de arquitetura, salvo se uma restrição nova tornar uma decisão abaixo impossível.

Escopo: jogo web das regras base para 3 ou 4 jogadores. Sem Seafarers, sem cidades e cavaleiros, sem cenário de 5–6 jogadores. Arte original. O texto e a arte oficiais da Catan GmbH não são copiados para o repositório.

## 1. Stack

Monorepo npm workspaces, TypeScript strict, Node.js `>=22.12.0` (mínimo exigido pelo Vitest atual). Quatro pacotes, listados na seção 4.

| Decisão | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript | Pedido do projeto. O mesmo núcleo roda no browser e no servidor. |
| App cliente | Vite 6 + React 19 | Vite é o bundler com HMR e build estático que o template oficial `react-ts` já entrega. O Vitest exige Vite `>=6.4`. React só desenha o chrome (mão, troca, log, custos). |
| Tabuleiro | Phaser 4.2.x (`phaser` no npm, release 4.2.1 “Giedi”) | Framework de jogo: cenas, input, câmera, tweens, áudio e modo de pixel art. O tabuleiro cabe numa cena. A UI de cartas não cabe num canvas. |
| Pixel art | `render.smoothPixelArt: true` | O guia de pixel art do Phaser 4 manda usar `smoothPixelArt` quando o quadro é escalado. O tabuleiro escala com a janela. `pixelArt: true` fica reservado a sprite 1:1, que não é este caso. |
| Multiplayer | Servidor de salas em Node + biblioteca `ws`, estado autoritativo | O núcleo de regras já é a autoridade. O servidor aplica comandos e manda a vista de cada jogador. O cliente de browser usa `WebSocket` nativo. |
| Testes | Vitest (`vitest run`) | TypeScript sem `ts-jest`, o mesmo pipeline do Vite, ambiente `node` no núcleo. |
| Deploy | Um processo Node serve o build estático e o WebSocket no mesmo HTTP server | Solo local não sobe servidor e não pede chave. Docker fica para depois do critério “estável” da seção 5. |

Versões travadas na implementação: `typescript` atual estável 5.x, `phaser@4.2.1` (ou patch 4.2 posterior), `ws` 8.x, `vite` 6.x compatível com o Vitest, `react` 19. Não subir Phaser 3.

### Como o cliente se divide

O canvas do Phaser ocupa a ilha, peças, ladrão, portos e a animação dos dados. React monta o canvas uma vez:

- Criar o `Phaser.Game` num `useEffect` e chamar `game.destroy(true)` no cleanup.
- Ignorar o segundo mount do Strict Mode: se o game já existe, não criar outro. Guardar a instância num `ref`.
- A cena não importa React. A ponte é um objeto pequeno (`BoardApi`) que a cena expõe e o React chama: `setBoard`, `playEvents`, `onPick`.

React desenha mão, custos, troca doméstica, troca marítima, log, fase do turno e botões de construir. Texto e formulário ficam no DOM.

Coordenada de tela do hex (pointy-top, a mesma do Red Blob Games):

```ts
function hexToPixel(q: number, r: number, size: number) {
  return {
    x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
    y: size * (3 / 2) * r,
  };
}
```

`size` é o raio do hex em pixels do sprite (centro até o vértice). Arte desenhada para um `size` inteiro (64). A câmera enquadra a ilha; o filtro é o `smoothPixelArt`, não um CSS `image-rendering` por cima de um canvas já filtrado.

### Protocolo da sala

Um processo HTTP. `WebSocketServer` do `ws` anexado com `{ server }`, path `/ws`, no mesmo porto que serve `packages/client/dist`. Salas só em memória. Código de sala com 4 caracteres, sem banco.

Mensagens JSON, um objeto por frame de texto:

Cliente → servidor:

- `{ type: "create", name, seed? }` → cria sala, o criador é o assento 0.
- `{ type: "join", room, name, token? }` → entra ou retoma. `token` opaco por assento, o cliente guarda em `sessionStorage`.
- `{ type: "start", map: "variable" | "beginner", players }` → só o assento 0, com 3 ou 4 conectados. `players` nomeia quais assentos são humanos. Assento vazio não existe: todo assento é humano ou é preenchido no solo, não na sala. Sala é só humanos nesta fase. Bots não entram na sala.
- `{ type: "command", command }` → ver seção 3.
- `{ type: "leave" }`

Servidor → cliente:

- `{ type: "room", room, seat, token, seats: { name, connected }[] }`
- `{ type: "view", view: PlayerView, events: PublicEvent[] }`
- `{ type: "rejected", reason: RejectReason }`
- `{ type: "error", message }`

O servidor guarda `GameState` completo. Cada comando aceito substitui o estado (`apply` puro). Em seguida manda para cada socket só `projectView(state, seat)` e os eventos já filtrados. Mão alheia, ordem do baralho de desenvolvimento e tipo de carta de desenvolvimento ainda na mão não atravessam o socket. Recusar um comando não altera o estado; responde `rejected`.

Solo não abre socket. O mesmo `apply` roda no browser. A vista do humano é projetada do mesmo jeito, para o renderer não ler segredo por acidente.

## 2. Matemática do tabuleiro

Topologia conferida por enumeração (script sobre a grade axial, fusão de vértices por coordenada arredondada a 1e-5): **19 hexes, 54 vértices, 72 arestas**. Das arestas, 42 são internas (2 hexes) e 30 são costa (1 hex). Dos vértices, 24 tocam 3 hexes, 12 tocam 2, 18 tocam 1. Cada uma das 6 direções de costa tem 5 arestas. Isso é o tabuleiro base de 3–4 jogadores. O mapa de 5–6 não entra.

A frase “9 hexes de recurso” não descreve o jogo. Nove é o número de **portos**. Os hexes de terreno, no rulebook 3D oficial e na lista de componentes do almanaque 2020, são 19: floresta ×4, pasto ×4, campos ×4, colinas ×3, montanhas ×3, deserto ×1.

### Coordenadas

Pointy-top. Axial `(q, r)` com `s = -q - r`. `+q` aponta para leste. `+r` aponta para sudeste. É o sistema axial do Red Blob Games. Hex de terra: `max(|q|, |r|, |s|) <= 2`. São os 19.

```ts
type Axial = { readonly q: number; readonly r: number };

type Resource = "brick" | "lumber" | "wool" | "grain" | "ore";
type Terrain = Resource | "desert";

type CornerIndex = 0 | 1 | 2 | 3 | 4 | 5;
// 0 NE, 1 SE, 2 S, 3 SW, 4 NW, 5 N
// (y de tela cresce para o sul: y = 1.5 * r)

interface Hex {
  readonly id: HexId;          // "h:q,r"
  readonly q: number;
  readonly r: number;
  readonly terrain: Terrain;
  readonly number: number | null; // 2..12 exceto 7; null no deserto
}

type HexId = `h:${number},${number}`;
type VertexId = `v:${number},${number},${CornerIndex}`;
type EdgeId = `e:${VertexId}|${VertexId}`; // vértices canônicos, ordem lexicográfica
```

Direções de vizinho, a partir do leste, no sentido anti-horário da mesa:

```ts
const DIRS = [
  { q: +1, r:  0 }, // 0 E
  { q: +1, r: -1 }, // 1 NE
  { q:  0, r: -1 }, // 2 NW
  { q: -1, r:  0 }, // 3 W
  { q: -1, r: +1 }, // 4 SW
  { q:  0, r: +1 }, // 5 SE
] as const;
```

Distância entre hexes (Red Blob, forma `max`):

```ts
function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (-a.q - a.r) - (-b.q - b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}
```

### Vértice canônico

Cada vértice físico é até três endereços `(q, r, corner)`. A tabela abaixo foi gerada para o hex `(0,0)` e vale por translação. Para canonizar um endereço, somar cada delta, descartar hex fora da ilha, e escolher o triplo `(q, r, corner)` lexicograficamente menor. O `VertexId` usa esse triplo.

| corner | outros endereços do mesmo vértice `(dq, dr, corner)` |
|---|---|
| 0 NE | `(0,0,0)`, `(1,-1,2)`, `(1,0,4)` |
| 1 SE | `(0,0,1)`, `(0,1,5)`, `(1,0,3)` |
| 2 S | `(0,0,2)`, `(-1,1,0)`, `(0,1,4)` |
| 3 SW | `(0,0,3)`, `(-1,0,1)`, `(-1,1,5)` |
| 4 NW | `(0,0,4)`, `(-1,0,0)`, `(0,-1,2)` |
| 5 N | `(0,0,5)`, `(0,-1,1)`, `(1,-1,3)` |

Aresta do hex `i` liga o corner `i` ao corner `(i+1) % 6` e olha para o vizinho:

| edge `i` | corners | vizinho |
|---|---|---|
| 0 | 0–1 | E `(1,0)` |
| 1 | 1–2 | SE `(0,1)` |
| 2 | 2–3 | SW `(-1,1)` |
| 3 | 3–4 | W `(-1,0)` |
| 4 | 4–5 | NW `(0,-1)` |
| 5 | 5–0 | NE `(1,-1)` |

`EdgeId` não usa o índice do hex. Usa o par ordenado dos dois `VertexId`. Uma aresta costeira é a que tem um só hex. Teste de topologia exige 19 / 54 / 72, 30 costas, 42 internas.

Adjacências que o `BoardGraph` pré-calcula e o motor só consulta:

- `hexNeighbors: HexId → HexId[]`
- `vertexHexes: VertexId → HexId[]` (1 a 3)
- `vertexEdges: VertexId → EdgeId[]`
- `edgeVertices: EdgeId → [VertexId, VertexId]`
- `edgeHexes: EdgeId → HexId[]`
- `coastalEdges: EdgeId[]`

Distância de vértices: BFS nesse grafo. A regra da distância é: nenhum edifício (aldeia ou cidade, de qualquer um) num vértice a distância 1. Não assumir grau 3; vértice de costa tem grau 2.

### Portos

Nove portos. Multiconjunto travado: um 2:1 de cada recurso (`brick`, `lumber`, `wool`, `grain`, `ore`) e quatro 3:1 genéricos. Conferido no rulebook 3D (`Lumber x1 … Ore x1`, `3:1 x4`) e no almanaque (um porto especial por recurso; o 2:1 não vira 3:1 para outro recurso).

Slots: agrupar as 30 arestas costeiras pela direção do vizinho ausente. Cada grupo tem 5. Ordenar o grupo pela projeção do ponto médio da aresta no vetor tangente (a direção seguinte no ciclo anti-horário). Contagem de portos por lado, começando no lado Leste e seguindo E, NE, NW, W, SW, SE: `[2, 1, 2, 1, 2, 1]`. No lado de 1 porto, a aresta de índice 2. No lado de 2 portos, índices 1 e 3. Isso espelha a moldura física, que alterna peças de uma e de duas enseadas (6 peças, 9 enseadas).

```ts
type PortRatio = 2 | 3;

interface Port {
  readonly edge: EdgeId;
  readonly ratio: PortRatio;
  readonly resource: Resource | null; // null = 3:1 genérico
}
```

O jogador controla o porto se tem aldeia ou cidade em qualquer um dos dois vértices da aresta.

### Como o mapa é montado

`buildTopology()` não depende de terreno. Em seguida `placeMap` preenche terreno, número e tipo de porto.

Modo `variable` (padrão, e o único obrigatório para a primeira partida jogável). É o “Set-up, Variable” do almanaque:

1. Embaralhar os 19 terrenos com Fisher–Yates na semente da partida e atribuir aos 19 hexes em ordem `(q, r)` lexicográfica.
2. Números pela espiral alfabética. Letras A–R, valores conferidos no fio aceito do BoardGame Geek / StackExchange e repetidos no fio da 4ª/5ª edição: `5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11`.
3. A espiral começa no canto oeste `(-radius, 0)`, primeiro passo NE (índice 1), depois gira o índice de direção em `-1`. Anel 2, anel 1, centro `(0,0)`. Pular o deserto sem reordenar o resto. Esse caminho é contínuo (cada passo é vizinho axial) e, nos 19 desertos possíveis, nenhum 6 fica adjacente a um 6, 8 ou outro 8.
4. Embaralhar os 9 tipos de porto sobre os 9 slots.
5. Ladrão no deserto.

```ts
function ring(radius: number): Axial[] {
  let q = -radius;
  let r = 0;
  let dir = 1;
  const cells: Axial[] = [];
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      cells.push({ q, r });
      q += DIRS[dir].q;
      r += DIRS[dir].r;
    }
    dir = (dir + 5) % 6;
  }
  return cells;
}
```

Modo `beginner`: os mesmos 19 hexes e os mesmos 9 slots, com terrenos, números e tipos de porto copiados da Illustration A / R do PDF `catan_base_rules_2020_200707.pdf`. A camada de texto desse PDF não traz a figura, então a tabela é dado, não algoritmo: `packages/rules/src/board/beginner-layout.ts`. Testes exigem o multiconjunto de terrenos, os 18 números (um 2, um 12, dois de cada entre 3–6 e 8–11, zero 7), deserto sem número, ladrão no deserto, 6 e 8 não adjacentes, 9 portos no multiconjunto certo. Enquanto o arquivo não existir, `map: "beginner"` rejeita com `layout-not-available` e o cliente oferece só `variable`. Isso não bloqueia a Fase 2.

As peças iniciais desenhadas na ilustração de iniciantes (aldeias já colocadas) não são o fluxo do jogo. O fluxo travado é a preparação em cobra, abaixo, sobre o mapa `variable` ou `beginner`.

## 3. Fronteira do motor de regras

`packages/rules` não importa DOM, Phaser, React, `ws` nem o pacote de bots. Entrada e saída são dados serializáveis. `apply` não muta o estado recebido: ou devolve o estado novo, ou um erro.

```ts
type PlayerId = 0 | 1 | 2 | 3;
type ResourceBundle = Record<Resource, number>;

interface ApplyOk {
  ok: true;
  state: GameState;
  events: GameEvent[];
}
interface ApplyErr {
  ok: false;
  reason: RejectReason;
}
function apply(state: GameState, command: Command): ApplyOk | ApplyErr;
```

Sorteio vive dentro do estado, não no caller. `rng` é o `uint32` do mulberry32. Dado e roubo usam amostragem por rejeição (`nextUint32` enquanto `n > floor(2^32 / faces) * faces`, depois `% faces`), para o módulo não enviesar o d6. Teste de replay: mesma semente e mesmos comandos produzem o mesmo estado.

```ts
function mulberry32step(a: number): { next: number; value: number } {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = (t ^ (t >>> 14)) >>> 0;
  return { next: a >>> 0, value };
}
```

### Constantes do jogo base

Conferidas no almanaque 2020 (lista de componentes e seções Road, Settlement, City, Development, Harbors, Longest Road, Largest Army, Set-up Phase):

- Recursos no banco: 19 de cada (95 cartas).
- Desenvolvimento, 25 cartas: 14 knight, 5 victory-point, 2 road-building, 2 year-of-plenty, 2 monopoly. Embaralhadas na criação.
- Por jogador: 15 estradas, 5 aldeias, 4 cidades. Não se constrói sem peça no estoque.
- Custos: estrada `brick+lumber`; aldeia `brick+lumber+wool+grain`; cidade `grain×2+ore×3`; desenvolvimento `wool+grain+ore`.
- Vitória: 10, só no próprio turno.
- Estrada mais longa: 2 VP, mínimo 5, trilha sem repetir aresta.
- Exército maior: 2 VP, mínimo 3 cavaleiros jogados, só perde para quem tiver estritamente mais.
- Mão > 7 no 7: descarta `floor(n/2)`.

### Estado

```ts
type Phase =
  | { name: "setup-roll"; tied: PlayerId[] }
  | { name: "setup"; round: 1 | 2; seat: PlayerId; step: "settlement" | "road"; lastSettlement: VertexId | null }
  | { name: "roll" }
  | { name: "discard"; pending: PlayerId[] }
  | { name: "robber"; resume: "roll" | "act"; knight: boolean }
  | { name: "free-roads"; left: number }
  | { name: "act" }
  | { name: "game-over"; winner: PlayerId };

interface GameState {
  readonly seed: number;
  readonly rng: number;
  readonly turn: number;                 // incrementa ao encerrar um turno de jogo; 0 na preparação
  readonly map: "variable" | "beginner";
  readonly seats: readonly PlayerId[];   // ordem horária, comprimento 3 ou 4
  readonly active: PlayerId;
  readonly phase: Phase;
  readonly board: Board;                 // hexes, ports, graph
  readonly robber: HexId;
  readonly buildings: Readonly<Record<VertexId, { owner: PlayerId; kind: "settlement" | "city" } | null>>;
  readonly roads: Readonly<Record<EdgeId, PlayerId | null>>;
  readonly hands: Readonly<Record<PlayerId, ResourceBundle>>;
  readonly bank: ResourceBundle;
  readonly devDeck: readonly number[];   // ids, topo = [0]
  readonly devCards: Readonly<Record<number, DevCard>>;
  readonly playedDevThisTurn: boolean;
  readonly longestRoad: PlayerId | null;
  readonly largestArmy: PlayerId | null;
  readonly stock: Readonly<Record<PlayerId, { roads: number; settlements: number; cities: number }>>;
}

interface DevCard {
  readonly id: number;
  readonly kind: "knight" | "road-building" | "year-of-plenty" | "monopoly" | "victory-point";
  readonly where: "deck" | "hand" | "played";
  readonly owner: PlayerId | null;
  readonly boughtOnTurn: number | null;
}

type Command =
  | { type: "contest-roll" }
  | { type: "place-setup-settlement"; vertex: VertexId }
  | { type: "place-setup-road"; edge: EdgeId }
  | { type: "roll" }
  | { type: "discard"; cards: ResourceBundle }
  | { type: "move-robber"; hex: HexId; victim: PlayerId | null }
  | { type: "maritime-trade"; give: Resource; receive: Resource }
  | { type: "domestic-trade"; with: PlayerId; give: ResourceBundle; take: ResourceBundle }
  | { type: "build-road"; edge: EdgeId }
  | { type: "build-settlement"; vertex: VertexId }
  | { type: "build-city"; vertex: VertexId }
  | { type: "buy-dev" }
  | { type: "play-knight" }
  | { type: "play-road-building" }
  | { type: "place-free-road"; edge: EdgeId }
  | { type: "play-year-of-plenty"; first: Resource; second: Resource }
  | { type: "play-monopoly"; resource: Resource }
  | { type: "reveal-victory" }
  | { type: "end-turn" };
```

`domestic-trade` é o negócio já aceito. O núcleo não guarda oferta pendente nem chat. Quem pergunta ao outro humano ou ao bot é o cliente (solo) ou a UI; o comando só entra depois do sim. O núcleo recusa lado vazio, troca entre quem não está no turno, e estoque insuficiente. Jogadores que não são o ativo não trocam entre si.

### Máquina de turnos

Preparação (almanaque, Set-up Phase):

1. `setup-roll`. Cada assento manda `contest-roll` uma vez. Maior soma 2d6 começa. Empate: só os empatados rolam de novo. `createGame({ startingSeat })` pula esta fase; os testes e o atalho “o mais velho começa” usam isso. O assento vencedor vira o índice 0 da ordem horária.
2. Rodada 1, ordem `0..n-1`. Cada um: `place-setup-settlement`, depois `place-setup-road` numa aresta incidente a essa aldeia. Regra da distância vale. A estrada não exige rede prévia.
3. Rodada 2, ordem `n-1..0`. O mesmo par aldeia+estrada. A segunda aldeia não precisa conectar à primeira. Ao colocar a aldeia (não a estrada), o jogador recebe 1 carta de cada hex produtivo adjacente. Hex sem número não paga. Se o banco não tiver a carta, não paga aquela.
4. O assento 0 entra em `roll`. `turn` passa a 1.

Turno de jogo. A página curta das regras separa troca e construção; o almanaque manda o jogador experiente intercalar. O motor intercala. A UI pode, se quiser, só habilitar construção depois da primeira troca; o núcleo não exige essa ordem.

- `roll`: comando `roll`, ou `play-knight` antes do dado (ainda não comprou a carta neste turno; no máximo um desenvolvimento por turno). Vitória pública encerra. `reveal-victory` é legal aqui se o total oculto fechar 10.
- Dado ≠ 7: produção, fase `act`.
- Dado = 7: ninguém produz. Quem tem 8+ cartas entra em `discard` (qualquer ordem de `discard`). Quem não precisa é pulado. Depois `robber` com `resume: "act"`.
- `play-knight` a partir de `roll` abre `robber` com `resume: "roll"` (o dado ainda será rolado). A partir de `act`, `resume: "act"`. Cavaleiro não descarta mãos.
- `robber`: `move-robber` para outro hex, inclusive o deserto. Não pode ficar. `victim` é obrigatório se existe adversário com edifício adjacente; senão `null`. A carta roubada é uniforme entre as cartas da mão (contagem como peso). Mão vazia: ladrão move, roubo não tira carta. Em seguida a fase `resume`.
- `act`: trocas, construções, `buy-dev`, um desenvolvimento ainda não jogado neste turno, `reveal-victory`, `end-turn`. `end-turn` recusado se a fase não for `act`.
- `free-roads`: depois de `play-road-building`. `left` começa em `min(2, estoque de estradas)`. `place-free-road` obedece a regra normal de estrada, sem custo. Se não existe jogada legal, o comando com `edge` ausente não existe: o núcleo, ao entrar na fase, se `left === 0` ou não há aresta legal, volta já para `act`. O jogador não pode pular uma colocação legal.
- `game-over`: só `apply` recusa tudo, menos leitura.

Produção, por tipo de recurso, separada:

- Aldeia adjacente paga 1, cidade paga 2, somando se houver mais de um edifício no mesmo hex.
- Ladrão no hex: aquele hex paga 0.
- Se o banco cobre a soma, paga todos.
- Se não cobre e só um jogador receberia aquele recurso, paga `min(devido, banco)`.
- Se não cobre e dois ou mais receberiam, ninguém recebe esse recurso.
- Os outros recursos não são afetados. É o texto do almanaque (escassez, com a exceção de um único jogador).

Construção:

- Estrada: aresta vazia, incidente a estrada, aldeia ou cidade do jogador. Não atravessa edifício adversário (a aresta do outro lado não conta como conexa).
- Aldeia: vértice vazio, regra da distância, pelo menos uma estrada própria incidente. Na preparação a exigência da estrada é invertida (estrada depois).
- Cidade: só promove aldeia própria naquele vértice. A aldeia volta ao estoque. 2 VP, produção dobrada.

Desenvolvimento:

- Comprada vai para a mão com `boughtOnTurn = turn`. Não joga no mesmo turno, exceto carta de ponto, que não é “jogada”: é revelada no `reveal-victory`, inclusive no turno da compra, em qualquer quantidade.
- Um desenvolvimento de ação por turno (`playedDevThisTurn`). Ponto não liga essa trava.
- Cavaleiro fica `played` e conta para o exército.
- Ano da fartura: duas cartas do banco, podem ser iguais. Se o banco não tem, o comando é recusado; o jogador escolhe outro par. A carta só sai da mão se o comando passar.
- Monopólio: cada adversário entrega todas as cartas daquele recurso. Banco não entra.
- Construção de estradas: fase `free-roads`.

Estrada mais longa: no grafo das estradas do jogador, apagar vértices ocupados por adversário (os próprios edifícios não cortam). Comprimento = trilha mais longa sem repetir aresta (DFS; no máximo 15 arestas). Bifurcação não soma, porque uma trilha entra e sai do vértice por duas arestas. Laço conta todas as arestas do ciclo, porque a trilha não repete aresta. Recalcular depois de estrada ou aldeia.

- Primeiro a atingir 5 ou mais, sozinho, recebe a carta.
- Outro com comprimento estritamente maior toma a carta.
- Se o dono é cortado e empata com outro, mantém a carta.
- Se ninguém tem a única maior com pelo menos 5, a carta volta para o lado (ninguém ganha os 2 VP).

Exército: o primeiro com 3 cavaleiros virados recebe. Só perde para contagem estritamente maior. Cavaleiro não volta, então não há “empate devolve”.

Vitória, só com `active` no próprio turno, fora de `discard`, `robber` e `free-roads`:

- VP público = aldeias×1 + cidades×2 + 2 se tem a estrada mais longa + 2 se tem o exército.
- VP total = público + cartas `victory-point` na mão.
- Público ≥ 10 depois de um comando: fase `game-over` na hora.
- Total ≥ 10 com ponto oculto: não encerra sozinho. `reveal-victory` encerra e os eventos tornam essas cartas públicas.

### Vista

```ts
interface PlayerView {
  readonly you: PlayerId;
  readonly phase: Phase;
  readonly active: PlayerId;
  readonly board: Board;          // terreno, número, porto, ladrão: públicos
  readonly buildings: GameState["buildings"];
  readonly roads: GameState["roads"];
  readonly bank: ResourceBundle;  // pilhas abertas
  readonly hand: ResourceBundle;  // só a sua
  readonly handCounts: Readonly<Record<PlayerId, number>>;
  readonly yourDev: readonly DevCard[];
  readonly devCounts: Readonly<Record<PlayerId, number>>; // mão, sem tipo
  readonly knightsPlayed: Readonly<Record<PlayerId, number>>;
  readonly deckCount: number;
  readonly longestRoad: PlayerId | null;
  readonly largestArmy: PlayerId | null;
  readonly publicVp: Readonly<Record<PlayerId, number>>;
  readonly yourTotalVp: number;
}
```

`legalCommands(view)` pode rodar no cliente para habilitar botão, porque o jogador conhece a própria mão. O servidor chama `apply` de novo e ignora o palpite do cliente.

### Bots

`packages/bots` depende só de `rules`. Não desenha e não abre socket. Entrada: `PlayerView` do assento do bot mais um `rng` próprio (não o `rng` da partida). Saída: um `Command` legal.

```ts
function chooseCommand(view: PlayerView, rng: () => number): Command;
```

Heurística, nesta ordem, sem busca:

1. Se a fase exige resposta (`contest-roll`, `discard`, `move-robber`, `place-free-road`, preparação), emitir essa resposta. Descarte: largar o recurso de maior contagem. Ladrão: hex de maior produção esperada (pips) adjacente a adversário, não o hex atual; vítima com mais cartas. Preparação: vértice livre de maior soma de pips, com desempate para porto; estrada apontando para o próximo vértice de costa ou de maior pips.
2. No `roll`, se tem cavaleiro jogável e o ladrão está num hex próprio de 6 ou 8, jogar o cavaleiro. Senão `roll`.
3. No `act`, se VP total ≥ 10, `reveal-victory`. Senão, a primeira jogada legal nesta ordem: cidade, aldeia, estrada que aumenta a trilha ou alcança porto, compra de desenvolvimento se a mão não está prestes a estourar 7 sem necessidade, troca marítima para completar o custo da próxima cidade ou aldeia, `end-turn`.
4. Troca doméstica: o bot não inicia. `acceptDomestic(view, offer)` devolve sim só se a oferta entrega um recurso que completa um custo de cidade ou aldeia no próximo passo e não entrega o último trigo ou minério se o bot já tem cidade viável. O cliente solo consulta isso antes de mandar `domestic-trade`.

Pips travados: 2 e 12 → 1; 3 e 11 → 2; 4 e 10 → 3; 5 e 9 → 4; 6 e 8 → 5.

Solo: 1 humano + bots até 3 ou 4 assentos, ou hotseat sem bot. Os dois usam `apply` local.

## 4. Módulos e ordem da Fase 2

```
package.json                  workspaces: packages/*
tsconfig.base.json            strict, noEmit auxiliar
packages/rules                @catan/rules
  src/index.ts
  src/types.ts
  src/rng.ts
  src/board/topology.ts
  src/board/ports.ts
  src/board/setup.ts
  src/board/beginner-layout.ts    // quando a figura for transcrita
  src/engine/apply.ts
  src/engine/setup.ts
  src/engine/production.ts
  src/engine/robber.ts
  src/engine/build.ts
  src/engine/trade.ts
  src/engine/dev.ts
  src/engine/longest.ts
  src/engine/victory.ts
  src/view.ts
  test/*.test.ts
packages/bots                 @catan/bots
  src/heuristic.ts
  src/accept.ts
packages/client               @catan/client
  index.html
  src/main.tsx
  src/ui/                         // React: mão, troca, log, barra de build
  src/board/mount.ts              // Phaser.Game, smoothPixelArt
  src/board/BoardScene.ts
  src/session/local.ts            // apply no browser, bots
  src/session/room.ts             // WebSocket /ws
  public/sprites/                 // PNG original, sem arte oficial
packages/server               @catan/server
  src/index.ts                    // http + WebSocketServer({ server })
  src/rooms.ts
```

Ordem. Cada passo termina com os testes do passo verdes antes do próximo.

1. `@catan/rules` inteiro, guiado por teste: topologia, mapa `variable`, preparação, produção, ladrão, construção, troca, desenvolvimento, vitória, vista. Sem renderer.
2. `@catan/client` contra `session/local`. Primeiro hotseat humano de 3 assentos num mapa `variable`, para o tabuleiro e a UI existirem antes da heurística. Sprites podem ser formas geradas na primeira leva (hex colorido, casa, estrada) e serem trocados por PNG no mesmo passo, desde que o encaixe axial não mude.
3. `@catan/bots` ligado no solo. Um humano e o resto bots. A heurística não muda `apply`.
4. `@catan/server` e `session/room`. Sala na rede local. O cliente manda `Command`; o servidor devolve `PlayerView`.

Bots só importam `rules`, então o passo 3 pode começar assim que a API `Command` / `PlayerView` do passo 1 parar de mudar. Não antecipar o servidor antes do solo jogável.

## 5. Testes

Runner: Vitest, ambiente `node` para `rules` e `bots`. Sem jsdom no núcleo. Sem Playwright no critério estável.

Scripts na raiz:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:rules": "vitest run --project rules",
    "typecheck": "tsc -b --pretty false",
    "sim": "npm run sim -w @catan/rules"
  }
}
```

`vitest.config.ts` na raiz usa `test.projects: ["packages/rules", "packages/bots"]`. Cada um desses pacotes tem o seu `vitest.config.ts` com `test.name` (`rules`, `bots`) e `environment: "node"`. `npm test` é uma passada só (`vitest run`), que é o que a documentação do Vitest indica para CI. `test:watch` fica de fora do critério. `tsc -b` usa project references a partir de `tsconfig.base.json`; o cliente não entra no typecheck do núcleo.

Unidade (`packages/rules/test`), no mínimo:

- Topologia: 19 hexes, 54 vértices, 72 arestas, 30 costas, 9 slots, canonização estável (o mesmo vértice via outro hex gera o mesmo id).
- Espiral: para os 19 desertos, nenhum par de números vermelhos (6 ou 8) em hexes vizinhos; deserto sem número; multiconjunto de números e de terrenos.
- Preparação cobra de 3 e de 4: segunda aldeia paga, primeira não; distância recusada; ordem dos assentos na rodada 2 é o inverso.
- Produção: cidade 2, aldeia 1, ladrão bloqueia, escassez com um jogador paga o resto, escassez com dois paga zero daquele recurso.
- 7: mão 6 não descarta; mão 8 descarta 4; mão 11 descarta 5; ladrão não permanece; roubo só de edifício adjacente.
- Troca: 4:1 sem porto; 3:1 genérico; 2:1 só do recurso do porto; porto especial não dá 3:1 de outro recurso; doméstica recusa presente e recusa quem não está no turno.
- Desenvolvimento: não joga a comprada neste turno; ponto revela no turno da compra; um por turno; monopólio; ano da fartura recusado se o banco não tem.
- Estrada mais longa: bifurcação não soma; aldeia adversária corta; empate depois do corte mantém o dono; dois novos empatados devolvem a carta; laço de 6 conta 6.
- Exército: 3 ganha, empate não tira, 4 tira.
- Vitória: público 10 encerra no turno; 10 no turno alheio não encerra; ponto oculto exige `reveal-victory`.
- Replay: duas partidas com a mesma semente e a mesma lista de comandos terminam iguais.
- `projectView` de outro assento não contém as chaves da mão alheia.

Integração, um arquivo `full-turn.test.ts`: fixture pós-preparação com mãos montadas. Um turno: `roll` com semente que não dá 7, checar produção, `domestic-trade`, `maritime-trade`, `build-road`, `build-settlement` legal, `buy-dev`, `end-turn`. Asserções: banco, mãos, estoque de peças, VP público, assento ativo, fase `roll`. Segundo caso no mesmo arquivo: semente que rola 7, descarte dos dois jogadores obrigados, mover ladrão, roubar, `end-turn`.

`npm run sim` joga 4 bots até `game-over` ou 400 turnos, com uma semente fixa, e falha se `apply` devolver erro numa jogada que `legalCommands` ofereceu, ou se um invariante quebrar (soma de recursos no banco + mãos = 19 por tipo; peças no tabuleiro + estoque = limite). Não exige que os bots vençam em 400 turnos. Exige que a partida não corrompa.

### O que “estável” quer dizer

Estável, antes de qualquer Dockerfile ou conta de hospedagem:

1. `npm run typecheck` sai 0.
2. `npm test` sai 0, com a unidade e o `full-turn.test.ts` acima.
3. `npm run sim` sai 0.
4. `npm run build -w @catan/client` gera `dist`.
5. Solo local abre no browser, joga um turno humano contra bots, sem processo servidor e sem variável de ambiente secreta.

Deploy não faz parte dessa lista. A lista é a porta de entrada dele.

## 6. Handoff de deploy

Não escrever Docker na Fase 2 até o critério estável. Quando escrever, o desenho é um só:

- Imagem `node:22`. Build dos workspaces. Comando: `node packages/server/dist/index.js`.
- O processo serve os arquivos de `packages/client/dist` e aceita upgrade em `/ws` no mesmo porto (`PORT`, padrão 8787).
- Sala continua em memória. Reinício perde partida. Sem banco, sem Redis, sem chave.

Solo de desenvolvimento: `npm run dev -w @catan/client`. Nenhum servidor, nenhuma chave, nenhuma conta.

Sala na máquina local: `npm run dev -w @catan/server` e o cliente com `VITE_WS_URL=ws://localhost:8787/ws`. Ainda sem chave.

Passos manuais, só se alguém quiser a sala fora da máquina:

1. Uma conta num host que rode container ou processo Node (VPS ou tier gratuito). Não há API de jogo para assinar.
2. Publicar a imagem ou o processo, abrir o porto HTTP, e terminar TLS no proxy do host se o browser precisar de `wss://`. Certificado é do host, não um segredo do jogo.
3. Opcional: um domínio. Sem domínio, o IP já serve para teste.

Não há passo manual para jogar solo.

## 7. Ferramentas e skills na implementação

O agente da Fase 2 usa o shell para `npm test`, `npm run typecheck`, `npm run sim` e o dev server do Vite. Usa pesquisa web quando a API do Phaser 4 ou do `ws` divergir do que está citado aqui, e cita a página oficial que leu. O núcleo se prova com Vitest, não com o canvas.

Skills que se aplicam:

- `test-driven-development` no `@catan/rules`: o teste da seção 5 nasce vermelho, a implementação fica verde, sem código de regra “para já”.
- `verification-before-completion` antes de dizer que a fase está estável: rodar os quatro comandos da seção 5 e ler a saída. Não inferir sucesso pelo diff.

`systematic-debugging` se um teste de regra falhar de um jeito que o assert não explica. Não criar nome de ferramenta que o ambiente não tenha.

## 8. Alternativas rejeitadas

- Phaser 3. O npm `phaser` atual é 4.2.1 (9 de julho de 2026). A 4.0.0 saiu em 10 de abril de 2026. Ficar na 3 é começar na major anterior. A 4 mantém o papel de framework e acrescenta `smoothPixelArt`.
- PixiJS 8. Renderer WebGL/WebGPU, init assíncrona, sem cena de jogo, input de jogo, áudio ou tween no núcleo. Para 19 hexes o ganho de draw não paga escrever esse miolo. Documentação: guia Application e a página de renderers da v8.
- Canvas 2D cru. Sem loader, câmera, input e tween. A Fase 2 gastaria o prazo no motor, não nas regras.
- UI inteira dentro do Phaser. Troca e log são formulário e texto. DOM com React é o caminho curto.
- Next.js. O cliente é um jogo estático; SSR não ajuda o canvas e complica o mount do Phaser.
- WebRTC / P2P. Sem autoridade, a mão é confiável só por acordo. NAT e a saída do host derrubam a sala. O núcleo autoritativo já existe; o lugar dele é o processo da sala.
- Colyseus, PartyKit, Socket.IO. Outro modelo de estado, ou outro protocolo, em cima de um reducer que já é a fonte da verdade. `ws` anexado ao `http.Server` faz a sala e está na documentação oficial da biblioteca.
- Jest. Vitest já acompanha o Vite do cliente e roda TypeScript sem transformer extra.
- Banco e login. A partida cabe na memória. Solo não precisa de conta.

## Fontes lidas

Regras:

- Almanaque base 2020, componentes, turno, escassez, portos, preparação e espiral: <https://www.catan.com/sites/default/files/2021-06/catan_base_rules_2020_200707.pdf>
- Rulebook 2025 (estrada, aldeia, cidade, estrada mais longa): <https://www.catan.com/sites/default/files/2025-03/CN3081%20CATAN%E2%80%93The%20Game%20Rulebook%20secure%20%281%29.pdf>
- Rulebook 3D, contagem `Forest x4 Hills x3 Pasture x4 Fields x4 Mountains x3 Desert x1` e portos `2:1` de cada recurso mais `3:1 x4`: <https://www.catan.com/sites/default/files/2024-01/Rules%203D-CATAN.pdf>
- Letras A–R dos números: resposta aceita em <https://boardgames.stackexchange.com/questions/2740/distribution-of-tokens-in-standard-4-player-catan> e confirmação de que 4ª e 5ª edição usam a mesma ordem em <https://boardgames.stackexchange.com/questions/48425/when-and-why-did-the-catan-number-distribution-change>
- Grade axial, distância `max(|dq|,|dr|,|ds|)` e conversão para pixel: <https://www.redblobgames.com/grids/hexagons/>
- Contagem 54 / 72: enumeração local sobre essa grade (19 hexes de raio 2, fusão de cantos). Não há uma linha no PDF com esses dois inteiros; a topologia acima produz exatamente esses totais.

Stack:

- Phaser 4.2.1: <https://phaser.io/download/release/v4.2.1> e <https://github.com/phaserjs/phaser/releases/tag/v4.2.1>
- Pixel art no Phaser 4 (`pixelArt` vs `smoothPixelArt`): <https://github.com/phaserjs/phaser/tree/master/docs/Phaser%204%20Pixel%20Art%20Guide>
- PixiJS v8, renderer e `Application.init`: <https://pixijs.com/8.x/guides/components/application>
- Vite (`react-ts`, Node 22.12+, build estático): <https://vite.dev/guide/>
- Vitest (`vitest run`, Vite `>=6.4`, Node `>=22.12`): <https://vitest.dev/guide/>
- `ws` no mesmo HTTP server: <https://github.com/websockets/ws/blob/master/README.md>
