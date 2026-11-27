// =============================================================================
// config.js — Constantes globais do jogo
// =============================================================================
// Altere os valores aqui para ajustar o balanceamento sem tocar na lógica.

// ── Canvas ────────────────────────────────────────────────────────────────
export const CANVAS_W = 960;
export const CANVAS_H = 540;
export const FLOOR_Y  = 400;   // chão com 140px de profundidade (antes 90)

// ── Jogador ───────────────────────────────────────────────────────────────
export const PLAYER_WALK_SPEED       = 165;
export const PLAYER_RUN_SPEED        = 300;
export const STAMINA_DRAIN_RATE      = 22;   // por segundo correndo (~4,5 s de corrida; escalado com as salas maiores)
export const STAMINA_RECOVER_IDLE    = 20;   // por segundo parado
export const STAMINA_RECOVER_WALK    = 9;    // por segundo andando
export const STAMINA_TIRED_THRESHOLD = 35;   // stamina mínima para sair do cansaço
export const HIDE_DURATION           = 6;    // segundos para poder sair do esconderijo
export const DOOR_COOLDOWN           = 0.4;  // cooldown entre trocas de sala
export const ENTER_GRACE             = 1.0;  // s após entrar numa sala sem ser avistado (dá tempo de recuar)
export const INTERACT_RANGE          = 70;   // alcance para portas (px)
export const INTERACT_RANGE_ITEM     = 75;   // alcance para itens (px)

// ── Assassino ─────────────────────────────────────────────────────────────
export const KILLER_PATROL_SPEED = 88;
export const KILLER_CHASE_SPEED  = 225;
export const KILLER_SEARCH_SPEED = 81;
export const KILLER_LOST_TIMEOUT = 8;    // segundos em chase sem ver o jogador antes de desistir

// ── Detecção (assassino vê o jogador) ─────────────────────────────────────
export const DETECT_DIST_CLOSE   = 170;  // vê sempre
export const DETECT_DIST_RUNNING = 480;  // vê se jogador correr/estiver cansado
export const DETECT_DIST_LIGHT   = 900;  // vê se lanterna estiver acesa

// ── Iluminação por sala ────────────────────────────────────────────────────
// Raio do círculo de visão ambiente do jogador (sem lanterna).
// Valores menores = sala mais escura e assustadora.
export const ROOM_AMBIENT_RADIUS = {
    0: 185,   // Corredor  — levemente iluminado
    1: 170,   // Sala      — penumbra
    2: 150,   // Quarto    — bem escuro
    3: 160,   // Cozinha   — penumbra
    4: 140,   // Banheiro  — muito escuro
    5: 90,    // Porão     — quase sem luz
    6: 120,   // Sótão
    7: 165,   // Escritório
};

// Opacidade base da escuridão por sala (0 = transparente, 1 = totalmente negro).
export const ROOM_DARKNESS = {
    0: 0.92,
    1: 0.94,
    2: 0.96,
    3: 0.94,
    4: 0.97,
    5: 0.99,
    6: 0.975,
    7: 0.95,
};

// ── Ruído (raios de audição em px) ────────────────────────────────────────
export const NOISE = {
    walk: 140, run: 520, breath: 220, search: 320, door: 560, lock: 250,
    power: 2000, distract: 1300, gasp: 380, hurtMul: 1.5,
};

// ── Lanterna ──────────────────────────────────────────────────────────────
export const BATTERY_SECONDS = 150;   // duração de uma carga completa (dificuldade escala)
export const BREATH_DRAIN    = 22;    // fôlego/s ao segurar a respiração escondido
export const BREATH_RECOVER  = 14;

// ── Papéis dos assassinos ─────────────────────────────────────────────────
export const KILLER_ROLES = {
    hunter:  { name: 'Caçador', patrol: 88, chase: 238, search: 81, hearing: 1.0,  vision: 1.0,  checkChance: 0.35, lost: 8  },
    watcher: { name: 'Vigia',   patrol: 60, chase: 188, search: 69, hearing: 1.5,  vision: 0.65, checkChance: 0.70, lost: 11 },
};

// ── Dificuldades ──────────────────────────────────────────────────────────
export const DIFFICULTIES = {
    facil:    { label: 'Fácil',    killers: ['hunter'],            hearing: 0.7,  speed: 0.88, detect: 0.8,  batteryDrain: 0.6, batteries: 5, bottles: 3, hits: 3, doorTime: 3.4, checkMul: 0.5, surviveBase: 0.6,  surviveHold: 0.95 },
    normal:   { label: 'Normal',   killers: ['hunter'],            hearing: 1.0,  speed: 1.0,  detect: 1.0,  batteryDrain: 1.0, batteries: 4, bottles: 2, hits: 2, doorTime: 2.4, checkMul: 1.0, surviveBase: 0.45, surviveHold: 0.9 },
    pesadelo: { label: 'Pesadelo', killers: ['hunter', 'watcher'], hearing: 1.25, speed: 1.1,  detect: 1.15, batteryDrain: 1.4, batteries: 3, bottles: 1, hits: 1, doorTime: 1.6, checkMul: 1.4, surviveBase: 0.3,  surviveHold: 0.8  },
};
