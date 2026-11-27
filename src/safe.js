// =============================================================================
// safe.js — acesso tolerante a falhas
// =============================================================================
// localStorage pode estar bloqueado (modo privado, cota cheia) e nós de áudio podem já estar
// parados. Em vez de espalhar try/catch vazios, tudo passa por aqui.

export const attempt = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export const storeGet     = (key, fallback = null) => attempt(() => localStorage.getItem(key) ?? fallback, fallback);
export const storeGetJSON = (key, fallback)        => attempt(() => JSON.parse(localStorage.getItem(key)) ?? fallback, fallback);
export const storeSet     = (key, value) => attempt(() => { localStorage.setItem(key, String(value)); return true; }, false);
export const storeRemove  = key          => attempt(() => { localStorage.removeItem(key); return true; }, false);
