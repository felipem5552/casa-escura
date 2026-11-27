// =============================================================================
// noise.js — Eventos de ruído e distância "de caminhada" entre pontos da casa
// =============================================================================
import { rooms } from './rooms.js';

const DOOR_PENALTY = 350;

const corridorDoorX = r => rooms[0].doors.find(d => d.to === r).x;
const ownDoorX      = r => rooms[r].doors[0].x;   // porta que liga a sala ao corredor

// Distância percorrida para ir de (roomA, xA) até (roomB, xB). Todas as salas
// ligam ao corredor (hub), então o caminho é sempre sala → corredor → sala.
export function pathDistance(rA, xA, rB, xB) {
    if (rA === rB) return Math.abs(xA - xB);
    if (rA === 0)  return Math.abs(xA - corridorDoorX(rB)) + DOOR_PENALTY + Math.abs(ownDoorX(rB) - xB);
    if (rB === 0)  return Math.abs(xB - corridorDoorX(rA)) + DOOR_PENALTY + Math.abs(ownDoorX(rA) - xA);
    return Math.abs(xA - ownDoorX(rA)) + DOOR_PENALTY
         + Math.abs(corridorDoorX(rA) - corridorDoorX(rB)) + DOOR_PENALTY
         + Math.abs(ownDoorX(rB) - xB);
}

export const noise = { events: [], nextId: 1 };

export function resetNoise() { noise.events.length = 0; noise.nextId = 1; }

// kind: 'step' | 'door' | 'search' | 'power' | 'distract' | 'gasp' | 'lock'
export function emitNoise(room, x, radius, kind, source = 'player') {
    noise.events.push({ id: noise.nextId++, room, x, radius, kind, source, age: 0, ttl: 0.5 });
}

export function tickNoise(dt) {
    for (const e of noise.events) e.age += dt;
    noise.events = noise.events.filter(e => e.age < e.ttl);
}

// Retorna o ruído mais "forte" que o assassino acabou de ouvir (ou null).
// Cada evento é avaliado uma única vez por assassino (lastHeardId).
export function hearNoise(killer, hearingMul) {
    let best = null, bestScore = 0, maxId = killer.lastHeardId;
    for (const e of noise.events) {
        if (e.id <= killer.lastHeardId) continue;
        if (e.id > maxId) maxId = e.id;
        if (e.source === 'killer') continue;
        const reach = e.radius * hearingMul;
        const dist  = pathDistance(e.room, e.x, killer.room, killer.x);
        if (dist < reach && reach - dist > bestScore) { best = e; bestScore = reach - dist; }
    }
    killer.lastHeardId = maxId;
    return best;
}
