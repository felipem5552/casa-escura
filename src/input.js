// =============================================================================
// input.js — Teclado (com teclas remapeáveis) e controles de toque
// =============================================================================

import { storeGetJSON, storeSet } from './safe.js';

export const keysHeld = {};

const DEFAULT_KEYS = {
    left:     ['ArrowLeft', 'KeyA'],
    right:    ['ArrowRight', 'KeyD'],
    run:      ['ShiftLeft', 'ShiftRight'],
    interact: ['KeyE'],
    light:    ['KeyF'],
    throw:    ['KeyG'],
    battery:  ['KeyR'],
    lock:     ['KeyL'],
    breath:   ['Space'],
};
const FIXED_KEYS = { pause: ['Escape', 'KeyP'], mute: ['KeyM'], debug: ['F3'], continue: ['KeyC'], quit: ['KeyQ'] };
export const REMAPPABLE = Object.keys(DEFAULT_KEYS);

const STORE = 'casaEscura_keys';
function load() {
    const b = JSON.parse(JSON.stringify(DEFAULT_KEYS));
    const saved = storeGetJSON(STORE, {});
    for (const a of REMAPPABLE) if (Array.isArray(saved?.[a]) && saved[a].length) b[a] = saved[a];
    return Object.assign(b, JSON.parse(JSON.stringify(FIXED_KEYS)));
}
export const bindings = load();

function persist() {
    const out = {};
    for (const a of REMAPPABLE) out[a] = bindings[a];
    storeSet(STORE, JSON.stringify(out));
}
export function setBinding(action, code) { bindings[action] = [code]; persist(); }
export function resetBindings() { Object.assign(bindings, JSON.parse(JSON.stringify(DEFAULT_KEYS))); persist(); }

// Ação pressionada agora (teclado ou toque)?
export const isDown = action => bindings[action].some(c => keysHeld[c]) || !!keysHeld['touch:' + action];

const actionOf = code => Object.keys(bindings).find(a => bindings[a].includes(code));

export function keyLabel(code) {
    return ({ Space: 'Espaço', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
              ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', Escape: 'Esc' })[code]
        || code.replace(/^Key/, '').replace(/^Digit/, '');
}

let cb = {};
let capture = null;
export function registerCallbacks(callbacks) { cb = callbacks; }
export function captureNextKey(fn) { capture = fn; }

export function initInput() {
    addEventListener('keydown', handleKeyDown);
    addEventListener('keyup',   e => { keysHeld[e.code] = false; });
    addEventListener('blur',    () => { for (const k in keysHeld) keysHeld[k] = false; });
}

function handleKeyDown(e) {
    if (capture) { e.preventDefault(); const fn = capture; capture = null; fn(e.code); return; }

    // Campos de texto/slider: só Enter passa (iniciar jogo)
    if (e.target && e.target.tagName === 'INPUT') {
        if (e.code === 'Enter') cb.onEnter?.();
        return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'F3'].includes(e.code)) e.preventDefault();

    keysHeld[e.code] = true;
    if (e.repeat) return;

    const scene  = cb.getScene ? cb.getScene() : 'play';
    const action = actionOf(e.code);

    if (action === 'mute')  { cb.onMute?.(); return; }
    if (action === 'debug') { cb.onDebug?.(); return; }

    if (e.code === 'KeyS' && e.ctrlKey) {
        e.preventDefault();
        if (scene === 'play' || scene === 'paused') cb.onSave?.();
        return;
    }

    if (e.code === 'Enter')     { cb.onEnter?.();    return; }
    if (action === 'pause')     { cb.onPause?.();    return; }
    if (action === 'continue')  { cb.onContinue?.(); return; }
    if (action === 'quit')      { cb.onQuit?.();     return; }

    if (scene !== 'play') return;
    if (action === 'light')    cb.onFlashlight?.();
    if (action === 'interact') cb.onInteract?.();
    if (action === 'throw')    cb.onThrow?.();
    if (action === 'battery')  cb.onBattery?.();
    if (action === 'lock')     cb.onLock?.();
}

// Toque: [data-hold="ação"] mantém a ação; [data-tap="ação"] dispara uma vez.
export function initTouch() {
    document.querySelectorAll('[data-hold]').forEach(btn => {
        const key = 'touch:' + btn.dataset.hold;
        const on  = e => { e.preventDefault(); keysHeld[key] = true;  btn.classList.add('down'); };
        const off = e => { e.preventDefault(); keysHeld[key] = false; btn.classList.remove('down'); };
        btn.addEventListener('pointerdown', on);
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, off));
    });
    const actions = {
        interact: () => cb.onInteract?.(),   flashlight: () => cb.onFlashlight?.(),
        pause:    () => cb.onPause?.(),      throw:      () => cb.onThrow?.(),
        battery:  () => cb.onBattery?.(),    lock:       () => cb.onLock?.(),
    };
    document.querySelectorAll('[data-tap]').forEach(btn => {
        btn.addEventListener('pointerdown', e => {
            e.preventDefault();
            if (cb.getScene?.() === 'play' || btn.dataset.tap === 'pause') actions[btn.dataset.tap]?.();
        });
    });
}

// ── Mira da lanterna ──────────────────────────────────────────────────────
// mouse: posição em coordenadas do canvas (960×540); touch: arrasto relativo na metade direita da tela.
export const aimInput = { mouse: null, mouseAt: 0, touch: null };

export function initAim(canvas, W = 960, H = 540) {
    canvas.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const r = canvas.getBoundingClientRect();
        aimInput.mouse   = { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
        aimInput.mouseAt = performance.now();
    });
    const root = document.getElementById('g') || document.body;
    let drag = null;
    const release = () => { drag = null; aimInput.touch = null; };
    addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    root.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' || drag) return;
        if (e.target.closest('button, [data-hold], [data-tap], #ov')) return;
        if (e.clientX < innerWidth * 0.45) return;               // metade esquerda fica livre
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        aimInput.touch = { dx: 0, dy: 0 };
    });
    root.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        aimInput.touch = { dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 };
    });
    const end = e => { if (drag && e.pointerId === drag.id) { drag = null; aimInput.touch = null; } };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
}
