// =============================================================================
// director.js — "Diretor de tensão": controla o ritmo do susto
// =============================================================================
//  - calm: segundos desde o último susto. Passou de ~55s → empurra um assassino
//    para a sala do jogador (push).
//  - relax: janela de respiro após uma perseguição (assassinos evitam o jogador).
//  - intensity: 0..1, usada para a música e para pesar a patrulha.
//  - Eventos aleatórios: queda de energia (se a luz estiver ligada) e sons falsos.
import { rnd, rndRange } from './rng.js';

export function createDirector() {
    return { calm: 0, relax: 0, intensity: 0, pressure: 0, push: false,
             sawChase: false, eventTimer: rndRange(70, 110) };
}

export function updateDirector(d, { killers, world, hooks }, dt) {
    const chasing = killers.some(k => k.state === 'chase');

    if (chasing) {
        d.calm = 0; d.relax = 0; d.sawChase = true;
    } else {
        if (d.sawChase) { d.sawChase = false; d.relax = 16; }
        d.calm += dt;
        d.relax = Math.max(0, d.relax - dt);
    }

    const target = chasing ? 1 : (d.relax > 0 ? 0.1 : Math.min(0.9, d.calm / 60));
    d.intensity += (target - d.intensity) * Math.min(1, dt * 1.5);
    d.pressure   = d.relax > 0 ? 0 : d.intensity;

    if (d.calm > 55 && d.relax <= 0 && !d.push && !chasing) { d.push = true; d.calm = 25; }

    d.eventTimer -= dt;
    if (d.eventTimer <= 0 && !chasing && d.relax <= 0) {
        d.eventTimer = rndRange(60, 120);
        if (world.power && world.blackout <= 0 && rnd() < 0.4) {
            world.blackout = rndRange(8, 14);
            hooks.onBlackout?.();
        } else {
            hooks.onFakeSound?.();
        }
    }
    if (world.blackout > 0) world.blackout -= dt;
}
