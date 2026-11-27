// =============================================================================
// rng.js — Gerador pseudoaleatório com seed (mulberry32) para IA e geração
// =============================================================================
let state = 1;

export function seedRng(str) {
    let h = 1779033703 ^ String(str).length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    state = (h >>> 0) || 1;
}

export function rnd() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rndRange = (a, b) => a + rnd() * (b - a);
export const pick     = arr => arr[Math.floor(rnd() * arr.length)];

export function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export const dailySeed  = () => 'DIA-' + new Date().toISOString().slice(0, 10);
export const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();
