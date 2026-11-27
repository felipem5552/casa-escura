// =============================================================================
// sprites.js — Pixel-art gerada via código (mkSprite)
// =============================================================================

// Corpo do jogador (torso + cabeça, sem pernas)
const PLAYER_BODY_ROWS = [
    "...hhhhhh...",
    "..hhhhhhhh..",
    "..hhhssss...",
    "..hhhsssss..",
    "...hhssss...",
    ".....ss.....",
    "..tttttttt..",
    ".tttttttttt.",
    ".tttTttttts.",
    ".tttTtttttt.",
    ".tttttttttt.",
    "..tttttttt..",
    "..pppppppp..",
    "..pppppppp..",
    "..pppppppp..",
    "..pppppppp.."
];

// Frames de pernas do jogador
const PLAYER_LEG_FRAMES = [
    [   // frame 0 — parado
        "..ppp..ppp..",
        "..ppp..ppp..",
        "..ppp..ppp..",
        "..ppp..ppp..",
        "..ppp..ppp..",
        "..ppp..ppp..",
        "..bbb..bbb..",
        "..bbbb.bbbb."
    ],
    [   // frame 1 — passo A
        "..pppp.ppp..",
        ".ppp....ppp.",
        ".ppp....ppp.",
        "ppp......ppp",
        "ppp......ppp",
        "bbb......bbb",
        "bbb......bbb",
        "bbbb....bbbb"
    ],
    [   // frame 2 — passo B
        "..ppp.pppp..",
        ".ppp....ppp.",
        ".pp......pp.",
        ".pp......pp.",
        "pp........pp",
        "bb........bb",
        "bb........bb",
        "bbb......bbb"
    ]
];

const PLAYER_PALETTE = {
    h: '#2b1d16',
    s: '#d2a98a',
    t: '#4f6479',
    T: '#3b4d60',
    p: '#2d2d3d',
    b: '#101014'
};

// Corpo do assassino
const KILLER_BODY_ROWS = [
    "....hhhhhh....",
    "...hhhhhhhh...",
    "...hhhhhhhh...",
    "...hhhsssehhh.",
    "...hhhssssshh.",
    "....hhssshh...",
    "....cccccc....",
    "..cccccccccc..",
    ".cccccccccccc.",
    ".ccCccccCccccs",
    ".ccccccccccccs",
    ".cccccccccccc.",
    "..cccccccccc..",
    "..cCcccccCcc..",
    "..cccccccccc..",
    "..cccccccccc.."
];

const KILLER_LEG_FRAMES = [
    [
        "..cccc..cccc..",
        "..cccc..cccc..",
        "..cccc..cccc..",
        "..cccc..cccc..",
        "..cccc..cccc..",
        "..bbbb..bbbb..",
        "..bbbb..bbbb.."
    ],
    [
        "..ccccc.ccc...",
        ".ccccc...ccc..",
        ".cccc.....ccc.",
        "cccc.......ccc",
        "bbbb.......bbb",
        "bbbb.......bbb",
        "bbbbb.....bbbb"
    ],
    [
        "...ccc.ccccc..",
        "..ccc...ccccc.",
        ".ccc.....cccc.",
        "ccc.......cccc",
        "bbb.......bbbb",
        "bbb.......bbbb",
        "bbbb.....bbbbb"
    ]
];

const KILLER_PALETTE = {
    h: '#161616',
    s: '#a39a8e',
    e: '#ff2a1a',
    c: '#1d1d25',
    C: '#0f0f13',
    b: '#08080a'
};

// Monta um canvas de sprite a partir de linhas de texto e paleta de cores.
function mkSprite(rows, palette) {
    const c   = document.createElement('canvas');
    c.width   = rows[0].length;
    c.height  = rows.length;
    const sCtx = c.getContext('2d');
    rows.forEach((row, y) => {
        for (let i = 0; i < row.length; i++) {
            const key = row[i];
            if (key !== '.') {
                sCtx.fillStyle = palette[key];
                sCtx.fillRect(i, y, 1, 1);
            }
        }
    });
    return c;
}

// Sequência de frames da animação de caminhada
export const WALK_FRAME_SEQUENCE = [1, 0, 2, 0];

// Sprites do jogador gerados: array de 3 canvas (parado, passo A, passo B)
export const playerSprites = PLAYER_LEG_FRAMES.map(legs =>
    mkSprite(PLAYER_BODY_ROWS.concat(legs), PLAYER_PALETTE)
);

// Sprites do assassino gerados
export const killerSprites = KILLER_LEG_FRAMES.map(legs =>
    mkSprite(KILLER_BODY_ROWS.concat(legs), KILLER_PALETTE)
);

// Vigia: casaco claro, olhos âmbar
const WATCHER_PALETTE = { h: '#2a2a2e', s: '#b9b2a4', e: '#ffb21a', c: '#4a4a52', C: '#33333a', b: '#1a1a1e' };
export const watcherSprites = KILLER_LEG_FRAMES.map(legs =>
    mkSprite(KILLER_BODY_ROWS.concat(legs), WATCHER_PALETTE)
);
