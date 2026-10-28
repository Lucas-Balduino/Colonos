# Norte visual — Colonos, Ilha das Lanternas

Fonte: repositório **Colonos** (`colonos`), ramo **`main`**. Copiar este olhar, não redesenhar o jogo.

## Paleta

Madeira e ouro velho sobre noite. Sem anti-alias, sem gradientes suaves no pixel.

| Nome | Hex |
| --- | --- |
| night | `#1a1520` |
| wood | `#3d2a1f` |
| panel | `#2a2133` |
| parchment | `#f4e8c8` |
| gold | `#d4a017` |
| goldDark | `#8a6410` |
| forest | `#2f6b32` |
| pasture | `#6db35c` |
| wheat | `#e0b33a` |
| brick | `#b24a32` |
| stone | `#5c6573` |
| sand | `#c2a366` |
| sea | `#16344a` |
| foam | `#9ad1e5` |

Facções: vermelho `#c44536`, azul `#2b6cb0`, laranja `#d97706`, marfim `#e8e0d0`. O vermelho e o laranja partilham o mesmo modelo de casa; só a cor do telhado e do reboco muda.

## Escala pixel

- `image-rendering: pixelated`. Pixi sem antialias, `roundPixels`.
- Hex pointy-top, `HEX_SIZE = 56` (sprite ~97×112). Peças da HUD ~32 px.
- Fonte **Pixelify Sans**. Cantos 2 px, botões com sombra dura 2 px.
- Cada terreno (floresta, tijolo, pasto, trigo, minério, deserto, mar) tem sprite próprio. Terras partilham borda de prado e clareira de terra nos 6 vértices. O mar é só água; espuma só na costa.

## Câmara do tabuleiro

Vista de cima, ilha centrada, feltro `#0c2433` / `#0a1c26` com moldura de madeira e ouro. Zoom discreto **1x / 2x / 3x**, pan ao arrastar. Números pequenos no centro do hex. Casas assentam no canto (`anchor` perto da base). Estradas são caminhos de terra curtos, lanterna da facção no meio, não faixas de corrida.

## HUD

Bandeja de madeira à direita (~340 px no desktop). No telemóvel, o tabuleiro ocupa a maior parte; a mesa abre em folha inferior.

Painéis com borda ouro-escuro, inset de madeira, sombra dura. Ordem: título + dados, faixa de fase, turno activo, outros jogadores, custos (estrada / aldeia / cidade), mão em cartas pixel, acções (rolar, comprar carta, jogar desenvolvimento, encerrar). Log em pergaminho. Copy em pt-BR.

## Ecrãs

1. **Lobby** — cartaz da ilha, vinheta, nome, mapa iniciante ou aleatório, solo, hot-seat, sala web.
2. **Carregar a mesa** — overlay de madeira sobre o tabuleiro.
3. **Mesa** — tabuleiro Pixi + HUD (só este ecrã de jogo).

## O que já joga

Regras base de Catan até 10 VP: preparação em cobra, dados, recursos, estradas / aldeias / cidades, ladrão, descarte, roubo, banco e portos, cartas de desenvolvimento, maior estrada e maior exército. Solo contra 3 bots, hot-seat 3–4, sala com código de 6 letras.

Referência: [media/mesa-vista-geral.png](../media/mesa-vista-geral.png), [media/tabuleiro-aproximo.png](../media/tabuleiro-aproximo.png).
