// =============================================================================
// world.js — Estado compartilhado do mundo (energia, portas trancadas, calor)
// =============================================================================
import { rooms } from './rooms.js';

export const world = {
    power:    false,   // quadro de força ligado?
    locked:   {},      // locked[roomIndex] = true → porta dessa sala trancada
    heat:     [],      // "calor" por sala: onde o jogador passa mais tempo
    blackout: 0,       // segundos restantes de queda de energia
    diff:     null,
};

export function resetWorld(diff) {
    world.power    = false;
    world.locked   = {};
    world.heat     = rooms.map(() => 0);
    world.blackout = 0;
    world.diff     = diff;
}
