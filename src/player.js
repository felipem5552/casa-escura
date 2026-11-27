// =============================================================================
// player.js — Estado e ações do jogador
// =============================================================================

import {
    PLAYER_WALK_SPEED, PLAYER_RUN_SPEED,
    STAMINA_DRAIN_RATE, STAMINA_RECOVER_IDLE, STAMINA_RECOVER_WALK,
    STAMINA_TIRED_THRESHOLD, HIDE_DURATION,
    DOOR_COOLDOWN, ENTER_GRACE, INTERACT_RANGE, INTERACT_RANGE_ITEM,
    NOISE, BATTERY_SECONDS, BREATH_DRAIN, BREATH_RECOVER,
} from './config.js';
import { rooms }  from './rooms.js';
import { world }  from './world.js';
import { emitNoise } from './noise.js';
import { isDown } from './input.js';
import { sfxDoor, sfxClick, sfxSearch, sfxNarrative, sfxPower, sfxPickup } from './audio.js';

export function createPlayer() {
    return {
        room: 1, x: 300, dir: 1, aim: 0,
        stamina: 100, tired: false, light: false,
        battery: 100, batteries: 0,
        hasKey: false, hasFuse: false, bottles: 0,
        hits: 0, invuln: 0, enterGrace: 0, roomAge: 99,   // enterGrace: s após trocar de sala em que nenhum assassino te avista
        hidden: null, hideTimer: 0,
        breath: 100, holding: false,
        noisy: false,
        docs: new Set(), photoSeen: false,
        stepDistance: 0, breathTimer: 0, heartbeatTimer: 0, doorCooldown: 0,
        moving: false,
        narrativeText: null, narrativeTimer: 0,
    };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const roomOfDoor = (player, door) => (player.room === 0 ? door.to : player.room);

// ── Interagíveis ──────────────────────────────────────────────────────────
// Prioridade: sair do esconderijo > porta > item (o mais próximo vence).
export function getNearbyInteractable(player, items) {
    if (player.hidden) return { type: 'exitHide' };

    let best = null, bestDist = Infinity;
    rooms[player.room].doors.forEach(door => {
        const dist = Math.abs(door.x - player.x);
        if (dist < INTERACT_RANGE && dist < bestDist) { bestDist = dist; best = { type: 'door', door }; }
    });
    items.forEach(item => {
        if (item.room !== player.room) return;
        const dist = Math.abs(item.x - player.x);
        if (dist < INTERACT_RANGE_ITEM && dist < bestDist) { bestDist = dist; best = { type: 'item', item }; }
    });
    return best;
}

// Só dá para sair do armário se nenhum assassino estiver perto na sala.
export const EXIT_SAFE_DIST = 500;
export const exitBlocked = (player, killers) =>
    killers.some(k => k.room === player.room && Math.abs(k.x - player.x) < EXIT_SAFE_DIST);

export const docTotal = items => items.filter(i => i.itemType === 'n' && !i.special).length;

// Processa a tecla de interagir. Retorna um evento (string) para o main tratar:
//  'win' | 'locked' | 'noPower' | 'unlocked' | 'roomChange' | 'die:<msg>'
//  'foundKey|foundFuse|foundBattery|foundBottle|foundMedkit' | 'searchEmpty'
//  'alreadySearched' | 'powerOn' | 'needFuse' | 'powerAlready' | 'end:stay' | null
export function interact(player, items, killers) {
    const nearby = getNearbyInteractable(player, items);
    if (!nearby) return null;

    if (nearby.type === 'exitHide') {
        if (killers.some(k => k.room === player.room && (k.state === 'search' || k.state === 'inspect'))) {
            return 'die:Ele te encontrou ao sair do esconderijo.';
        }
        if (exitBlocked(player, killers)) return 'stayHidden';
        player.hidden = null; player.holding = false;
        document.getElementById('hide').textContent = '';
        emitNoise(player.room, player.x, 60, 'door');
        sfxDoor(0.3);
        return null;
    }

    if (nearby.type === 'door') {
        const door = nearby.door;
        if (door.front) {
            if (player.hasKey) return 'win';
            sfxClick(); return 'locked';
        }
        if (door.needs === 'power' && !world.power) { sfxClick(); return 'noPower'; }

        const lockRoom = roomOfDoor(player, door);
        if (world.locked[lockRoom]) {
            world.locked[lockRoom] = false;
            emitNoise(player.room, door.x, NOISE.lock, 'lock');
            sfxClick(); return 'unlocked';
        }
        if (player.doorCooldown > 0) return null;

        const previousRoom = player.room;
        player.room = door.to;
        const arrival = rooms[player.room].doors.find(d => d.to === previousRoom);
        player.x = arrival.x + (arrival.x < rooms[player.room].w / 2 ? 55 : -55);
        player.doorCooldown = DOOR_COOLDOWN;
        player.enterGrace = ENTER_GRACE; player.roomAge = 0;
        emitNoise(previousRoom, door.x, NOISE.door, 'door');
        sfxDoor(1);
        return 'roomChange';
    }

    const item = nearby.item;

    if (item.itemType === 'h') {
        player.hidden = item; player.hideTimer = 0; player.x = item.x;
        player.breath = 100; player.holding = false;
        if (player.light) { player.light = false; sfxClick(); }
        if (killers.some(k => k.state === 'patrol' && k.room === player.room && Math.abs(k.x - player.x) < 70)) {
            return 'die:Ele estava bem do seu lado.';
        }
        return null;
    }

    if (item.itemType === 'n') {
        if (item.special === 'photo' && player.docs.size >= docTotal(items)) {
            if (player.photoSeen) return 'end:stay';
            player.photoSeen = true;
            player.narrativeText  = 'Você reconhece o rosto riscado. É o seu. Algo na casa espera que você fique (E).';
            player.narrativeTimer = 6;
            sfxNarrative();
            return null;
        }
        if (!item.special) player.docs.add(item.room + ':' + item.x);
        player.narrativeText  = item.loreText;
        player.narrativeTimer = 5;
        sfxNarrative();
        return null;
    }

    if (item.itemType === 'p') {
        if (world.power) return 'powerAlready';
        if (!player.hasFuse) { sfxClick(); return 'needFuse'; }
        player.hasFuse = false;
        world.power = true;
        emitNoise(player.room, player.x, NOISE.power, 'power');
        sfxPower();
        return 'powerOn';
    }

    // Móvel vasculhável
    if (item.searched) return 'alreadySearched';
    item.searched = true;
    emitNoise(player.room, item.x, NOISE.search, 'search');
    sfxSearch();

    const content = item.content;
    item.content = null;
    if (content === 'key')     { player.hasKey = true;  sfxPickup(); return 'foundKey'; }
    if (content === 'fuse')    { player.hasFuse = true; sfxPickup(); return 'foundFuse'; }
    if (content === 'battery') { player.batteries++;    sfxPickup(); return 'foundBattery'; }
    if (content === 'bottle')  { player.bottles++;      sfxPickup(); return 'foundBottle'; }
    if (content === 'medkit')  { player.hits = Math.max(0, player.hits - 1); sfxPickup(); return 'foundMedkit'; }
    return 'searchEmpty';
}

// Jogar garrafa (distração). Retorna { x } do impacto ou null.
export function throwBottle(player) {
    if (player.hidden || player.bottles <= 0) return null;
    player.bottles--;
    const x = clamp(player.x + player.dir * 480, 80, rooms[player.room].w - 80);
    emitNoise(player.room, x, NOISE.distract, 'distract');
    return { x };
}

// Trocar pilhas. Retorna true se trocou.
export function changeBattery(player) {
    if (player.batteries <= 0 || player.battery >= 100) return false;
    player.batteries--; player.battery = 100;
    return true;
}

// Trancar/destrancar a porta mais próxima. Retorna 'locked' | 'unlocked' | null.
export function toggleDoorLock(player) {
    if (player.hidden) return null;
    let best = null, bestDist = Infinity;
    rooms[player.room].doors.forEach(door => {
        const d = Math.abs(door.x - player.x);
        if (!door.front && d < INTERACT_RANGE && d < bestDist) { bestDist = d; best = door; }
    });
    if (!best) return null;
    if (best.needs === 'power' && !world.power) return null;
    const r = roomOfDoor(player, best);
    world.locked[r] = !world.locked[r];
    emitNoise(player.room, best.x, NOISE.lock, 'lock');
    sfxClick();
    return world.locked[r] ? 'locked' : 'unlocked';
}

// ── Movimento, stamina, bateria, fôlego ───────────────────────────────────
// ctx = { diff }. Retorna { isRunning, speed, lightDied, gasp }.
export function updatePlayer(player, dt, ctx) {
    const diff = ctx.diff;
    if (player.doorCooldown > 0) player.doorCooldown -= dt;
    if (player.invuln > 0)       player.invuln -= dt;
    if (player.enterGrace > 0)   player.enterGrace -= dt;
    player.roomAge += dt;

    const moveDir = player.hidden ? 0 : (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
    let gasp = false;

    // Escondido: contagem + fôlego
    if (player.hidden) {
        player.hideTimer += dt;
        const wantsHold = isDown('breath') && player.breath > 0;
        if (wantsHold) {
            player.breath = Math.max(0, player.breath - BREATH_DRAIN * dt);
            if (player.breath <= 0) { gasp = true; player.holding = false; }
            else player.holding = true;
        } else {
            if (player.holding && player.breath < 100) { /* soltou */ }
            player.holding = false;
            player.breath = Math.min(100, player.breath + BREATH_RECOVER * dt);
        }
        const left = Math.ceil(HIDE_DURATION - player.hideTimer);
        document.getElementById('hide').textContent =
            (left > 0 ? 'Fique escondido por ' + left + ' s...' : 'Pode sair (E)') +
            '   ·   Fôlego ' + Math.round(player.breath) + '%' + (player.holding ? ' (preso)' : '');
    } else {
        player.holding = false;
        player.breath = Math.min(100, player.breath + BREATH_RECOVER * dt);
    }

    player.moving = moveDir !== 0;
    if (player.moving) player.dir = moveDir;

    const wantsRun  = player.moving && isDown('run');
    const isRunning = wantsRun && !player.tired && player.stamina > 0;
    player.noisy    = player.moving && (wantsRun || player.tired);

    const hurtSlow = 1 - 0.2 * Math.min(player.hits, 2);
    const speed    = (isRunning ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED) * hurtSlow;
    player.x = clamp(player.x + moveDir * speed * dt, 60, rooms[player.room].w - 60);

    if (isRunning) {
        player.stamina -= STAMINA_DRAIN_RATE * dt;
        if (player.stamina <= 0) { player.stamina = 0; player.tired = true; }
    } else {
        const rate = player.moving ? STAMINA_RECOVER_WALK : STAMINA_RECOVER_IDLE;
        player.stamina = Math.min(100, player.stamina + rate * dt);
    }
    if (player.tired && player.stamina > STAMINA_TIRED_THRESHOLD) player.tired = false;

    // Bateria da lanterna
    let lightDied = false;
    if (player.light && !player.hidden) {
        player.battery -= (100 / BATTERY_SECONDS) * diff.batteryDrain * dt;
        if (player.battery <= 0) { player.battery = 0; player.light = false; lightDied = true; }
    }

    if (player.narrativeTimer > 0) {
        player.narrativeTimer -= dt;
        if (player.narrativeTimer <= 0) player.narrativeText = null;
    }

    return { isRunning, speed, lightDied, gasp };
}

// Dica contextual de interação para o HUD.
export function getInteractionHint(player, items, killers = []) {
    const nearby = getNearbyInteractable(player, items);
    if (!nearby) return '';

    if (nearby.type === 'exitHide') {
        if (player.hideTimer < HIDE_DURATION) return '';
        return exitBlocked(player, killers) ? 'Ele ainda está perto...' : 'Pode sair (E)';
    }
    if (nearby.type === 'door') {
        const d = nearby.door;
        if (d.front) return 'Pressione E para abrir a porta da rua';
        if (d.needs === 'power' && !world.power) return 'Fechadura elétrica — sem energia';
        if (world.locked[roomOfDoor(player, d)]) return 'Trancada — E destranca';
        return 'Pressione E para abrir a porta  ·  L tranca';
    }
    const item = nearby.item;
    if (item.itemType === 'h') return 'Pressione E para se esconder';
    if (item.itemType === 'n') return 'Pressione E para examinar';
    if (item.itemType === 'p') {
        if (world.power) return '';
        return player.hasFuse ? 'Pressione E para instalar o fusível' : 'Quadro de força — falta um fusível';
    }
    if (!item.searched) return 'Pressione E para vasculhar';
    return '';
}
