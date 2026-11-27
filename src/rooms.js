// =============================================================================
// rooms.js — Definição de todas as salas do jogo
// =============================================================================
//
// Cada sala tem:
//   n      — nome da sala (usado em debug e narrativa)
//   w      — largura em pixels
//   c      — cor base do gradiente de fundo
//   doors  — lista de portas:
//              { x, to }      → porta interna (leva para sala de índice 'to')
//              { x, front:1 } → porta da rua (saída/vitória)
//              { x, to, locked:true } → porta trancada (requer chave específica)
//   it     — itens interagíveis: [x, tipo, nome]
//              's' = searchable  (gaveta, cômoda — pode conter a chave)
//              'h' = hideable    (armário — jogador pode se esconder)
//              'n' = narrative   (objeto só de leitura — exibe texto de lore)
//   ambient — som de ambiente (chave usada em audio.js)
//
// Índice das salas:
//   0 = Corredor   (hub central, liga todas as salas)
//   1 = Sala       (contém a porta da rua — objetivo final)
//   2 = Quarto
//   3 = Cozinha
//   4 = Banheiro
//   5 = Porão      (nova sala — mais escura, segundo assassino)
//
// Para adicionar uma nova sala:
//   1. Adicione um objeto neste array.
//   2. Adicione a porta correspondente em rooms[0].doors.
//   3. Atualize o totalRooms em killer.js (ou passe rooms.length).
//   4. Adicione um bloco em drawRoomDecoration() em render.js.
//   5. Adicione raio de luz em ROOM_AMBIENT_RADIUS em config.js.

export const rooms = [
    // ── 0: Corredor ────────────────────────────────────────────────────────
    {
        n: 'Corredor',
        w: 5600,
        c: '#2a2520',
        // Os destinos (`to`) são embaralhados por seed em applyLayout().
        doors: [
            { x: 300,  to: 5 },   // escada para o porão
            { x: 900,  to: 1 },
            { x: 1500, to: 7 },   // escritório (exige energia ligada)
            { x: 2250, to: 2 },
            { x: 3700, to: 3 },
            { x: 4400, to: 6 },   // sótão
            { x: 5000, to: 4 },
        ],
        it: [
            // Objeto narrativo no corredor: foto de família na parede
            [2980, 'n', 'Foto na parede',
                'Uma foto de família. Os rostos estão riscados com algo escuro.', 'photo'],
        ],
        ambient: 'creak',   // rangido de madeira
    },

    // ── 1: Sala ────────────────────────────────────────────────────────────
    {
        n: 'Sala',
        w: 2400,
        c: '#2d2620',
        doors: [
            { x: 140,  to: 0 },
            { x: 2240, front: 1 },   // porta da rua
        ],
        it: [
            [640,  's', 'Estante', null],
            [1150,  's', 'Gaveteiro', null],
            [1680, 'h', 'Armário', null],
            // Narrativa: bilhete na mesa
            [960, 'n', 'Bilhete na mesa',
                '"Se você está lendo isso, já é tarde demais. Não acenda as luzes."'],
        ],
        ambient: 'wind',    // vento passando pela janela
    },

    // ── 2: Quarto ──────────────────────────────────────────────────────────
    {
        n: 'Quarto',
        w: 2200,
        c: '#232530',
        doors: [
            { x: 140, to: 0 },
        ],
        it: [
            [660,  's', 'Cômoda', null],
            [1570, 's', 'Criado-mudo', null],
            [1960, 'h', 'Guarda-roupa', null],
            // Narrativa: diário aberto na cama
            [1180, 'n', 'Diário aberto',
                '"Dia 12 — Ele não dorme. Só anda. A noite toda, de um lado para o outro."'],
        ],
        ambient: 'tick',    // relógio de parede
    },

    // ── 3: Cozinha ─────────────────────────────────────────────────────────
    {
        n: 'Cozinha',
        w: 2200,
        c: '#2c2c22',
        doors: [
            { x: 140, to: 0 },
        ],
        it: [
            [600,  's', 'Armário de louças', null],
            [1490,  's', 'Gavetas', null],
            [1960, 'h', 'Despensa', null],
            // Narrativa: jornal velho na mesa
            [1020, 'n', 'Jornal na mesa',
                'A manchete está apagada pelo mofo. Só dá para ler: "...nunca encontrado."'],
        ],
        ambient: 'drip',    // goteira
    },

    // ── 4: Banheiro ────────────────────────────────────────────────────────
    {
        n: 'Banheiro',
        w: 1900,
        c: '#202a2c',
        doors: [
            { x: 140, to: 0 },
        ],
        it: [
            [600,  's', 'Armarinho', null],
            [1420,  's', 'Gaveta da pia', null],
            [1710, 'h', 'Armário de toalhas', null],
            // Narrativa: espelho com mensagem
            [950, 'n', 'Espelho', 'Escrito com sabonete: "ELE TE OUVE RESPIRAR"'],
        ],
        ambient: 'drip',    // goteira
    },

    // ── 5: Porão ───────────────────────────────────────────────────────────
    // Sala nova. Mais escura (veja ROOM_AMBIENT_RADIUS[5] = 90 em config.js).
    // Contém o segundo assassino ao iniciar.
    {
        n: 'Porão',
        w: 2500,
        c: '#1a1510',
        doors: [
            { x: 140, to: 0 },   // escada de volta ao corredor
        ],
        it: [
            [470,  'p', 'Quadro de força', null],
            [780,  's', 'Baú antigo', null],
            [1330,  's', 'Prateleira enferrujada', null],
            [2110, 'h', 'Armário velho', null],
            [1720, 's', 'Caixa de ferramentas', null],
            // Narrativa: carta no chão
            [1090, 'n', 'Carta no chão',
                'Letra tremida: "Não desça. Por favor. Não desça."'],
        ],
        ambient: 'hum',     // zumbido elétrico/tubulação
    },
    // ── 6: Sótão ───────────────────────────────────────────────────────────
    {
        n: 'Sótão',
        w: 2400,
        c: '#1d1a1f',
        doors: [ { x: 140, to: 0 } ],
        it: [
            [720,  's', 'Baú de roupas', null],
            [1040,  'n', 'Caixa de fotos',
                'Fotos de pessoas diferentes, todas na mesma sala. Todas datadas de ontem.'],
            [1440,  'n', 'Berço empoeirado',
                'Dentro do berço, um chaveiro com o seu nome gravado.'],
            [1680, 's', 'Cômoda quebrada', null],
            [2130, 'h', 'Armário embutido', null],
        ],
        ambient: 'wind',
    },

    // ── 7: Escritório ──────────────────────────────────────────────────────
    // Trancado por fechadura elétrica: só abre com a energia ligada (Porão).
    // A chave da porta da rua fica sempre aqui.
    {
        n: 'Escritório',
        w: 2100,
        c: '#262420',
        doors: [ { x: 140, to: 0 } ],
        it: [
            [610,  's', 'Mesa de trabalho', null],
            [970,  'n', 'Relatório',
                '"Moradores desaparecidos: 7. A casa continua ocupada."'],
            [1370,  's', 'Arquivo de aço', null],
            [1620, 'n', 'Retrato emoldurado',
                'O dono da casa. Tem a sua idade. Tem o seu rosto.'],
            [1910, 'h', 'Armário de arquivos', null],
        ],
        ambient: 'tick',
    },
];

// Embaralha (por seed) qual sala cada porta do corredor leva.
const CORRIDOR_TARGETS = [5, 1, 7, 2, 3, 6, 4];
export function applyLayout(shuffleFn) {
    const targets = shuffleFn(CORRIDOR_TARGETS.slice());
    rooms[0].doors.forEach((d, i) => {
        d.to = targets[i];
        if (d.to === 7) d.needs = 'power'; else delete d.needs;
    });
}

// Número total de salas — usado na IA para sortear destinos de patrulha.
export const TOTAL_ROOMS = rooms.length;
