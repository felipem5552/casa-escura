# Casa Escura

Jogo 2D de terror e furtividade para navegador. Ligue a energia, abra o escritório, ache a chave e fuja pela porta da rua.

## Rodar

```bash
npm start      # http://localhost:8000
npm test       # testes da IA e dos puzzles (Node 20+)
```
(ou `python -m http.server 8000`). Precisa de servidor local: módulos ES não rodam via `file://`.

## Objetivo

1. Ache o **fusível** (escondido em um móvel do Quarto, Cozinha, Banheiro, Sala ou Sótão).
2. Instale no **quadro de força** (Porão). A energia volta — e o barulho atrai o assassino.
3. O **Escritório** destranca. A **chave** da porta da rua está lá.
4. Fuja pela porta da Sala. Ler todos os documentos muda o final; o retrato do corredor tem um terceiro.

## Controles (remapeáveis em Opções)

| Ação | Tecla |
|---|---|
| Andar | A/D · ←/→ |
| Correr | Shift |
| Lanterna | F |
| Interagir / esconder | E |
| Jogar garrafa | G |
| Trocar pilhas | R |
| Trancar/destrancar porta | L |
| Segurar a respiração (escondido) | Espaço |
| Pausar · Salvar · Som · Debug | P/Esc · Ctrl+S · M · F3 |

## Como a IA funciona

- **Audição:** passos, corrida, portas, gavetas, tranca, quadro de força e garrafas geram ruído com raio. Ele *investiga o ponto* do som. Correr é muito mais alto que andar; ferido, você faz mais barulho.
- **Visão em cone:** de costas ele enxerga menos da metade. Lanterna e energia ligada aumentam a detecção.
- **Memória:** se te vê entrar num armário, lembra e volta para checar. Escondido, segure a respiração (Espaço) para sobreviver à inspeção — mas o fôlego acaba e ofegar entrega você.
- **Calor:** a patrulha favorece as salas onde você passa mais tempo.
- **Diretor de tensão:** após muito tempo calmo, empurra um assassino na sua direção; após uma perseguição, dá um respiro. Dispara apagões e sons falsos.
- **Papéis:** Caçador (rápido, visão normal) e Vigia (lento, ouve muito, checa armários mais). Pesadelo tem os dois.
- **Portas trancadas:** ele precisa arrombar (barulho e tempo).
- Tudo é determinístico por **seed** (mesma seed = mesma casa, mesmo comportamento). Há uma seed do dia.

## Estrutura

`src/` — `main` (loop, cenas, HUD) · `killer` (IA) · `noise` · `director` · `player` · `rooms` · `world` · `rng` · `render` · `debug` · `audio` (espacial + música reativa) · `input` · `save` · `config`
`tests/` — IA (determinismo, audição, memória, portas, diretor) e cadeia de puzzles.
Pronto para PWA (`manifest.webmanifest` + `sw.js`, rede primeiro e cache offline).
