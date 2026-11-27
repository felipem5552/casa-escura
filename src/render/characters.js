// =============================================================================
// render/characters.js — Desenho de jogador e assassinos
// =============================================================================

import { FLOOR_Y } from '../config.js';
import { WALK_FRAME_SEQUENCE } from '../sprites.js';
import { ctx } from './gfx.js';

// ── Personagens ───────────────────────────────────────────────────────────

// Desenha um personagem (jogador ou assassino) com a pixel-art gerada em sprites.js.
//
// spriteSet — array de canvas gerados (frames de caminhada)
// x         — posição X no mundo (antes do offset de câmera)
// dir       — 1=direita, -1=esquerda
// isMoving  — bool para selecionar frame animado
// isFast    — bool para velocidade de animação (corrida)
// isKiller  — bool para desenhar acessórios do assassino
// hasLight  — bool para estado da lanterna do jogador
// gameTime  — tempo acumulado do jogo (para animação)
export function drawSprite(spriteSet, x, dir, isMoving, isFast, isKiller, hasLight, gameTime) {
    const frameIndex = isMoving
        ? WALK_FRAME_SEQUENCE[Math.floor(gameTime * (isFast ? 12 : 8)) % 4]
        : 0;

    const scale      = 5;
    const spriteData = spriteSet[frameIndex];
    const drawW      = spriteData.width  * scale;
    const drawH      = spriteData.height * scale;

    // Sombra no chão
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(x, FLOOR_Y + 4, drawW * 0.5, 6, 0, 0, 7);
    ctx.fill();

    ctx.save();
    ctx.translate(x, FLOOR_Y);
    ctx.scale(dir < 0 ? -1 : 1, 1);
    ctx.drawImage(spriteData, -drawW / 2, -drawH, drawW, drawH);

    // Acessório na mão
    const handY = -drawH + 8 * scale + scale / 2;
    if (isKiller) {
        ctx.fillStyle = '#c9c9d0';
        ctx.fillRect(drawW / 2 - 4, handY + 1, 26, 4);
        ctx.fillStyle = '#4a2a1a';
        ctx.fillRect(drawW / 2 - 8, handY - 1, 8, 8);
    } else {
        ctx.fillStyle = '#555';
        ctx.fillRect(drawW / 2 - 6, handY - 1, 16, 8);
        ctx.fillStyle = hasLight ? '#fff6c0' : '#222';
        ctx.fillRect(drawW / 2 + 8, handY - 2, 5, 10);
    }
    ctx.restore();
}
