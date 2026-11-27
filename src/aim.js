// aim.js — mira da lanterna (só visual: a detecção pela luz continua igual).
// aim = desvio do cone em radianos em relação à horizontal do lado para onde o jogador olha
// (positivo = para baixo). lightAngle() converte para o ângulo absoluto no canvas.
export const AIM_MAX = 0.87;   // ~50°
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const lightAngle = (dir, aim = 0) => dir > 0 ? aim : Math.PI - aim;

// Vetor da fonte de luz até o ponteiro (tela) → lado desejado (-1, 0, 1) e desvio limitado.
export function aimFromVector(vx, vy) {
    const side = Math.abs(vx) > 40 ? Math.sign(vx) : 0;
    return { side, aim: clamp(Math.atan2(vy, Math.max(Math.abs(vx), 40)), -AIM_MAX, AIM_MAX) };
}
