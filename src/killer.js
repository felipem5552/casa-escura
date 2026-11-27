// =============================================================================
// killer.js — IA dos assassinos (vários, com papéis diferentes)
// =============================================================================
//
// Estados:
//  patrol      → anda entre salas (pesadas por "calor" e pelo diretor de tensão).
//                Ao terminar numa sala pode decidir inspecionar os armários.
//  investigate → ouviu um ruído: vai até lá, olha ao redor, volta à patrulha.
//  inspect     → abre os armários da sala um a um (jogador escondido corre risco).
//  chase       → persegue o jogador. Se perder de vista por `role.lost` s, desiste.
//  search      → viu o jogador se esconder: vasculha e depois inspeciona armários.
//
// Memória: lembra a sala onde o jogador se escondeu e volta para checar.
// Visão: cone frontal (de costas, enxerga bem menos). Audição: via noise.js.
// Portas trancadas: precisa de tempo para arrombar (e faz barulho).
//
// Tudo que é aleatório usa rng.js (determinístico por seed).

import { KILLER_ROLES, DETECT_DIST_CLOSE, DETECT_DIST_RUNNING, DETECT_DIST_LIGHT, ROOM_AMBIENT_RADIUS } from './config.js';
import { rooms, TOTAL_ROOMS } from './rooms.js';
import { rnd, rndRange, pick } from './rng.js';
import { hearNoise, pathDistance } from './noise.js';

// Spawn justo: cada assassino nasce numa sala-candidata cuja distância de caminhada
// até o jogador seja >= SPAWN_MIN_PATH (senão, nas mais distantes), e fica surdo por
// SPAWN_GRACE s para o jogador ter tempo de se orientar. Deterministico (rng.js).
export const SPAWN_MIN_PATH = 2400;
export const SPAWN_GRACE    = 15;
const SPAWN_ROOMS = [2, 3, 4, 5, 6];   // exclui Sala (início), Corredor e Escritório (trancado)

export function spawnKillers(diff, player) {
    const used = new Set();
    return diff.killers.map((role, i) => {
        const cands = [];
        for (const room of SPAWN_ROOMS) {
            if (used.has(room)) continue;
            for (const f of [0.4, 0.55, 0.7, 0.85]) {
                const x = Math.round(rooms[room].w * f);
                cands.push({ room, x, d: pathDistance(player.room, player.x, room, x) });
            }
        }
        cands.sort((a, b) => b.d - a.d);
        let ok = cands.filter(c => c.d >= SPAWN_MIN_PATH);
        if (!ok.length) ok = cands.slice(0, 3);
        const c = pick(ok);
        used.add(c.room);
        const k = createKiller(c.room, c.x, 'killer_' + i, role);
        k.grace = SPAWN_GRACE;
        return k;
    });
}

export function createKiller(startRoom, startX, id = 'killer', roleKey = 'hunter') {
    return {
        id, roleKey, role: KILLER_ROLES[roleKey],
        room: startRoom, x: startX, px: null, dir: 1,
        state: 'patrol', goal: startRoom, visits: 1, targetX: null,
        waitTimer: 1, lostSightTimer: 0, searchTimer: 0, stun: 0,
        target: null, phase: 'go', lookTimer: 0, flipTimer: 0,
        inspectQueue: [], inspectWait: 0,
        memory: { hideRoom: null, hideX: 0, hideCount: 0, lastSeen: null },
        stepAcc: 0, lastHeardId: 0, doorTimer: null, bangTimer: null,
        roomAge: 99,       // s desde a última troca de sala
        avoidRoom: -1, avoidTimer: 0,   // sala que acabou de vistoriar: evita voltar logo
        holdTimer: 0,      // s esperando na porta porque o jogador está colado na chegada
        grace: 0,    // s sem ouvir ruídos (início da partida)
        arrive: 0,   // s sem enxergar o jogador após atravessar uma porta
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const ARRIVE_GRACE = 0.9;
const PUSH_MIN_ROOM_AGE   = 12;   // push só para quem está há ≥12s na sala atual
const PUSH_MIN_PLAYER_AGE = 8;    // ...e não para a sala em que o jogador acabou de entrar
const SURVIVE_RELAX       = 20;   // respiro do diretor após sobreviver a uma vistoria
const AVOID_ROOM_TIME     = 25;   // s evitando voltar à sala recém-vistoriada
const ARRIVE_MIN_DIST     = 450;  // assassino não entra se o jogador está a menos disso da porta de chegada
const ARRIVE_MAX_HOLD     = 5;
const CHASE_GIVEUP_OTHER_ROOM = 2;  // s sem ver o jogador, já em outra sala: desiste (fuga pela porta funciona)
const CHASE_START_MUL     = 0.8;  // perseguição começa a 80% da velocidade...
const CHASE_RAMP_TIME     = 3;    // ...e chega a 100% em 3s (correr do jogador abre distância)    // ...mas só espera esse tempo (evita travar)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function moveToward(k, targetX, speed, dt) {
    const diff = targetX - k.x;
    if (Math.abs(diff) < 6) return true;
    k.dir = Math.sign(diff);
    const step = Math.min(Math.abs(diff), speed * dt);
    k.x += k.dir * step;
    k.stepAcc += step;
    return false;
}

function getDoorBetween(fromRoom, toRoom) {
    if (fromRoom === 0) return rooms[0].doors.find(d => d.to === toRoom);
    return rooms[fromRoom].doors[0];
}

function passThrough(k, door, ctx) {
    const prev = k.room;
    k.room = door.to;
    const arrival = rooms[k.room].doors.find(d => d.to === prev);
    k.x = arrival.x + (arrival.x < rooms[k.room].w / 2 ? 55 : -55);
    k.roomAge = 0; k.holdTimer = 0;
    k.arrive = ARRIVE_GRACE;   // dá ao jogador perto da porta um instante para reagir
    ctx.hooks.onDoor?.(k, prev, k.room);
}

// Anda até (room, x), atravessando portas; arromba as trancadas.
// Retorna true ao chegar no destino (mesma sala e perto de x).
function goTo(k, room, x, speed, dt, ctx) {
    if (k.room === room) return moveToward(k, x, speed, dt);

    const door = getDoorBetween(k.room, room);
    if (!moveToward(k, door.x, speed, dt)) return false;

    // Não surge em cima do jogador: espera na porta (no máx. ARRIVE_MAX_HOLD s).
    if (k.state !== 'chase' && door.to === ctx.player.room && k.holdTimer < ARRIVE_MAX_HOLD) {
        const back = rooms[door.to].doors.find(d => d.to === k.room);
        const ax = back.x + (back.x < rooms[door.to].w / 2 ? 55 : -55);
        if (Math.abs(ax - ctx.player.x) < ARRIVE_MIN_DIST) { k.holdTimer += dt; return false; }
    }

    const lockRoom = k.room === 0 ? door.to : k.room;
    if (ctx.world.locked[lockRoom]) {
        k.doorTimer = (k.doorTimer ?? ctx.diff.doorTime) - dt;
        k.bangTimer = (k.bangTimer ?? 0) - dt;
        if (k.bangTimer <= 0) { k.bangTimer = 0.55; ctx.hooks.onBang?.(k, lockRoom, door.x); }
        if (k.doorTimer <= 0) { ctx.world.locked[lockRoom] = false; k.doorTimer = null; k.bangTimer = null; }
        return false;
    }
    k.doorTimer = null; k.bangTimer = null;
    passThrough(k, door, ctx);
    return false;
}

// Escolhe a próxima sala da patrulha: peso base 1 + calor da sala + pressão do
// diretor na sala do jogador + memória de esconderijo. Respira após perseguição.
function chooseNewPatrolGoal(k, ctx) {
    const { player, world } = ctx;
    const dir = ctx.director || { pressure: 0, relax: 0, push: false };

    if (dir.push && dir.relax <= 0 && player.room !== k.room && (player.room !== 7 || world.power)
        && k.roomAge >= PUSH_MIN_ROOM_AGE && (player.roomAge ?? 99) >= PUSH_MIN_PLAYER_AGE
        && !(k.avoidRoom === player.room && k.avoidTimer > 0)) {
        dir.push = false;
        k.goal = player.room; k.visits = 1; k.targetX = null;
        return;
    }

    let total = 0;
    const weights = [];
    for (let r = 0; r < TOTAL_ROOMS; r++) {
        let w = 0;
        if (r !== k.room && (r !== 7 || world.power)) {
            w = 1 + Math.min(3, (world.heat[r] || 0) * 0.08);
            if (r === player.room) w += 2.5 * dir.pressure;
            if (r === player.room && dir.relax > 0) w *= 0.15;
            if (r === k.memory.hideRoom) w += 1.5;
            if (r === k.avoidRoom && k.avoidTimer > 0) w *= 0.1;
        }
        weights.push(w); total += w;
    }
    let roll = rnd() * total, goal = 0;
    for (let r = 0; r < weights.length; r++) { roll -= weights[r]; if (roll <= 0) { goal = r; break; } }

    k.goal = goal; k.visits = 1; k.targetX = null;
}

function hidesIn(k, ctx) {
    return ctx.items.filter(i => i.room === k.room && i.itemType === 'h');
}

function startInspect(k, hides, nearX) {
    k.inspectQueue = hides.slice().sort((a, b) => Math.abs(a.x - nearX) - Math.abs(b.x - nearX));
    k.inspectWait  = 0;
    k.state = 'inspect';
}

// Decide se vai checar os armários da sala atual.
function maybeInspect(k, ctx) {
    const hides = hidesIn(k, ctx);
    if (!hides.length) return false;
    let p = k.role.checkChance * ctx.diff.checkMul;
    if (k.memory.hideRoom === k.room) p += 0.45;
    if (rnd() >= Math.min(0.95, p)) return false;
    startInspect(k, hides, k.memory.hideRoom === k.room ? k.memory.hideX : k.x);
    return true;
}

function canSeePlayer(k, ctx) {
    const { player, world, diff } = ctx;
    if (player.hidden || k.room !== player.room) return false;

    const d = Math.abs(k.x - player.x);
    const facing = Math.sign(player.x - k.x) === k.dir || d < 110;
    const v = k.role.vision * diff.detect * (facing ? 1 : 0.45);
    // Justiça: sem lanterna nem corrida, ele não te vê antes de você poder vê-lo
    // (o raio de visão ambiente da sala limita a detecção de "perto").
    const closeBase = Math.min(DETECT_DIST_CLOSE, ROOM_AMBIENT_RADIUS[k.room] ?? DETECT_DIST_CLOSE);
    const close = (closeBase + (world.power ? 50 : 0)) * v;

    if (player.light && d < DETECT_DIST_LIGHT * v) return true;
    if (d < close) return true;
    if (player.noisy && d < DETECT_DIST_RUNNING * v) return true;
    return false;
}

function toChase(k, ctx) {
    k.state = 'chase';
    k.lostSightTimer = 0; k.chaseAge = 0;
    k.memory.lastSeen = { room: ctx.player.room, x: ctx.player.x };
    ctx.hooks.onSpotted?.(k);
}

function startInvestigate(k, n, ctx) {
    k.state = 'investigate';
    k.phase = 'go';
    k.target = { room: n.room, x: n.x, kind: n.kind };
    k.waitTimer = 0;
    ctx.hooks.onHeard?.(k, n);
}

// ── Update principal ──────────────────────────────────────────────────────
// ctx = { player, items, world, diff, director, hooks }
// hooks: onSpotted, onCatch → 'hurt'|'dead', onHeard, onStep, onDoor, onBang,
//        onOpenHide, onCheckHide

export function updateKiller(k, ctx, dt) {
    const { player, diff, hooks } = ctx;
    const role = k.role;
    const spd  = v => v * diff.speed;
    k.lostSightTimer += dt;
    if (k.arrive > 0) k.arrive -= dt;
    if (k.grace  > 0) k.grace  -= dt;
    k.roomAge += dt;
    if (k.avoidTimer > 0) k.avoidTimer -= dt;

    if (k.stun > 0) { k.stun -= dt; return; }

    if (k.state === 'patrol' || k.state === 'investigate' || k.state === 'inspect') {
        if (!(k.arrive > 0) && !(player.enterGrace > 0) && canSeePlayer(k, ctx)) { toChase(k, ctx); return; }
        const heard = hearNoise(k, role.hearing * diff.hearing);   // sempre consome o evento
        if (heard && !(k.grace > 0)) startInvestigate(k, heard, ctx);
    }

    switch (k.state) {
    // ── Patrulha ───────────────────────────────────────────────────────
    case 'patrol': {
        if (k.waitTimer > 0) { k.waitTimer -= dt; break; }
        if (k.room === k.goal) {
            if (k.targetX === null) k.targetX = rndRange(300, rooms[k.room].w - 300);
            if (moveToward(k, k.targetX, spd(role.patrol), dt)) {
                k.targetX = null;
                k.waitTimer = rndRange(1, 2.5);
                if (--k.visits <= 0 && !maybeInspect(k, ctx)) chooseNewPatrolGoal(k, ctx);
            }
        } else {
            goTo(k, k.goal, 0, spd(role.patrol), dt, ctx);
            if (k.state === 'patrol' && k.room !== k.goal) k.waitTimer = Math.max(k.waitTimer, 0);
        }
        break;
    }

    // ── Investigar ruído ───────────────────────────────────────────────
    case 'investigate': {
        if (k.phase === 'go') {
            if (goTo(k, k.target.room, k.target.x, spd(role.patrol * 1.25), dt, ctx)) {
                k.phase = 'look';
                k.lookTimer = k.target.kind === 'distract' ? 3.2 : rndRange(1.6, 2.8);
                k.flipTimer = 0.7;
            }
        } else {
            k.lookTimer -= dt; k.flipTimer -= dt;
            if (k.flipTimer <= 0) { k.dir *= -1; k.flipTimer = 0.8; }
            if (k.lookTimer <= 0) {
                k.state = 'patrol'; k.goal = k.room; k.visits = 1; k.targetX = null; k.waitTimer = 0.4;
            }
        }
        break;
    }

    // ── Inspecionar armários ───────────────────────────────────────────
    case 'inspect': {
        const item = k.inspectQueue[0];
        if (!item) {
            // Terminou a vistoria: vai embora (sem plantão) e evita voltar a esta sala por um tempo.
            k.avoidRoom = k.room; k.avoidTimer = AVOID_ROOM_TIME;
            k.state = 'patrol'; chooseNewPatrolGoal(k, ctx); k.waitTimer = 0;
            break;
        }
        if (k.inspectWait > 0) {
            k.inspectWait -= dt;
            if (k.inspectWait <= 0) {
                hooks.onCheckHide?.(k, item);
                k.inspectQueue.shift();
                // Já vistoriou: esquece a suspeita, senão voltaria ao mesmo armário em
                // loop (a simulação mostrou até 20 vistorias seguidas no mesmo esconderijo).
                if (k.memory.hideRoom === k.room) k.memory.hideRoom = null;
                // O jogador sobreviveu à vistoria: respiro garantido pelo diretor.
                if (player.hidden === item && ctx.director) {
                    ctx.director.relax = Math.max(ctx.director.relax, SURVIVE_RELAX);
                    ctx.director.calm = 0;
                }
            }
            break;
        }
        if (goTo(k, k.room, item.x, spd(role.patrol), dt, ctx)) {
            k.inspectWait = 1.3;
            hooks.onOpenHide?.(k, item);
        }
        break;
    }

    // ── Perseguição ────────────────────────────────────────────────────
    case 'chase': {
        k.chaseAge = (k.chaseAge ?? 0) + dt;
        const chaseSpd = spd(role.chase) * (CHASE_START_MUL + (1 - CHASE_START_MUL) * Math.min(1, k.chaseAge / CHASE_RAMP_TIME));
        if (canSeePlayer(k, ctx)) {
            k.lostSightTimer = 0;
            k.memory.lastSeen = { room: player.room, x: player.x };
        }
        if (k.room === player.room) {
            if (player.hidden) {
                k.state = 'search';
                k.searchTimer = Math.max(0.5, 6 - player.hideTimer);
                k.targetX = null; k.waitTimer = 0.5;
                k.memory.hideRoom = k.room; k.memory.hideX = player.x; k.memory.hideCount++;
                break;
            }
            moveToward(k, player.x, chaseSpd, dt);
            if (Math.abs(k.x - player.x) < 34 && player.invuln <= 0) {
                if (hooks.onCatch?.(k) === 'hurt') k.stun = 1.8;
            }
        } else {
            goTo(k, player.room, player.x, chaseSpd, dt, ctx);
        }
        if (k.lostSightTimer > role.lost || (k.room !== player.room && k.lostSightTimer > CHASE_GIVEUP_OTHER_ROOM)) {
            k.state = 'patrol'; chooseNewPatrolGoal(k, ctx); k.waitTimer = 1;
        }
        break;
    }

    // ── Busca (viu o jogador se esconder) ──────────────────────────────
    case 'search': {
        k.searchTimer -= dt;
        if (k.waitTimer > 0) {
            k.waitTimer -= dt;
        } else {
            if (k.targetX === null) k.targetX = clamp(k.memory.hideX + rndRange(-420, 420), 200, rooms[k.room].w - 200);
            if (moveToward(k, k.targetX, spd(role.search), dt)) { k.targetX = null; k.waitTimer = rndRange(0.6, 1.3); }
        }
        if (k.searchTimer <= 0) {
            const hides = hidesIn(k, ctx);
            if (hides.length) startInspect(k, hides, k.memory.hideX);   // sabe que ele se escondeu aqui
            else { k.state = 'patrol'; chooseNewPatrolGoal(k, ctx); k.waitTimer = 0; }
            k.targetX = null;
        }
        break;
    }
    }

    if (k.stepAcc > (k.state === 'chase' ? 60 : 80)) { k.stepAcc = 0; hooks.onStep?.(k); }
}

// ── Consultas ─────────────────────────────────────────────────────────────

// Intensidade do batimento (0–1) pelo assassino mais próximo (distância de caminhada).
export function getHeartbeatIntensity(killers, player) {
    let max = 0;
    for (const k of killers) {
        const d = pathDistance(k.room, k.x, player.room, player.x);
        const i = k.room === player.room
            ? Math.max(0, 1 - d / 1750)
            : (d < 1600 ? 0.18 : 0);
        if (i > max) max = i;
    }
    return max;
}

export const anyKillerChasingInRoom = (killers, player) =>
    killers.some(k => k.state === 'chase' && k.room === player.room);

export const anyKillerChasing = killers => killers.some(k => k.state === 'chase');
