// =============================================================================
// render/decor.js — Móveis e objetos de cenário fixos de cada sala
// =============================================================================

import { FLOOR_Y } from '../config.js';
import { rooms } from '../rooms.js';
import { ctx } from './gfx.js';

// ── Decoração das salas ───────────────────────────────────────────────────

// Desenha móveis e objetos de cenário fixos de cada sala.
// Para adicionar uma nova sala: inclua um bloco else if (roomIndex === N) aqui.
// Larguras originais das salas: o cenário foi desenhado para elas. Cada grupo de
// móveis é deslocado para a mesma posição relativa na sala atual (mais larga).
const DECOR_BASE_W = { 1: 1500, 2: 1400, 3: 1400, 4: 1200, 5: 1600, 6: 1500, 7: 1300 };
function group(roomIndex, anchorX, draw) {
    const k = rooms[roomIndex].w / DECOR_BASE_W[roomIndex];
    ctx.save(); ctx.translate(Math.round(anchorX * (k - 1)), 0); draw(); ctx.restore();
}

export function drawRoomDecoration(roomIndex) {
    const W = rooms[roomIndex].w;
    if (roomIndex === 1) {
        // Sala — estante + vaso
        group(1, 460, () => {
            ctx.fillStyle = '#34252f'; ctx.fillRect(460, FLOOR_Y - 115, 200, 65);
            ctx.fillRect(445, FLOOR_Y - 85, 26, 85); ctx.fillRect(649, FLOOR_Y - 85, 26, 85);
            ctx.fillStyle = '#43303c'; ctx.fillRect(470, FLOOR_Y - 62, 180, 42);
            ctx.fillStyle = '#2a1d25'; ctx.fillRect(558, FLOOR_Y - 62, 3, 42);
            ctx.fillRect(460, FLOOR_Y - 20, 200, 10);
        });
        group(1, 810, () => {
            ctx.fillStyle = '#33291f'; ctx.fillRect(810, FLOOR_Y - 72, 80, 72);
            ctx.fillStyle = '#5a4a2c'; ctx.fillRect(846, FLOOR_Y - 120, 8, 50);
            ctx.fillStyle = '#d8c88a'; ctx.fillRect(832, FLOOR_Y - 146, 44, 28);
        });

    } else if (roomIndex === 2) {
        // Quarto — cama
        group(2, 560, () => {
            ctx.fillStyle = '#2a1d15'; ctx.fillRect(560, FLOOR_Y - 135, 16, 135);
            ctx.fillRect(560, FLOOR_Y - 45, 290, 28); ctx.fillRect(838, FLOOR_Y - 70, 12, 70);
            ctx.fillStyle = '#3b3a52'; ctx.fillRect(576, FLOOR_Y - 72, 262, 30);
            ctx.fillStyle = '#7a7a8c'; ctx.fillRect(582, FLOOR_Y - 90, 56, 20);
            ctx.fillStyle = '#5a2a2e'; ctx.fillRect(652, FLOOR_Y - 76, 186, 36);
            ctx.fillStyle = '#46222a'; ctx.fillRect(652, FLOOR_Y - 76, 186, 6);
        });

    } else if (roomIndex === 3) {
        // Cozinha — balcão + cadeiras
        group(3, 490, () => {
            ctx.fillStyle = '#4a3b28'; ctx.fillRect(540, FLOOR_Y - 84, 220, 12);
            ctx.fillStyle = '#2e2418'; ctx.fillRect(552, FLOOR_Y - 72, 10, 72);
            ctx.fillRect(738, FLOOR_Y - 72, 10, 72);
            ctx.fillStyle = '#3a2c1c';
            [[490, 1], [780, 1]].forEach(a => {
                ctx.fillRect(a[0], FLOOR_Y - 48, 44, 8);
                ctx.fillRect(a[0] + (a[0] < 600 ? 0 : 38), FLOOR_Y - 104, 6, 64);
                ctx.fillRect(a[0] + 4,  FLOOR_Y - 40, 5, 40);
                ctx.fillRect(a[0] + 34, FLOOR_Y - 40, 5, 40);
            });
            ctx.fillStyle = '#8a2a2a'; ctx.fillRect(630, FLOOR_Y - 96, 22, 12);
        });

    } else if (roomIndex === 4) {
        // Banheiro — pia
        group(4, 540, () => {
            ctx.fillStyle = '#9aa8aa'; ctx.fillRect(540, FLOOR_Y - 76, 230, 76);
            ctx.fillStyle = '#4a5a5e'; ctx.fillRect(552, FLOOR_Y - 64, 206, 52);
            ctx.fillStyle = '#c4d0d2'; ctx.fillRect(536, FLOOR_Y - 82, 238, 10);
            ctx.fillStyle = '#777';    ctx.fillRect(552, FLOOR_Y - 112, 8, 32);
            ctx.fillRect(552, FLOOR_Y - 112, 26, 6);
        });

    } else if (roomIndex === 5) {
        // Porão — colunas de concreto + tubulação + caixas
        ctx.fillStyle = '#2a2520';
        [400, 900, 1300].forEach(x => group(5, x, () => ctx.fillRect(x, FLOOR_Y - 300, 30, 300)));
        // Vigas horizontais e tubulação (largura total da sala)
        ctx.fillStyle = '#1e1a16';
        ctx.fillRect(0, FLOOR_Y - 300, W, 20);
        ctx.fillRect(0, FLOOR_Y - 160, W, 12);
        ctx.fillStyle = '#3a3028';
        ctx.fillRect(50, FLOOR_Y - 290, W - 100, 8);
        ctx.fillStyle = '#2e2820';
        [[200, 130], [700, 90], [1100, 110]].forEach(([x, h]) =>
            group(5, x, () => ctx.fillRect(x, FLOOR_Y - 282, 8, h)));
        // Caixas empilhadas
        group(5, 540, () => {
            ctx.fillStyle = '#3c2e1e';
            ctx.fillRect(540, FLOOR_Y - 60, 55, 60);
            ctx.fillRect(595, FLOOR_Y - 60, 55, 60);
            ctx.fillRect(555, FLOOR_Y - 115, 50, 55);
            ctx.fillStyle = '#4a3a26';
            ctx.fillRect(542, FLOOR_Y - 62, 53, 2);
            ctx.fillRect(597, FLOOR_Y - 62, 53, 2);
            ctx.fillRect(557, FLOOR_Y - 117, 48, 2);
        });
        // Manchas de umidade na parede
        ctx.fillStyle = 'rgba(0,30,20,0.35)';
        [[100, 200, 80, 120], [800, 180, 60, 100], [1200, 220, 90, 140]].forEach(([x, y, w, h]) =>
            group(5, x, () => ctx.fillRect(x, FLOOR_Y - y, w, h)));

    } else if (roomIndex === 6) {
        // Sótão — vigas, baús e manequim coberto
        ctx.fillStyle = '#17131a';
        for (let x = 0; x < W; x += 300) ctx.fillRect(x, FLOOR_Y - 330, 14, 330);
        ctx.fillRect(0, FLOOR_Y - 330, W, 16);
        group(6, 250, () => {
            ctx.fillStyle = '#2a2230'; ctx.fillRect(250, FLOOR_Y - 70, 90, 70);
            ctx.fillStyle = '#3a3040'; ctx.fillRect(250, FLOOR_Y - 74, 90, 6);
        });
        group(6, 1180, () => { ctx.fillStyle = '#2a2230'; ctx.fillRect(1180, FLOOR_Y - 60, 100, 60); });
        group(6, 760, () => {
            ctx.fillStyle = '#6c6572'; ctx.fillRect(760, FLOOR_Y - 150, 40, 150);
            ctx.fillStyle = '#80798a'; ctx.fillRect(768, FLOOR_Y - 180, 24, 30);
        });
        group(6, 500, () => {
            ctx.fillStyle = 'rgba(200,200,220,.05)'; ctx.fillRect(500, FLOOR_Y - 330, 40, 330);
        });

    } else if (roomIndex === 7) {
        // Escritório — escrivaninha, estante de arquivos, luminária
        group(7, 200, () => {
            ctx.fillStyle = '#3a2c1e'; ctx.fillRect(200, FLOOR_Y - 90, 260, 14);
            ctx.fillRect(210, FLOOR_Y - 76, 12, 76); ctx.fillRect(440, FLOOR_Y - 76, 12, 76);
            ctx.fillStyle = '#4f6a3c'; ctx.fillRect(250, FLOOR_Y - 116, 30, 26);
            ctx.fillStyle = '#c9b074'; ctx.fillRect(330, FLOOR_Y - 130, 6, 40); ctx.fillRect(322, FLOOR_Y - 140, 22, 12);
        });
        group(7, 700, () => {
            ctx.fillStyle = '#2d3238'; ctx.fillRect(700, FLOOR_Y - 220, 120, 220);
            ctx.fillStyle = '#3d444c';
            for (let i = 0; i < 4; i++) ctx.fillRect(708, FLOOR_Y - 212 + i * 54, 104, 46);
            ctx.fillStyle = '#7a828c';
            for (let i = 0; i < 4; i++) ctx.fillRect(754, FLOOR_Y - 192 + i * 54, 12, 5);
        });
    }
}
