// Testes da IA (node --test tests/ai.test.mjs). Rodam sem navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rooms, applyLayout, TOTAL_ROOMS } from '../src/rooms.js';
import { world, resetWorld } from '../src/world.js';
import { noise, emitNoise, tickNoise, resetNoise, pathDistance } from '../src/noise.js';
import { seedRng, shuffle, rnd } from '../src/rng.js';
import { spawnKillers, updateKiller, SPAWN_MIN_PATH, SPAWN_GRACE } from '../src/killer.js';
import { createDirector, updateDirector } from '../src/director.js';
import { DIFFICULTIES } from '../src/config.js';

const STEP = 1 / 60;

function setup(seed = 'TESTE', diffKey = 'normal', roles = ['hunter']) {
    seedRng(seed);
    applyLayout(shuffle);
    const diff = DIFFICULTIES[diffKey];
    resetWorld(diff); resetNoise();
    const items = [];
    rooms.forEach((r, i) => (r.it || []).forEach(d => items.push({ room: i, x: d[0], itemType: d[1], searched: false })));
    const player = { room: 1, x: 300, dir: 1, hidden: null, hideTimer: 0, light: false, noisy: false, moving: false, invuln: 0 };
    const killers = spawnKillers({ ...diff, killers: roles }, player);
    killers.forEach(k => { k.grace = 0; });   // testes de audição partem sem carência; o teste de carência a reativa
    const log = { spotted: 0, catches: 0, steps: 0, doors: 0, bangs: 0, checks: [], heard: 0 };
    const hooks = {
        onSpotted: () => log.spotted++, onCatch: () => { log.catches++; player.invuln = 2; return 'hurt'; },
        onStep: () => log.steps++, onDoor: () => log.doors++, onBang: () => log.bangs++,
        onCheckHide: (k, item) => log.checks.push(item), onHeard: () => log.heard++,
    };
    const director = createDirector();
    const ctx = { player, items, world, diff, director, hooks };
    const tick = () => {
        killers.forEach(k => updateKiller(k, ctx, STEP));
        updateDirector(director, { killers, world, hooks: {} }, STEP);
        tickNoise(STEP);
    };
    return { player, killers, items, ctx, log, tick, diff, director };
}

test('determinístico: mesma seed → mesmo caminho', () => {
    const run = () => { const s = setup('ABC123'); for (let i = 0; i < 20000; i++) s.tick(); return s.killers.map(k => [k.room, Math.round(k.x), k.state]); };
    assert.deepEqual(run(), run());
});

test('estável: sem NaN nem fora dos limites (várias seeds, 2 assassinos)', () => {
    for (const seed of ['A', 'B', 'C', 'D', 'E']) {
        const s = setup(seed, 'pesadelo', ['hunter', 'watcher']);
        for (let i = 0; i < 60000; i++) {
            // jogador anda de um lado para outro e troca de sala de vez em quando
            s.player.x = 100 + Math.abs(Math.sin(i / 400)) * 800;
            s.player.moving = true; s.player.noisy = (i % 900) < 200;
            if (i % 3000 === 0) s.player.room = Math.floor(rnd() * TOTAL_ROOMS);
            if (s.player.room === 7 && !s.ctx.world.power) s.player.room = 0;
            s.tick();
            for (const k of s.killers) {
                assert.ok(Number.isFinite(k.x), 'x finito');
                assert.ok(k.x >= -60 && k.x <= rooms[k.room].w + 60, `x dentro da sala (${k.x}, sala ${k.room})`);
                assert.ok(k.room >= 0 && k.room < TOTAL_ROOMS);
            }
        }
    }
});

test('ouve ruído em outra sala e vai investigar', () => {
    const s = setup('RUIDO');
    const k = s.killers[0];
    k.room = 2; k.x = 400; k.waitTimer = 0;
    s.player.room = 4;                       // jogador longe, sem visão
    const nx = rooms[0].doors.find(d => d.to === 2).x + 300;   // no corredor, perto da porta do quarto
    emitNoise(0, nx, 1600, 'distract');
    s.tick();
    assert.equal(k.state, 'investigate');
    let reached = false;
    for (let i = 0; i < 60 * 40 && !reached; i++) { s.tick(); reached = k.room === 0 && Math.abs(k.x - nx) < 20; }
    assert.ok(reached, 'chegou ao ponto do ruído');
});

test('ruído fraco e distante é ignorado', () => {
    const s = setup('FRACO');
    const k = s.killers[0]; k.room = 2; k.x = 400; s.player.room = 4;
    emitNoise(3, 1200, 100, 'step');
    s.tick();
    assert.notEqual(k.state, 'investigate');
});

test('vê o jogador (lanterna), persegue e pega', () => {
    const s = setup('CHASE');
    const k = s.killers[0]; k.room = 1; k.x = 500; k.dir = 1; k.waitTimer = 0;
    s.player.room = 1; s.player.x = 800; s.player.light = true;
    for (let i = 0; i < 60 * 10 && s.log.catches === 0; i++) s.tick();
    assert.equal(s.log.spotted, 1);
    assert.ok(s.log.catches >= 1);
});

test('de costas ele enxerga bem menos', () => {
    const s = setup('COSTAS', 'normal');
    const k = s.killers[0]; k.room = 1; k.x = 500; k.dir = -1; k.waitTimer = 5;
    s.player.room = 1; s.player.x = 700;        // atrás dele, a 200px (dentro do raio frontal de 140? não) 
    for (let i = 0; i < 30; i++) s.tick();
    assert.equal(k.state, 'patrol');
});

test('memória: viu esconder → busca → abre o armário', () => {
    const s = setup('ESCONDE');
    const closet = s.items.find(i => i.room === 1 && i.itemType === 'h');
    const k = s.killers[0]; k.room = 1; k.x = closet.x - 500; k.dir = 1; k.waitTimer = 0; k.grace = 0;
    s.player.room = 1; s.player.x = closet.x; s.player.light = true;
    for (let i = 0; i < 20; i++) s.tick();            // avista
    assert.equal(k.state, 'chase');
    s.player.hidden = closet; s.player.light = false;
    for (let i = 0; i < 60 * 25 && s.log.checks.length === 0; i++) s.tick();
    assert.equal(s.log.checks[0], closet, 'inspecionou o armário onde o jogador está');
    assert.ok(k.memory.hideCount >= 1, 'lembrou que o jogador se escondeu');
    assert.equal(k.memory.hideRoom, null, 'depois de vistoriar, esquece a suspeita');
});

test('porta trancada: arromba depois de um tempo e faz barulho', () => {
    const s = setup('TRANCA');
    const k = s.killers[0]; k.room = 2; k.x = 200; k.goal = 0; k.waitTimer = 0; k.visits = 1;
    world.locked[2] = true;
    s.player.room = 4;
    for (let i = 0; i < 60 * 15 && world.locked[2]; i++) s.tick();
    assert.equal(world.locked[2], false);
    assert.ok(s.log.bangs >= 2);
});

test('escritório só entra na patrulha com a energia ligada', () => {
    const s = setup('ENERGIA');
    const k = s.killers[0]; k.room = 0; k.x = 1500;
    const seen = new Set();
    for (let i = 0; i < 80000; i++) { s.player.room = 1; s.tick(); seen.add(k.room); }
    assert.ok(!seen.has(7));
});

test('diretor: depois de muita calma empurra o assassino para o jogador', () => {
    const s = setup('DIRETOR');
    s.player.room = 4;
    let pushed = false;
    for (let i = 0; i < 60 * 70 && !pushed; i++) { s.tick(); pushed = s.director.push || s.killers[0].goal === 4; }
    assert.ok(pushed);
});

test('pathDistance é simétrica e cresce com portas', () => {
    seedRng('PD'); applyLayout(shuffle);
    assert.equal(pathDistance(2, 300, 4, 800), pathDistance(4, 800, 2, 300));
    assert.ok(pathDistance(2, 300, 4, 800) > pathDistance(2, 300, 0, 800));
    assert.equal(pathDistance(3, 100, 3, 400), 300);
});

// ── Escala do mapa e justiça ──────────────────────────────────────────────

test('mapa: itens e portas cabem na sala, longe das bordas e entre si', () => {
    rooms.forEach((r, i) => {
        assert.ok(r.w >= (i === 0 ? 5000 : 1800), `sala ${i} larga o bastante`);
        const xs = [...r.doors.map(d => d.x), ...(r.it || []).map(d => d[0])].sort((a, b) => a - b);
        for (const x of xs) assert.ok(x >= 100 && x <= r.w - 100, `sala ${i}: x=${x} dentro dos limites`);
        for (let j = 1; j < xs.length; j++) assert.ok(xs[j] - xs[j - 1] >= 150, `sala ${i}: itens/portas a >=150px (${xs[j - 1]}, ${xs[j]})`);
    });
    const hub = rooms[0].doors.map(d => d.x);
    for (let j = 1; j < hub.length; j++) assert.ok(hub[j] - hub[j - 1] >= 500, 'portas do corredor espaçadas');
});

test('spawn justo: nunca perto do jogador, em qualquer seed/dificuldade', () => {
    for (let i = 0; i < 200; i++) for (const dk of ['facil', 'normal', 'pesadelo']) {
        seedRng('J' + i); applyLayout(shuffle);
        const player = { room: 1, x: 300 };
        const ks = spawnKillers(DIFFICULTIES[dk], player);
        assert.equal(new Set(ks.map(k => k.room)).size, ks.length, 'salas distintas');
        for (const k of ks) {
            assert.ok(pathDistance(1, 300, k.room, k.x) >= SPAWN_MIN_PATH, `seed J${i}/${dk}: spawn a ${pathDistance(1, 300, k.room, k.x)}px`);
            assert.ok(k.room !== 1 && k.room !== 0 && k.room !== 7);
            assert.equal(k.grace, SPAWN_GRACE);
        }
    }
});

test('carência inicial: não ouve ruído enquanto grace > 0, depois ouve', () => {
    const s = setup('GRACE');
    const k = s.killers[0]; k.waitTimer = 0; k.grace = SPAWN_GRACE; s.player.room = 4;
    emitNoise(k.room, k.x + 50, 1600, 'distract');
    s.tick();
    assert.notEqual(k.state, 'investigate', 'ignorou durante a carência');
    k.grace = 0;
    emitNoise(k.room, k.x + 50, 1600, 'distract');
    s.tick();
    assert.equal(k.state, 'investigate');
});

test('reação ao atravessar porta: não avista o jogador por ~1s depois de chegar', () => {
    const s = setup('PORTA');
    const k = s.killers[0]; k.room = 1; k.x = 500; k.dir = 1; k.waitTimer = 5; k.grace = 0; k.arrive = 0.9;
    s.player.room = 1; s.player.x = 560; s.player.light = true;
    for (let i = 0; i < 30; i++) s.tick();
    assert.equal(k.state, 'patrol', 'ainda em carência de chegada');
    for (let i = 0; i < 60; i++) s.tick();
    assert.equal(k.state, 'chase', 'depois da carência ele enxerga');
});

test('tempo de reação: avistado a pé pela distância de "vê sempre", dá para fugir correndo', () => {
    // Jogador correndo mais rápido que a perseguição de qualquer papel, em qualquer dificuldade.
    for (const dk of Object.keys(DIFFICULTIES)) {
        const d = DIFFICULTIES[dk];
        assert.ok(300 > 238 * d.speed, `${dk}: corrida do jogador > perseguição do Caçador`);
    }
});

// ── Mira da lanterna (visual) ─────────────────────────────────────────────
test('aim: ângulo da luz espelha para a esquerda e o desvio é limitado a ±50°', async () => {
    const { lightAngle, aimFromVector, AIM_MAX } = await import('../src/aim.js');
    assert.equal(lightAngle(1), 0);
    assert.equal(lightAngle(-1), Math.PI);
    assert.ok(lightAngle(1, 0.3) > 0, 'direita: aim>0 aponta para baixo');
    assert.ok(lightAngle(-1, 0.3) < Math.PI, 'esquerda: aim>0 também aponta para baixo');
    const up = aimFromVector(100, -5000);
    assert.equal(up.aim, -AIM_MAX);
    assert.equal(aimFromVector(-300, 0).side, -1);
    assert.equal(aimFromVector(10, 20).side, 0, 'perto demais do personagem: lado indefinido');
});

test('main.js: todo identificador de config/aim usado está importado', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    for (const id of ['FLOOR_Y', 'CANVAS_W', 'aimFromVector', 'aimInput', 'initAim']) {
        assert.match(src.slice(0, src.indexOf('\nlet scene')), new RegExp('\\b' + id + '\\b'), id + ' não importado');
    }
});
