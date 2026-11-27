// Balanceamento por dificuldade (node --test tests/balance.test.mjs).
// Combina contas diretas sobre config.js com a simulação de tests/sim.mjs (robô que cumpre
// o puzzle contra a IA real). O robô é um piso, não um jogador: ele não desvia nem usa
// garrafas, então a taxa de vitória dele NÃO é meta; usamos só métricas estruturais.
import test from 'node:test';
import assert from 'node:assert/strict';
const { DIFFICULTIES, BATTERY_SECONDS, STAMINA_DRAIN_RATE, PLAYER_RUN_SPEED } = await import('../src/config.js');
const { runBot, summarize } = await import('./sim.mjs');

const order = ['facil', 'normal', 'pesadelo'];
const D = k => DIFFICULTIES[k];

test('esconderijo: sobrevivência cai com a dificuldade e segurar o fôlego sempre compensa', () => {
    for (let i = 1; i < order.length; i++) {
        assert.ok(D(order[i]).surviveBase < D(order[i - 1]).surviveBase);
        assert.ok(D(order[i]).surviveHold <= D(order[i - 1]).surviveHold);
    }
    for (const k of order) {
        assert.ok(D(k).surviveBase >= 0.3, `${k}: sem fôlego ainda tem chance justa`);
        assert.ok(D(k).surviveHold >= 0.8 && D(k).surviveHold - D(k).surviveBase >= 0.3, `${k}: segurar compensa`);
    }
});

test('bateria: luz total (cargas × duração) decresce com a dificuldade e nunca é menor que 6 min', () => {
    const total = k => BATTERY_SECONDS / D(k).batteryDrain * (1 + D(k).batteries);
    for (let i = 1; i < order.length; i++) assert.ok(total(order[i]) < total(order[i - 1]));
    for (const k of order) assert.ok(total(k) >= 360, `${k}: ${total(k).toFixed(0)}s de luz`);
});

test('corrida: dá para percorrer ao menos 55% da menor sala fugindo (escala do mapa)', () => {
    const run = (100 / STAMINA_DRAIN_RATE) * PLAYER_RUN_SPEED;
    assert.ok(run >= 0.55 * 1900, `corrida de ${run.toFixed(0)}px`);
});

test('simulação: toda partida termina e o assassino não acha o jogador cedo demais', () => {
    for (const k of order) {
        const runs = [];
        for (let i = 0; i < 24; i++) runs.push(runBot('BAL' + i, k, { aware: true, light: false }));
        assert.ok(runs.every(r => r.outcome !== 'timeout'), `${k}: sem partidas travadas`);
        const early = runs.filter(r => r.firstSpot !== null && r.firstSpot < 20).length / runs.length;
        assert.ok(early <= 0.1, `${k}: ${(early * 100).toFixed(0)}% avistados antes de 20s`);
        const dists = runs.flatMap(r => r.spotDist).sort((a, b) => a - b);
        if (dists.length) assert.ok(dists[Math.floor(dists.length / 2)] >= 90, `${k}: avista de muito perto`);
    }
});

test('simulação: quem joga bem vence mais no Fácil que no Pesadelo, e o Pesadelo continua letal', () => {
    // robô "atento" (recua e se esconde ao ouvir/ver o assassino, lanterna apagada) = teto de habilidade;
    // robô "ingênuo" (ignora o perigo) = piso. Um jogador real fica entre os dois.
    const win = (k, o) => summarize(k, o, 40).win;
    const aware = { aware: true, light: false }, naive = { aware: false, light: false };
    const [wf, wn, wp] = order.map(k => win(k, aware));
    assert.ok(wf >= wn - 0.05 && wn >= wp - 0.05, `atento: ${wf} / ${wn} / ${wp}`);
    assert.ok(wf >= 0.8, 'jogando bem, o Fácil é vencível');
    assert.ok(wp <= 0.85, 'Pesadelo ainda oferece risco real mesmo ao jogador atento');
    assert.ok(win('facil', naive) > win('pesadelo', naive), 'ingênuo: Fácil perdoa mais que o Pesadelo');
});

// ── Loop "armário → sair → ser achado" ────────────────────────────────────
test('loop do armário: o robô impaciente quase não volta ao armário nem é re-avistado logo', () => {
    for (const k of ['facil', 'normal']) {
        const s = summarize(k, { aware: true, light: false, eager: true }, 40);
        assert.ok(s.hideEnters < 1.5, `${k}: entradas no armário por partida = ${s.hideEnters}`);
        assert.ok(s.reSpot === null || s.reSpot > 5, `${k}: re-avistado ${s.reSpot}s após sair`);
        assert.ok(s.win >= 0.5, `${k}: impaciente ainda ganha com frequência (${s.win})`);
    }
});

test('sair do armário: bloqueado com assassino a < EXIT_SAFE_DIST na sala, livre fora disso', async () => {
    globalThis.document = globalThis.document || { getElementById: () => ({ textContent: '' }) };
    const { createPlayer, interact, exitBlocked, EXIT_SAFE_DIST } = await import('../src/player.js');
    const p = createPlayer(); p.hidden = { x: 500 }; p.x = 500; p.room = 2;
    const near = { room: 2, x: 500 + EXIT_SAFE_DIST - 50, state: 'patrol' };
    const far  = { room: 2, x: 500 + EXIT_SAFE_DIST + 50, state: 'patrol' };
    const other = { room: 3, x: 500, state: 'patrol' };
    assert.equal(exitBlocked(p, [near]), true);
    assert.equal(exitBlocked(p, [far, other]), false);
    assert.equal(interact(p, [], [near]), 'stayHidden');
    assert.ok(p.hidden, 'continua escondido');
    assert.equal(interact(p, [], [far]), null);
    assert.equal(p.hidden, null);
});

test('perseguição: em outra sala e sem ver o jogador por >2s, o assassino desiste', async () => {
    globalThis.document = globalThis.document || { getElementById: () => ({ textContent: '' }) };
    const { createKiller, updateKiller } = await import('../src/killer.js');
    const { createPlayer } = await import('../src/player.js');
    const { world, resetWorld } = await import('../src/world.js');
    const { seedRng } = await import('../src/rng.js');
    seedRng('T'); resetWorld(D('normal'));
    const player = createPlayer(); player.room = 2; player.x = 800;
    const k = createKiller(1, 300); k.state = 'chase'; k.lostSightTimer = 0; k.chaseAge = 0;
    const ctx = { player, items: [], world, diff: D('normal'), director: { pressure: 0, relax: 0, push: false }, hooks: {} };
    for (let t = 0; t < 60 * 1.5; t++) updateKiller(k, ctx, 1 / 60);
    assert.equal(k.state, 'chase', 'ainda persegue antes de 2s');
    for (let t = 0; t < 60 * 1.5; t++) updateKiller(k, ctx, 1 / 60);
    assert.equal(k.state, 'patrol', 'desistiu depois de >2s');
});
