// =============================================================================
// items.js — Monta a lista de itens das salas e distribui os conteúdos (chave,
// fusível, pilhas, garrafas, kit). Módulo puro (usa rng.js) para poder ser
// testado/simulado fora do navegador.
// =============================================================================
import { rooms } from './rooms.js';
import { pick }  from './rng.js';

export function buildItems(diff) {
    const list = [];
    rooms.forEach((room, roomIndex) => {
        (room.it || []).forEach(d => list.push({
            room: roomIndex, x: d[0], itemType: d[1], name: d[2],
            loreText: d[3] || null, special: d[4] || null, searched: false, content: null,
        }));
    });
    const free = f => list.filter(i => i.itemType === 's' && !i.content && f(i));
    const put  = (content, f) => { const c = free(f); if (c.length) pick(c).content = content; };

    put('key',    i => i.room === 7);                           // sempre no escritório
    put('fuse',   i => [1, 2, 3, 4, 6].includes(i.room));
    put('medkit', i => i.room === 3 || i.room === 4);
    for (let n = 0; n < diff.batteries; n++) put('battery', n < 2 ? (i => [5, 6, 2].includes(i.room)) : (() => true));
    for (let n = 0; n < diff.bottles;   n++) put('bottle',  () => true);
    return list;
}
