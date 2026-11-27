// =============================================================================
// save.js — Save/load (localStorage), melhor tempo e finais desbloqueados
// =============================================================================
// O save guarda a SEED + dificuldade: o mundo é regenerado da seed e o estado
// (inventário, energia, portas, itens vasculhados, assassinos) é aplicado em cima.

import { storeGet as get, storeSet as set, storeRemove, storeGetJSON } from './safe.js';
const SAVE_KEY    = 'casaEscura_save';
const BEST_KEY    = 'casaEscura_best';
const ENDINGS_KEY = 'casaEscura_endings';
const VERSION     = 2;


export function writeSave(snapshot) {
    return set(SAVE_KEY, JSON.stringify({ ...snapshot, version: VERSION, timestamp: Date.now() }));
}

export function readSave() {
    const raw = get(SAVE_KEY);
    if (!raw) return null;
    try {
        const d = JSON.parse(raw);
        return d && d.version === VERSION && typeof d.seed === 'string' && d.seed ? d : null;
    } catch { return null; }
}

export const deleteSave = () => storeRemove(SAVE_KEY);
export const hasSave = () => readSave() !== null;

export function getSaveTimestamp() {
    const d = readSave();
    return d?.timestamp ? new Date(d.timestamp).toLocaleString('pt-BR') : null;
}

export function getBestTime() {
    const v = parseFloat(get(BEST_KEY));
    return Number.isFinite(v) ? v : null;
}

// Registra um tempo; retorna true se for recorde.
export function submitTime(seconds) {
    const best = getBestTime();
    if (best !== null && best <= seconds) return false;
    set(BEST_KEY, String(seconds));
    return true;
}

export function getEndings() {
    const e = storeGetJSON(ENDINGS_KEY, []);
    return Array.isArray(e) ? e : [];
}
export function unlockEnding(id) {
    const list = getEndings();
    if (!list.includes(id)) { list.push(id); set(ENDINGS_KEY, JSON.stringify(list)); }
    return list.length;
}

// ── Validação do save ─────────────────────────────────────────────────────
// Save corrompido/editado não pode derrubar o jogo (sala inexistente, NaN, ids de assassino
// que não existem...). Devolve um snapshot seguro, com tudo dentro de limites válidos.
const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const int = (v, d, lo, hi) => Math.trunc(num(v, d, lo, hi));

// ctx: { roomWidths: number[], killerIds: any[], itemCount: number, maxHits: number }
export function sanitizeSnapshot(s, ctx) {
    const src = s && typeof s === 'object' ? s : {};
    const p   = src.player && typeof src.player === 'object' ? src.player : {};
    const room = int(p.room, 1, 0, ctx.roomWidths.length - 1);
    const clampX = (x, r) => num(x, 300, 60, ctx.roomWidths[r] - 60);

    const locked = {};
    if (src.locked && typeof src.locked === 'object') {
        for (const [k, v] of Object.entries(src.locked)) {
            const r = Number(k);
            if (Number.isInteger(r) && r >= 0 && r < ctx.roomWidths.length) locked[r] = !!v;
        }
    }
    const killers = (Array.isArray(src.killers) ? src.killers : [])
        .filter(k => k && typeof k === 'object' && ctx.killerIds.includes(k.id))
        .map(k => {
            const r = int(k.room, 0, 0, ctx.roomWidths.length - 1);
            const x = clampX(k.x, r);
            return { id: k.id, room: r, x, goal: int(k.goal, r, 0, ctx.roomWidths.length - 1) };
        });
    const searched = [...new Set((Array.isArray(src.searched) ? src.searched : [])
        .map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < ctx.itemCount))];

    return {
        elapsed: num(src.elapsed, 0, 0, 1e6),
        power: !!src.power,
        locked,
        player: {
            room, x: clampX(p.x, room), dir: p.dir < 0 ? -1 : 1,
            hasKey: !!p.hasKey, hasFuse: !!p.hasFuse,
            battery: num(p.battery, 100, 0, 100), batteries: int(p.batteries, 0, 0, 99),
            bottles: int(p.bottles, 0, 0, 99),
            hits: int(p.hits, 0, 0, Math.max(0, ctx.maxHits - 1)),
            docs: (Array.isArray(p.docs) ? p.docs : []).filter(d => typeof d === 'string' || Number.isFinite(d)),
            photoSeen: !!p.photoSeen,
        },
        killers, searched,
    };
}
