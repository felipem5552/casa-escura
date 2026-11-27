// =============================================================================
// render.js — Ponto de entrada da renderização (cena, tremor, zoom, menu)
// =============================================================================
// Os módulos ficam em src/render/: gfx (canvas), characters, decor, world, lighting.

import { CANVAS_W, CANVAS_H } from './config.js';
import { rooms } from './rooms.js';
import { drawDebug } from './debug.js';
import { ctx } from './render/gfx.js';
import { drawWorld } from './render/world.js';
import { drawLighting } from './render/lighting.js';

export { canvas } from './render/gfx.js';

// ── Render principal ──────────────────────────────────────────────────────

// Jogador "fantasma" usado como fonte de luz no fundo do menu.
const menuActor = { room: 0, x: 0, dir: 1, light: true, hidden: null, moving: false, ghost: true };

function renderMenuBackdrop(t) {
    const cx = 1500 + Math.sin(t * 0.12) * 650;
    menuActor.x   = cx;
    menuActor.dir = Math.cos(t * 0.12) >= 0 ? 1 : -1;
    const cam = Math.max(0, Math.min(rooms[0].w - CANVAS_W, cx - CANVAS_W / 2));
    drawWorld(menuActor, [], [], cam, t, {});
    drawLighting(menuActor, [], [], cam, t, false);
}

export function render(scene, player, killers, items, dustParticles, cameraX, gameTime, keysHeld, fx = {}) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.save();
    if (fx.zoom && fx.zoom !== 1) {
        ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
        ctx.scale(fx.zoom, fx.zoom);
        ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);
    }
    if (fx.shake > 0) {
        const m = fx.shake * 14;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    if (scene === 'menu') {
        renderMenuBackdrop(gameTime);
    } else {
        drawWorld(player, killers, items, cameraX, gameTime, keysHeld);
        drawLighting(player, killers, dustParticles, cameraX, gameTime, !!fx.reduced);
    }
    ctx.restore();
    if (fx.debug && fx.dbg && scene !== 'menu') drawDebug(ctx, { player, killers, cameraX, ...fx.dbg });
}
