// Simulação headless de uma partida: um jogador-robô cumpre o puzzle inteiro
// contra a IA real. Serve para medir o balanceamento por dificuldade (não é teste).
// Uso: node tests/sim.mjs  → imprime a tabela por dificuldade.
globalThis.document = { getElementById: () => ({ textContent: '' }) };
const { rooms, applyLayout }  = await import('../src/rooms.js');
const { world, resetWorld }   = await import('../src/world.js');
const { noise, emitNoise, tickNoise, resetNoise, pathDistance } = await import('../src/noise.js');
const { seedRng, shuffle, rnd } = await import('../src/rng.js');
const { spawnKillers, updateKiller } = await import('../src/killer.js');
const { createDirector, updateDirector } = await import('../src/director.js');
const { createPlayer, updatePlayer, interact, changeBattery } = await import('../src/player.js');
const { buildItems } = await import('../src/items.js');
const C = await import('../src/config.js');
const { DIFFICULTIES, NOISE, BREATH_DRAIN, PLAYER_WALK_SPEED, PLAYER_RUN_SPEED } = C;

const DT = 1 / 60;

// opts: { skilled: segura o fôlego na hora do armário; light: lanterna sempre ligada; maxTime }
export function runBot(seed, diffKey, opts = {}) {
    const { skilled = true, light = true, aware = false, eager = false, runner = false, maxTime = 1200 } = opts;
    seedRng(seed); applyLayout(shuffle);
    const diff = DIFFICULTIES[diffKey];
    resetWorld(diff); resetNoise();
    const items = buildItems(diff);
    const player = createPlayer();
    const killers = spawnKillers(diff, player);
    const director = createDirector();
    const st = { outcome: 'timeout', time: 0, spotted: 0, hits: 0, hideChecks: 0, hideSurvived: 0,
                 lightDead: 0, swaps: 0, firstSpot: null, chaseTime: 0, events: [], spotDist: [], spotAt: [], catchAt: [], hideEnters: 0, lastExit: null, reSpot: [] };
    const hooks = {
        onSpotted: k => { if (st.lastExit !== null) { st.reSpot.push(st.time - st.lastExit); st.lastExit = null; } st.events.push(`${st.time.toFixed(0)}s spotted`); st.spotDist.push(Math.abs(k.x - player.x)); st.spotAt.push(st.time); st.spotted++; if (st.firstSpot === null) st.firstSpot = st.time; },
        onCatch: () => {
            if (player.invuln > 0) return null;
            player.hits++; st.hits = player.hits; st.catchAt.push(st.time);
            if (player.hits >= diff.hits) { st.outcome = 'caught'; return 'dead'; }
            player.invuln = 2.5; return 'hurt';
        },
        onCheckHide: (k, item) => {
            if (player.hidden !== item) return;
            st.hideChecks++;
            st.events.push(`${st.time.toFixed(0)}s check r${k.room} hold=${player.holding} mem=${k.memory.hideCount}`);
            if (rnd() > (player.holding ? diff.surviveHold : diff.surviveBase)) { st.outcome = 'found'; st.cause = 'check'; }
            else st.hideSurvived++;
        },
        onBlackout: () => {}, onFakeSound: () => {},
    };
    const ctx = { player, items, world, diff, director, hooks };
    player.light = light;

    const unsearched = room => items.filter(i => i.room === room && i.itemType === 's' && !i.searched);
    const hideNear = () => items.filter(i => i.room === player.room && i.itemType === 'h')
        .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    const panel = items.find(i => i.itemType === 'p');

    // Próximo alvo { room, x, item?, door? } conforme o estágio do puzzle.
    function nextGoal() {
        const search = rs => {
            if (unsearched(player.room).length && rs.includes(player.room))
                return unsearched(player.room).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
            const cand = rs.flatMap(r => unsearched(r));
            if (!cand.length) return null;
            return cand.sort((a, b) => pathDistance(player.room, player.x, a.room, a.x) - pathDistance(player.room, player.x, b.room, b.x))[0];
        };
        let it;
        if (!world.power) {
            if (player.hasFuse) it = panel;
            else it = search([1, 2, 3, 4, 6]);
        } else if (!player.hasKey) it = search([7]);
        else return { room: 1, x: rooms[1].doors.find(d => d.front).x, front: true };
        return it ? { room: it.room, x: it.x, item: it } : null;
    }

    const doorTowards = room => {
        if (player.room === 0) return rooms[0].doors.find(d => d.to === room);
        return rooms[player.room].doors[0];
    };

    // Jogador atento: ouve/vê um assassino (ainda sem perseguição) a menos de 650px na sala.
    const danger = () => killers.some(k => k.room === player.room && k.state !== 'chase' && Math.abs(k.x - player.x) < 650);
    let fleeing = false;
    for (let t = 0; t < maxTime * 60; t++) {
        st.time = t * DT;
        const up = updatePlayer(player, DT, { diff });
        if (up.lightDied) st.lightDead++;
        const chasers = killers.filter(k => k.state === 'chase' && k.room === player.room);
        fleeing = chasers.length > 0;

        // Pilhas
        if (light && !player.hidden && player.battery < 15 && player.batteries > 0 && changeBattery(player)) st.swaps++;
        if (light && !player.hidden && player.battery > 0) player.light = true;

        let moving = false, running = false, wantX = null, act = null;
        if (player.hidden) {
            // só sai quando nenhum assassino está procurando nem a menos de 600px do armário
            const near = killers.some(k => k.room === player.room
                && (['search', 'inspect', 'chase'].includes(k.state) || Math.abs(k.x - player.hidden.x) < 600));
            const checking = skilled && killers.some(k => k.room === player.room && k.state === 'inspect'
                && Math.abs(k.x - player.hidden.x) < 260);
            if (checking && player.breath > 0) {
                player.holding = true; player.breath = Math.max(0, player.breath - BREATH_DRAIN * DT);
                if (player.breath <= 0) { player.holding = false; st.outcome = 'found'; st.cause = 'gasp'; }
            }
            // eager: sai assim que o jogo permite (reproduz o jogador impaciente, sem a folga de 600px)
            const nearEager = killers.some(k => k.room === player.room && ['search', 'inspect', 'chase'].includes(k.state));
            if (!(eager ? nearEager : near) && player.hideTimer >= C.HIDE_DURATION) act = 'interact';
        } else if ((fleeing || (aware && danger())) && hideNear() && Math.abs(hideNear().x - player.x) < 700) {
            const h = hideNear(); wantX = h.x; running = fleeing;
            if (Math.abs(h.x - player.x) < 40) act = 'interact';
        } else if (runner && fleeing) {
            // sem armário à mão: corre para a porta do lado oposto ao perseguidor
            const ch = chasers[0];
            const ds = rooms[player.room].doors.filter(d => !d.front && Math.sign(d.x - player.x) !== Math.sign(ch.x - player.x));
            const d = (ds.length ? ds : rooms[player.room].doors)[0];
            wantX = d.x; running = true;
            if (Math.abs(d.x - player.x) < 40) act = 'interact';
        } else if (aware && danger() && !fleeing) {
            // sem esconderijo à mão: recua em direção à porta mais próxima (anda, não corre)
            const d = rooms[player.room].doors.slice().sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
            wantX = d.x; if (Math.abs(d.x - player.x) < 40) act = 'interact';
        } else {
            const g = nextGoal();
            if (!g) break;
            running = fleeing;
            if (g.room === player.room) {
                wantX = g.x;
                if (Math.abs(g.x - player.x) < 40) act = 'interact';
            } else {
                const d = doorTowards(g.room);
                wantX = d.x;
                if (Math.abs(d.x - player.x) < 40) act = 'interact';
            }
        }

        if (act === 'interact') {
            const wasRoom = player.room, wasHidden = !!player.hidden;
            const ev = interact(player, items, killers);
            if (wasHidden && !player.hidden) st.lastExit = st.time;
            if (!wasHidden && player.hidden) st.hideEnters++;
            if (ev === 'win') { st.outcome = 'win'; break; }
            if (typeof ev === 'string' && ev.startsWith('die:')) { st.outcome = 'found'; st.cause = ev; }
            if (ev === 'locked' || ev === 'noPower') { /* espera */ }
            if (player.room !== wasRoom) fleeing = false;
        } else if (wantX !== null && Math.abs(wantX - player.x) > 6) {
            const dir = Math.sign(wantX - player.x);
            const hurtSlow = 1 - 0.2 * Math.min(player.hits, 2);
            const tired = player.tired || player.stamina <= 0;
            running = running && !tired;
            const speed = (running ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED) * hurtSlow;
            player.x += dir * Math.min(speed * DT, Math.abs(wantX - player.x)); player.dir = dir;
            moving = true;
            if (running) { player.stamina -= C.STAMINA_DRAIN_RATE * DT; if (player.stamina <= 0) { player.stamina = 0; player.tired = true; } }
            player.stepDistance += speed * DT;
            if (player.stepDistance > (running ? 50 : 62)) {
                player.stepDistance = 0;
                emitNoise(player.room, player.x, (running ? NOISE.run : NOISE.walk) * (player.hits > 0 ? NOISE.hurtMul : 1), 'step');
            }
        }
        player.moving = moving;
        player.noisy = moving && (running || player.tired);

        for (const k of killers) updateKiller(k, ctx, DT);
        updateDirector(director, { killers, world, hooks }, DT);
        tickNoise(DT);
        if (killers.some(k => k.state === 'chase')) st.chaseTime += DT;
        if (st.outcome !== 'timeout') break;
    }
    return st;
}

export function summarize(diffKey, opts, seeds = 60) {
    const runs = [];
    for (let i = 0; i < seeds; i++) runs.push(runBot('SIM' + i, diffKey, opts));
    const n = runs.length, avg = f => runs.reduce((a, r) => a + f(r), 0) / n;
    const wins = runs.filter(r => r.outcome === 'win');
    const checks = runs.reduce((a, r) => a + r.hideChecks, 0);
    return {
        diff: diffKey, runs: n,
        win: wins.length / n,
        found: runs.filter(r => r.outcome === 'found').length / n,
        caught: runs.filter(r => r.outcome === 'caught').length / n,
        timeout: runs.filter(r => r.outcome === 'timeout').length / n,
        winTime: wins.length ? wins.reduce((a, r) => a + r.time, 0) / wins.length : null,
        spotted: avg(r => r.spotted), hits: avg(r => r.hits),
        firstSpot: avg(r => r.firstSpot ?? r.time),
        hideSurvive: checks ? runs.reduce((a, r) => a + r.hideSurvived, 0) / checks : null,
        lightDead: avg(r => r.lightDead), swaps: avg(r => r.swaps),
        spotDist: avg(r => r.spotDist.length ? r.spotDist.reduce((a, b) => a + b, 0) / r.spotDist.length : 0),
        reaction: (() => { const v = runs.filter(r => r.spotAt.length && r.catchAt.length).map(r => r.catchAt[0] - r.spotAt[0]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })(),
        hideEnters: avg(r => r.hideEnters),
        reSpot: (() => { const v = runs.flatMap(r => r.reSpot); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })(),
        reSpot10: (() => { const v = runs.flatMap(r => r.reSpot); return v.length ? v.filter(x => x < 10).length / v.length : null; })(),
        causes: runs.filter(r => r.cause).reduce((a, r) => (a[r.cause.slice(0, 22)] = (a[r.cause.slice(0, 22)] || 0) + 1, a), {}),
    };
}

if (process.argv[1] && process.argv[1].endsWith('sim.mjs')) {
    const f = v => v === null ? '-' : typeof v === 'number' ? v.toFixed(2) : v;
    const fmt = v => v && typeof v === 'object' ? JSON.stringify(v) : f(v);
    for (const [skilled, light, aware, eager, runner] of [[true, false, false, false], [true, false, true, false], [true, true, true, false], [true, false, true, true], [true, false, false, false, true]]) {
        console.log(`\n== robô ${skilled ? 'habilidoso' : 'sem segurar o fôlego'} · lanterna ${light ? 'sempre ligada' : 'apagada'} · ${aware ? 'atento' : 'ingênuo'}${eager ? ' · impaciente' : ''}${runner ? ' · corredor' : ''} ==`);
        for (const d of Object.keys(DIFFICULTIES)) {
            const s = summarize(d, { skilled, light, aware, eager, runner });
            console.log(Object.entries(s).map(([k, v]) => `${k}=${fmt(v)}`).join('  '));
        }
    }
}
