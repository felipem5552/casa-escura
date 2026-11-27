// =============================================================================
// render/world.js — Cenário: fundo por sala (em cache), portas, itens e personagens
// =============================================================================

import { CANVAS_W, CANVAS_H, FLOOR_Y } from '../config.js';
import { rooms } from '../rooms.js';
import { playerSprites, killerSprites, watcherSprites } from '../sprites.js';
import { world } from '../world.js';
import { ctx, useCtx, useMain } from './gfx.js';
import { drawSprite } from './characters.js';
import { drawRoomDecoration } from './decor.js';

// ── Desenho do mundo ──────────────────────────────────────────────────────

function windowLightX(roomIndex, room) {
    if (roomIndex === 5 || roomIndex === 6) return [];   // porão e sótão não têm janela
    return roomIndex === 0 ? [1875, 3350, 4750] : [room.w * 0.55];
}

// ── Cache do fundo por sala ───────────────────────────────────────────────
// Tudo que não muda durante a partida é desenhado uma vez num canvas offscreen.
// Guardamos só as 2 últimas salas para limitar memória (corredor = 5600x540).
const bgCache = new Map();

function bakeBackground(roomIndex) {
    const room = rooms[roomIndex];
    const cv = document.createElement('canvas');
    cv.width = room.w; cv.height = CANVAS_H;
    useCtx(cv.getContext('2d'));
    try {
        // Parede com gradiente
        let grad = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
        grad.addColorStop(0, '#0c0a09');
        grad.addColorStop(1, room.c);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, room.w, FLOOR_Y);

        // Textura de parede (linhas verticais sutis)
        ctx.fillStyle = 'rgba(255,255,255,.035)';
        for (let x = 0; x < room.w; x += 90) ctx.fillRect(x, 0, 3, FLOOR_Y);

        // Rodapé
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(0, FLOOR_Y - 115, room.w, 115);
        ctx.fillStyle = 'rgba(255,255,255,.1)';
        ctx.fillRect(0, FLOOR_Y - 117, room.w, 3);

        // Painéis decorativos na parede
        ctx.strokeStyle = 'rgba(255,255,255,.07)';
        for (let x = 40; x < room.w; x += 110) ctx.strokeRect(x, FLOOR_Y - 100, 70, 80);

        // Chão com gradiente
        grad = ctx.createLinearGradient(0, FLOOR_Y, 0, CANVAS_H);
        grad.addColorStop(0, '#1d1612');
        grad.addColorStop(1, '#060403');
        ctx.fillStyle = grad;
        ctx.fillRect(0, FLOOR_Y, room.w, CANVAS_H - FLOOR_Y);

        // Tábuas do chão
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        for (let x = 0; x < room.w; x += 85) ctx.fillRect(x, FLOOR_Y, 2, CANVAS_H - FLOOR_Y);
        ctx.fillRect(0, FLOOR_Y + 34, room.w, 2);
        ctx.fillRect(0, FLOOR_Y + 72, room.w, 2);

        // Faixa de sombra no pé da parede
        ctx.fillStyle = '#120d0a';
        ctx.fillRect(0, FLOOR_Y - 10, room.w, 10);

        // Janelas (porão e sótão não têm)
        {
            windowLightX(roomIndex, room).forEach(wx => {
                grad = ctx.createLinearGradient(0, FLOOR_Y - 290, 0, FLOOR_Y - 170);
                grad.addColorStop(0, '#1c2a42');
                grad.addColorStop(1, '#3f5578');
                ctx.fillStyle = '#120d0a';
                ctx.fillRect(wx - 42, FLOOR_Y - 296, 84, 130);
                ctx.fillStyle = grad;
                ctx.fillRect(wx - 36, FLOOR_Y - 290, 72, 118);
                ctx.fillStyle = '#120d0a';
                ctx.fillRect(wx - 2,  FLOOR_Y - 290, 4, 118);
                ctx.fillRect(wx - 36, FLOOR_Y - 234, 72, 4);
            });
        }

        // Luar frio das janelas projetado no chão
        windowLightX(roomIndex, room).forEach(wx => {
            const lg = ctx.createLinearGradient(0, FLOOR_Y, 0, CANVAS_H);
            lg.addColorStop(0, 'rgba(120,150,210,.10)');
            lg.addColorStop(1, 'rgba(120,150,210,0)');
            ctx.fillStyle = lg;
            ctx.beginPath();
            ctx.moveTo(wx - 34, FLOOR_Y); ctx.lineTo(wx + 34, FLOOR_Y);
            ctx.lineTo(wx + 150, CANVAS_H); ctx.lineTo(wx + 20, CANVAS_H);
            ctx.closePath(); ctx.fill();
        });

        // Sombra de contato nos cantos (dá volume à sala)
        const cs = ctx.createLinearGradient(0, 0, 90, 0);
        cs.addColorStop(0, 'rgba(0,0,0,.45)'); cs.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = cs; ctx.fillRect(0, 0, 90, FLOOR_Y);
        const ce = ctx.createLinearGradient(room.w - 90, 0, room.w, 0);
        ce.addColorStop(0, 'rgba(0,0,0,0)'); ce.addColorStop(1, 'rgba(0,0,0,.45)');
        ctx.fillStyle = ce; ctx.fillRect(room.w - 90, 0, 90, FLOOR_Y);

        drawRoomDecoration(roomIndex);
    } finally {
        useMain();
    }
    return cv;
}

function getBackground(roomIndex) {
    let cv = bgCache.get(roomIndex);
    if (cv) { bgCache.delete(roomIndex); bgCache.set(roomIndex, cv); return cv; }   // LRU
    cv = bakeBackground(roomIndex);
    bgCache.set(roomIndex, cv);
    while (bgCache.size > 2) bgCache.delete(bgCache.keys().next().value);
    return cv;
}

export function drawWorld(player, killers, items, cameraX, gameTime, keysHeld) {
    const room = rooms[player.room];

    ctx.save();
    ctx.translate(-cameraX, 0);

    // Fundo estático (parede, chão, janelas, decoração) vem do cache da sala
    const bg = getBackground(player.room);
    const sx = Math.max(0, Math.floor(cameraX) - 24);
    const sw = Math.min(room.w, Math.floor(cameraX) + CANVAS_W + 24) - sx;
    if (sw > 0) ctx.drawImage(bg, sx, 0, sw, CANVAS_H, sx, 0, sw, CANVAS_H);


    // Portas
    room.doors.forEach(door => {
        ctx.fillStyle = '#150e0a';
        ctx.fillRect(door.x - 44, FLOOR_Y - 192, 88, 192);
        ctx.fillStyle = door.front ? '#3d2415' : '#2a1b12';
        ctx.fillRect(door.x - 36, FLOOR_Y - 184, 72, 184);
        ctx.strokeStyle = 'rgba(0,0,0,.45)';
        ctx.strokeRect(door.x - 27, FLOOR_Y - 172, 54, 70);
        ctx.strokeRect(door.x - 27, FLOOR_Y - 92,  54, 76);
        ctx.fillStyle = 'rgba(255,255,255,.07)';           // bisel de luz no topo/lado
        ctx.fillRect(door.x - 36, FLOOR_Y - 184, 72, 2);
        ctx.fillRect(door.x - 36, FLOOR_Y - 184, 2, 184);
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.fillRect(door.x - 44, FLOOR_Y, 88, 5);          // sombra no vão
        ctx.fillStyle = '#c0a868';
        ctx.fillRect(door.x + (door.x < room.w / 2 ? 20 : -28), FLOOR_Y - 95, 8, 8);
        if (door.front) {
            ctx.fillStyle = '#9a9a9a';
            ctx.fillRect(door.x - 6, FLOOR_Y - 118, 12, 16);
            ctx.fillStyle = '#222';
            ctx.fillRect(door.x - 2, FLOOR_Y - 113, 4, 6);
        }
        // Fechadura elétrica (LED) e tranca
        if (door.needs) {
            ctx.fillStyle = world.power ? '#3fbf5a' : '#b82a2a';
            ctx.fillRect(door.x + 30, FLOOR_Y - 150, 6, 6);
        }
        const doorRoom = player.room === 0 ? door.to : player.room;
        if (world.locked[doorRoom]) {
            ctx.fillStyle = '#7a1e1e';
            ctx.fillRect(door.x - 36, FLOOR_Y - 96, 72, 5);
        }
        // Porta do porão no corredor: escada indicativa
        if (door.to === 5) {
            ctx.fillStyle = '#1a1208';
            for (let s = 0; s < 5; s++) {
                ctx.fillRect(door.x - 20 + s * 4, FLOOR_Y - 10 + s * 8, 40 - s * 8, 6);
            }
        }
    });

    // Itens interagíveis
    items.forEach(item => {
        if (item.room !== player.room) return;

        // Sombra de contato no chão (móveis apoiados; quadro de força é de parede)
        if (item.itemType === 's' || item.itemType === 'h') {
            const sw = item.itemType === 'h' ? 74 : 62;
            ctx.fillStyle = 'rgba(0,0,0,.38)';
            ctx.beginPath(); ctx.ellipse(item.x, FLOOR_Y + 3, sw, 7, 0, 0, 7); ctx.fill();
        }

        if (item.itemType === 's') {
            // Cômoda / gaveta
            ctx.fillStyle = '#2a1d13'; ctx.fillRect(item.x - 50, FLOOR_Y - 128, 100, 128);
            ctx.fillStyle = '#5c4229'; ctx.fillRect(item.x - 54, FLOOR_Y - 134, 108, 9);
            for (let row = 0; row < 3; row++) {
                const gy = FLOOR_Y - 118 + row * 38;
                ctx.fillStyle = item.searched ? '#2c2016' : '#3e2c1c';
                ctx.fillRect(item.x - 43, gy, 86, 32);
                ctx.fillStyle = 'rgba(255,255,255,.08)';
                ctx.fillRect(item.x - 43, gy, 86, 2);
                ctx.fillStyle = '#b59a62';
                ctx.fillRect(item.x - 6, gy + 13, 12, 5);
            }
            ctx.fillStyle = '#1a120b';
            ctx.fillRect(item.x - 46, FLOOR_Y - 6, 8, 6);
            ctx.fillRect(item.x + 38, FLOOR_Y - 6, 8, 6);

        } else if (item.itemType === 'h') {
            // Armário (esconderijo)
            ctx.fillStyle = '#2e1f15'; ctx.fillRect(item.x - 60, FLOOR_Y - 228, 120, 228);
            ctx.fillStyle = '#432d1e'; ctx.fillRect(item.x - 66, FLOOR_Y - 238, 132, 12);
            ctx.fillStyle = '#38261a';
            ctx.fillRect(item.x - 54, FLOOR_Y - 216, 50, 196);
            ctx.fillRect(item.x + 4,  FLOOR_Y - 216, 50, 196);
            ctx.strokeStyle = 'rgba(0,0,0,.5)';
            ctx.strokeRect(item.x - 46, FLOOR_Y - 206, 34, 80);
            ctx.strokeRect(item.x + 12, FLOOR_Y - 206, 34, 80);
            ctx.strokeRect(item.x - 46, FLOOR_Y - 116, 34, 80);
            ctx.strokeRect(item.x + 12, FLOOR_Y - 116, 34, 80);
            ctx.fillStyle = '#b59a62';
            ctx.fillRect(item.x - 12, FLOOR_Y - 120, 5, 14);
            ctx.fillRect(item.x + 7,  FLOOR_Y - 120, 5, 14);
            ctx.fillStyle = '#1a120b';
            ctx.fillRect(item.x - 58, FLOOR_Y - 8, 12, 8);
            ctx.fillRect(item.x + 46, FLOOR_Y - 8, 12, 8);

        } else if (item.itemType === 'p') {
            // Quadro de força
            ctx.fillStyle = '#2b3036'; ctx.fillRect(item.x - 42, FLOOR_Y - 190, 84, 110);
            ctx.fillStyle = '#3d444c'; ctx.fillRect(item.x - 36, FLOOR_Y - 184, 72, 98);
            ctx.fillStyle = world.power ? '#3fbf5a' : '#b82a2a';
            ctx.fillRect(item.x - 26, FLOOR_Y - 172, 8, 8);
            ctx.fillStyle = '#8a9099'; ctx.fillRect(item.x - 4, FLOOR_Y - 150, 8, 40);
            ctx.fillStyle = '#c0a868'; ctx.fillRect(item.x - 10, world.power ? FLOOR_Y - 154 : FLOOR_Y - 118, 20, 8);

        } else if (item.itemType === 'n') {
            // Objeto narrativo — ícone sutil de ponto de interesse
            ctx.fillStyle = 'rgba(180,160,120,0.15)';
            ctx.fillRect(item.x - 16, FLOOR_Y - 48, 32, 48);
            ctx.fillStyle = 'rgba(180,160,120,0.5)';
            ctx.fillRect(item.x - 1, FLOOR_Y - 52, 2, 8);  // ponto de exclamação
            ctx.fillRect(item.x - 1, FLOOR_Y - 40, 2, 2);
        }
    });

    // Assassinos na mesma sala
    killers.forEach(k => {
        if (k.room !== player.room) return;
        const killerIsMoving = Math.abs(k.x - (k.px ?? k.x)) > 0.01;
        drawSprite(
            k.roleKey === 'watcher' ? watcherSprites : killerSprites,
            k.x, k.dir, killerIsMoving, k.state === 'chase', true, false, gameTime
        );
        k.px = k.x;
    });

    // Jogador
    if (!player.hidden && !player.ghost) {
        const playerIsRunning = !!(keysHeld && (keysHeld.ShiftLeft || keysHeld.ShiftRight));
        drawSprite(
            playerSprites,
            player.x, player.dir, player.moving, playerIsRunning, false, player.light, gameTime
        );
    }

    ctx.restore();
}
