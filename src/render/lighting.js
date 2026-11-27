// =============================================================================
// render/lighting.js — Escuridão, lanterna, olhos do assassino, poeira e vinheta
// =============================================================================

import { lightAngle } from '../aim.js';
import { CANVAS_W, CANVAS_H, FLOOR_Y, ROOM_AMBIENT_RADIUS, ROOM_DARKNESS } from '../config.js';
import { anyKillerChasingInRoom } from '../killer.js';
import { world } from '../world.js';
import { ctx, maskCanvas, maskCtx, makeCanvas } from './gfx.js';

// ── Iluminação ────────────────────────────────────────────────────────────

// Sprites de luz pré-renderizados (criados uma vez; antes eram gradientes novos a cada frame).
const CONE_LEN  = 720;
const CONE_HALF = 0.34;
const CONE_PAD  = 24;

// Círculo de visão ambiente (alpha preto; usado com destination-out). Raio base 256.
const ambientSprite = (() => {
    const R = 256, c = makeCanvas(R * 2, R * 2), g = c.getContext('2d');
    const gr = g.createRadialGradient(R, R, 10, R, R, R);
    gr.addColorStop(0,    'rgba(0,0,0,1)');
    gr.addColorStop(0.45, 'rgba(0,0,0,.85)');
    gr.addColorStop(1,    'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(R, R, R, 0, 7); g.fill();
    return c;
})();

// Cone da lanterna apontando para +x, origem em (0, h/2). Borda suavizada quando o browser suporta ctx.filter.
function bakeCone(rgb, a0, a1, a2) {
    const h = Math.ceil(2 * CONE_LEN * Math.sin(CONE_HALF)) + CONE_PAD * 2;
    const c = makeCanvas(CONE_LEN + CONE_PAD, h), g = c.getContext('2d');
    if ('filter' in g) g.filter = 'blur(5px)';
    const oy = h / 2;
    const gr = g.createRadialGradient(0, oy, 10, 0, oy, CONE_LEN);
    gr.addColorStop(0,   `rgba(${rgb},${a0})`);
    gr.addColorStop(0.6, `rgba(${rgb},${a1})`);
    gr.addColorStop(1,   `rgba(${rgb},${a2})`);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, oy); g.arc(0, oy, CONE_LEN, -CONE_HALF, CONE_HALF); g.closePath(); g.fill();
    return c;
}
const coneMask = bakeCone('0,0,0', 1, 0.7, 0);              // recorta a escuridão
const coneTint = bakeCone('255,228,170', 1, 0.55, 0);       // tinge de quente o feixe

// Vinheta vermelha da perseguição (alpha 1 na borda; intensidade vai em globalAlpha)
const chaseVignette = (() => {
    const c = makeCanvas(CANVAS_W, CANVAS_H), g = c.getContext('2d');
    const gr = g.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.3, CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.9);
    gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, 'rgba(120,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    return c;
})();

// Brilho dos olhos (36x36), um por cor
function bakeEye(rgb) {
    const c = makeCanvas(36, 36), g = c.getContext('2d');
    const gr = g.createRadialGradient(18, 18, 0, 18, 18, 18);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 36, 36);
    return c;
}
const eyeGlow = { watcher: bakeEye('255,180,30'), killer: bakeEye('255,40,20') };

// Desenha um sprite de cone com origem (ox, oy), ângulo e comprimento.
function drawCone(target, sprite, ox, oy, angle, len) {
    target.save();
    target.translate(ox, oy);
    target.rotate(angle);
    const k = len / CONE_LEN;
    target.scale(k, k);
    target.drawImage(sprite, 0, -sprite.height / 2);
    target.restore();
}

export function drawLighting(player, killers, dustParticles, cameraX, gameTime, reduced = false) {
    const screenX    = player.x - cameraX;
    const sourceY    = FLOOR_Y - 80;
    const roomIndex  = player.room;
    const blackout   = world.blackout > 0;
    const ambRadius  = (ROOM_AMBIENT_RADIUS[roomIndex] ?? 185) * (blackout ? 0.6 : world.power ? 1.12 : 1);
    const darkness   = blackout ? 0.995 : (ROOM_DARKNESS[roomIndex] ?? 0.975) - (world.power ? 0.035 : 0);
    // Bateria fraca: cone menor e piscando; apagão também faz a lanterna falhar.
    // Com movimento reduzido o pisca vira uma redução fixa (o sinal continua legível).
    const bat        = player.battery ?? 100;
    let   lightMul   = bat < 30 ? 0.55 + 0.45 * (bat / 30) : 1;
    if (reduced) {
        if (bat < 20)  lightMul *= 0.7;
        if (blackout)  lightMul *= 0.5;
    } else {
        if (bat < 20 && Math.sin(gameTime * 40) * Math.sin(gameTime * 13) > 0.6) lightMul *= 0.35;
        if (blackout && Math.sin(gameTime * 31) * Math.sin(gameTime * 9) > 0.3)  lightMul *= 0.3;
    }

    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    maskCtx.fillStyle = `rgba(0,0,0,${darkness})`;
    maskCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    maskCtx.globalCompositeOperation = 'destination-out';

    let beam = null;   // { angle, len } para o tom quente do feixe
    if (player.hidden) {
        // Dentro do armário: apenas frestas de luz
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.fillStyle = '#000';
        maskCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        maskCtx.globalCompositeOperation = 'destination-out';
        maskCtx.fillStyle = '#000';
        for (let k = -1; k <= 1; k++) {
            maskCtx.fillRect(screenX + k * 46 - 3, FLOOR_Y - 200, 6, 170);
        }
    } else {
        // Círculo de visão ambiente (raio varia por sala)
        maskCtx.drawImage(ambientSprite, screenX - ambRadius, sourceY - ambRadius, ambRadius * 2, ambRadius * 2);

        // Cone da lanterna
        if (player.light) {
            const angle   = lightAngle(player.dir, player.aim);
            const dip     = reduced ? 0 : Math.max(0, Math.sin(gameTime * 9) * Math.sin(gameTime * 23) - 0.88) * 5;
            const coneLen = CONE_LEN * (1 - dip * 0.5) * lightMul;
            drawCone(maskCtx, coneMask, screenX, sourceY, angle, coneLen);
            beam = { angle, len: coneLen };
        }
    }

    ctx.drawImage(maskCanvas, 0, 0);

    // Tom quente dentro do feixe (aditivo, bem sutil)
    if (beam) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.10 * Math.min(1, beam.len / CONE_LEN);
        drawCone(ctx, coneTint, screenX, sourceY, beam.angle, beam.len);
        ctx.restore();
    }

    // Olhos do assassino brilhando no escuro quando está perto
    if (!player.hidden) {
        killers.forEach(k => {
            if (k.room !== player.room) return;
            const d = Math.abs(k.x - player.x);
            if (d > 520) return;
            const a  = Math.min(0.9, (1 - d / 520) * 1.1);
            const ex = k.x - cameraX + k.dir * 10, ey = FLOOR_Y - 98;
            ctx.globalAlpha = a;
            ctx.drawImage(k.roleKey === 'watcher' ? eyeGlow.watcher : eyeGlow.killer, ex - 18, ey - 18);
            ctx.globalAlpha = 1;
            ctx.fillStyle = `rgba(255,110,80,${a})`;
            ctx.fillRect(ex - 2, ey - 2, 4, 4);
        });
    }

    // Partículas de poeira na lanterna
    if (!player.hidden && player.light) {
        const angle = lightAngle(player.dir, player.aim);
        dustParticles.forEach(p => {
            const px    = screenX + Math.cos(angle + p.angle) * p.distance;
            const py    = sourceY  + Math.sin(angle + p.angle) * p.distance * 0.5 + p.offsetY;
            const alpha = 0.5 * Math.sin(Math.PI * p.age / p.lifetime);
            const size  = p.lifetime > 2.2 ? 3 : 2;        // grãos de dois tamanhos
            ctx.fillStyle = `rgba(235,226,196,${alpha})`;
            ctx.fillRect(px, py, size, size);
        });
    }

    // Vinheta vermelha pulsante na perseguição (fixa com movimento reduzido)
    if (anyKillerChasingInRoom(killers, player)) {
        ctx.globalAlpha = reduced ? 0.3 : 0.25 + 0.1 * Math.sin(gameTime * 12);
        ctx.drawImage(chaseVignette, 0, 0);
        ctx.globalAlpha = 1;
    }
}
