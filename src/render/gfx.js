// =============================================================================
// render/gfx.js — Canvas principal, canvas da máscara de luz e contexto ativo
// =============================================================================

import { CANVAS_W, CANVAS_H } from '../config.js';

export const canvas = document.getElementById('c');
export const mainCtx = canvas.getContext('2d');
mainCtx.imageSmoothingEnabled = false;

// Contexto de desenho ativo. É trocado só durante o "bake" síncrono do fundo (render/world.js);
// os módulos importam `ctx` como binding vivo.
export let ctx = mainCtx;
export const useCtx  = c => { ctx = c; };
export const useMain = () => { ctx = mainCtx; };

export function makeCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Canvas secundário (máscara de luz)
export const maskCanvas = makeCanvas(CANVAS_W, CANVAS_H);
export const maskCtx    = maskCanvas.getContext('2d');
