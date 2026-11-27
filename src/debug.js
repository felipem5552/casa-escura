// =============================================================================
// debug.js — Overlay de depuração (F3): estados da IA, ruídos, diretor, calor
// =============================================================================
import { FLOOR_Y } from './config.js';
import { noise }   from './noise.js';
import { rooms }   from './rooms.js';
import { world }   from './world.js';
import { pathDistance } from './noise.js';

export function drawDebug(ctx, { player, killers, cameraX, director, diff, seed, fps }) {
    ctx.save();
    ctx.translate(-cameraX, 0);
    ctx.lineWidth = 1;
    ctx.font = '12px monospace';

    // Ruídos na sala do jogador
    for (const e of noise.events) {
        if (e.room !== player.room) continue;
        ctx.strokeStyle = e.source === 'killer' ? 'rgba(255,80,80,.6)' : 'rgba(80,200,255,.7)';
        ctx.beginPath(); ctx.ellipse(e.x, FLOOR_Y, e.radius, e.radius * 0.18, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = '#7fd'; ctx.fillText(e.kind, e.x - 12, FLOOR_Y - 8);
    }

    // Assassinos na sala
    for (const k of killers) {
        if (k.room !== player.room) continue;
        ctx.strokeStyle = '#f55'; ctx.strokeRect(k.x - 20, FLOOR_Y - 115, 40, 115);
        const tx = k.state === 'investigate' && k.target ? k.target.x : (k.targetX ?? null);
        if (tx !== null) {
            ctx.strokeStyle = '#fc4'; ctx.beginPath();
            ctx.moveTo(k.x, FLOOR_Y - 60); ctx.lineTo(tx, FLOOR_Y - 60); ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.fillText(`${k.role.name} · ${k.state}${k.stun > 0 ? ' (atordoado)' : ''}`, k.x - 40, FLOOR_Y - 124);
    }
    ctx.restore();

    // Painel de texto
    const lines = [
        `FPS ${fps}  ·  seed ${seed}  ·  ${diff.label}`,
        `diretor: calma ${director.calm.toFixed(0)}s  respiro ${director.relax.toFixed(0)}s  tensão ${director.intensity.toFixed(2)}${director.push ? '  PUSH' : ''}`,
        `energia ${world.power ? 'ON' : 'off'}  ·  apagão ${Math.max(0, world.blackout).toFixed(0)}s  ·  trancadas [${Object.keys(world.locked).filter(r => world.locked[r]).join(',')}]`,
        `jogador: sala ${rooms[player.room].n}  x${player.x | 0}  bat ${player.battery | 0}%  fôlego ${player.breath | 0}  golpes ${player.hits}`,
        ...killers.map(k => `${k.id} ${k.role.name}: ${k.state}  sala ${rooms[k.room].n}  x${k.x | 0}  dist ${pathDistance(k.room, k.x, player.room, player.x) | 0}  carência ${Math.max(0, k.grace || 0).toFixed(0)}s  meta ${rooms[k.goal].n}  esconderijo lembrado: ${k.memory.hideRoom === null ? '-' : rooms[k.memory.hideRoom].n}`),
        `calor: ${world.heat.map((h, i) => rooms[i].n.slice(0, 3) + ' ' + h.toFixed(0)).join('  ')}`,
    ];
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(8, 8, 820, lines.length * 15 + 8);
    ctx.fillStyle = '#9f9';
    ctx.font = '12px monospace';
    lines.forEach((t, i) => ctx.fillText(t, 14, 24 + i * 15));
}
