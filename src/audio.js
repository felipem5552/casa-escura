import { pathDistance } from './noise.js';
import { attempt, storeGet, storeSet } from './safe.js';

// =============================================================================
// audio.js — Sistema de áudio (sons procedurais + ambiente por sala)
// =============================================================================

let audioCtx    = null;
let noiseBuffer = null;
let masterGain  = null;
let muted       = storeGet('casaEscura_muted') === '1';
let volume = (() => { const v = parseFloat(storeGet('casaEscura_vol')); return Number.isFinite(v) ? v : 0.9; })();

// Sons de ambiente: um loop por sala (chave = string do campo 'ambient' em rooms.js)
// Cada entrada tem: { node: OscillatorNode|null, gain: GainNode|null }
let   currentAmbient = null;

// ── Inicialização ─────────────────────────────────────────────────────────

// Deve ser chamada na primeira interação do usuário (exigência do browser).
export function initAudio() {
    if (!audioCtx) {
        audioCtx    = new (window.AudioContext || window.webkitAudioContext)();
        masterGain  = audioCtx.createGain();
        masterGain.gain.value = muted ? 0 : volume;
        masterGain.connect(audioCtx.destination);
        noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
        const data  = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

// ── Primitivas de síntese ─────────────────────────────────────────────────

// Toca um burst de ruído filtrado.
// dur  — duração em segundos
// freq — frequência do filtro BiquadFilter
// vol  — volume inicial (diminui até 0 no fim)
// type — tipo do filtro ('lowpass', 'highpass', 'bandpass')
export function playNoise(dur, freq, vol, type) {
    if (!audioCtx) return;
    const src    = audioCtx.createBufferSource();
    src.buffer   = noiseBuffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type  = type || 'lowpass';
    filter.frequency.value = freq;
    const gain   = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(outNode());
    src.start();
    src.stop(audioCtx.currentTime + dur);
}

// Toca um oscilador com envelope de volume.
// freq    — frequência inicial (Hz)
// dur     — duração em segundos
// vol     — volume inicial
// type    — forma de onda ('sine', 'square', 'sawtooth', 'triangle')
// freqEnd — frequência final para pitch slide (opcional)
// delay   — atraso em segundos antes de começar (opcional)
export function playTone(freq, dur, vol, type, freqEnd, delay) {
    if (!audioCtx) return;
    const t    = audioCtx.currentTime + (delay || 0);
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type   = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(outNode());
    osc.start(t);
    osc.stop(t + dur);
}

// ── SFX do jogo ──────────────────────────────────────────────────────────

export const sfxFootstep  = isRunning => playNoise(0.09, isRunning ? 900 : 450, isRunning ? 0.35 : 0.18);
export const sfxClick     = ()        => { playTone(1900, 0.03, 0.12, 'square'); playTone(1200, 0.04, 0.08, 'square', 0, 0.05); };
export const sfxDoor      = volume    => { playNoise(0.55, 260, 0.4 * volume); playTone(110, 0.55, 0.18 * volume, 'sawtooth', 55); };
export const sfxHeartbeat = volume    => { playTone(55, 0.14, 0.7 * volume, 'sine'); playTone(48, 0.16, 0.5 * volume, 'sine', 0, 0.17); };
export const sfxSting     = ()        => { playTone(220, 0.6, 0.25, 'sawtooth', 70); playNoise(0.5, 2000, 0.2, 'highpass'); };
export const sfxSearch    = ()        => { playNoise(0.25, 700, 0.25); playTone(140, 0.12, 0.12, 'triangle'); };
export const sfxBreath    = ()        => playNoise(0.35, 1200, 0.22, 'bandpass');

// Som ao ler um objeto narrativo
export const sfxNarrative = () => {
    playTone(320, 0.4, 0.06, 'sine');
    playTone(400, 0.3, 0.04, 'sine', 0, 0.1);
};

// ── Sons de ambiente por sala ─────────────────────────────────────────────
//
// Cada chave corresponde ao campo 'ambient' de uma sala em rooms.js.
// startAmbient() inicia o loop; stopAmbient() encerra com fade.

function buildAmbientCreak() {
    // Rangido de madeira: ruído grave com pulsos aleatórios
    // Implementado como ticker periódico (não loop de oscilador)
    return { type: 'ticker', freq: 180, vol: 0.07, filterType: 'lowpass', interval: [3000, 7000] };
}

function buildAmbientWind() {
    // Vento: ruído branco filtrado em loop contínuo
    return { type: 'continuous', freq: 400, vol: 0.04, filterType: 'bandpass' };
}

function buildAmbientTick() {
    // Relógio: dois cliques por segundo (tick-tock)
    return { type: 'ticker', freq: 2200, vol: 0.09, filterType: 'highpass', interval: [900, 1100] };
}

function buildAmbientDrip() {
    // Goteira: pulso agudo periódico
    return { type: 'ticker', freq: 1800, vol: 0.12, filterType: 'bandpass', interval: [1500, 4000] };
}

function buildAmbientHum() {
    // Zumbido elétrico: oscilador senoidal grave contínuo
    return { type: 'tone', freq: 60, vol: 0.05, waveType: 'sawtooth' };
}

const AMBIENT_CONFIGS = {
    creak: buildAmbientCreak,
    wind:  buildAmbientWind,
    tick:  buildAmbientTick,
    drip:  buildAmbientDrip,
    hum:   buildAmbientHum,
};

// Nó ativo de ambiente contínuo (oscilador ou ruído em loop)
let ambientContinuousNode = null;
let ambientContinuousGain = null;
// Handle do timeout de ambiente ticker
let ambientTickerHandle   = null;

// Inicia o som de ambiente de uma sala.
// ambientKey — valor do campo 'ambient' da sala (ex: 'creak', 'hum')
export function startAmbient(ambientKey) {
    if (!audioCtx || currentAmbient === ambientKey) return;
    stopAmbient();
    currentAmbient = ambientKey;

    if (!ambientKey || !AMBIENT_CONFIGS[ambientKey]) return;
    const cfg = AMBIENT_CONFIGS[ambientKey]();

    if (cfg.type === 'continuous') {
        // Ruído filtrado contínuo
        const src    = audioCtx.createBufferSource();
        src.buffer   = noiseBuffer;
        src.loop     = true;
        const filter = audioCtx.createBiquadFilter();
        filter.type  = cfg.filterType;
        filter.frequency.value = cfg.freq;
        const gain   = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(cfg.vol, audioCtx.currentTime + 1.5);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        src.start();
        ambientContinuousNode = src;
        ambientContinuousGain = gain;

    } else if (cfg.type === 'tone') {
        // Oscilador contínuo
        const osc  = audioCtx.createOscillator();
        osc.type   = cfg.waveType || 'sine';
        osc.frequency.value = cfg.freq;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(cfg.vol, audioCtx.currentTime + 1.5);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        ambientContinuousNode = osc;
        ambientContinuousGain = gain;

    } else if (cfg.type === 'ticker') {
        // Pulsos periódicos com intervalo aleatório
        function tick() {
            if (currentAmbient !== ambientKey) return;
            playNoise(0.08, cfg.freq, cfg.vol, cfg.filterType);
            const delay = cfg.interval[0] + Math.random() * (cfg.interval[1] - cfg.interval[0]);
            ambientTickerHandle = setTimeout(tick, delay);
        }
        const firstDelay = cfg.interval[0] + Math.random() * (cfg.interval[1] - cfg.interval[0]);
        ambientTickerHandle = setTimeout(tick, firstDelay);
    }
}

// Para o som de ambiente atual com fade suave.
export function stopAmbient() {
    currentAmbient = null;

    if (ambientTickerHandle !== null) {
        clearTimeout(ambientTickerHandle);
        ambientTickerHandle = null;
    }

    if (ambientContinuousNode && ambientContinuousGain) {
        const g = ambientContinuousGain;
        if (audioCtx) g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
        const node = ambientContinuousNode;
        setTimeout(() => attempt(() => node.stop()), 900);
        ambientContinuousNode = null;
        ambientContinuousGain = null;
    }
}

// Troca o ambiente ao entrar em uma nova sala.
// Chame isso sempre que player.room mudar.
export function transitionAmbient(newAmbientKey) {
    if (newAmbientKey === currentAmbient) return;
    stopAmbient();
    // Pequeno delay para não sobrepor com o som de porta
    setTimeout(() => startAmbient(newAmbientKey), 600);
}


// ── Controle global ───────────────────────────────────────────────────────

export const isMuted = () => muted;

export function toggleMute() {
    muted = !muted;
    storeSet('casaEscura_muted', muted ? '1' : '0');
    if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : volume, audioCtx.currentTime, 0.05);
    return muted;
}

export function suspendAudio() { if (audioCtx && audioCtx.state === 'running') audioCtx.suspend(); }
export function resumeAudio()  { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }

// Morte: golpe grave + ruído
export const sfxDeath = () => {
    playTone(160, 0.9, 0.5, 'sawtooth', 35);
    playNoise(0.7, 1800, 0.45, 'highpass');
    playTone(70, 1.2, 0.5, 'sine', 30, 0.1);
};

// Vitória: acorde suave descendente
export const sfxWin = () => {
    playTone(392, 1.6, 0.10, 'sine');
    playTone(494, 1.6, 0.08, 'sine', 0, 0.12);
    playTone(587, 2.0, 0.07, 'sine', 0, 0.24);
};


// ── Volume ────────────────────────────────────────────────────────────────
export const getVolume = () => volume;
export function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    storeSet('casaEscura_vol', volume);
    if (masterGain && !muted) masterGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.05);
}

// ── Áudio espacial ────────────────────────────────────────────────────────
// Dentro de spatial(sp, fn) todo som tocado passa por ganho (distância),
// pan estéreo (lado) e filtro grave (som abafado por porta/parede).
let curSp = null;

function outNode() {
    if (!curSp) return masterGain;
    const sp = curSp;
    const g = audioCtx.createGain();
    g.gain.value = sp.gain;
    let head = g;
    if (sp.lp) {
        const f = audioCtx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = sp.lp;
        f.connect(g); head = f;
    }
    if (audioCtx.createStereoPanner) {
        const p = audioCtx.createStereoPanner();
        p.pan.value = sp.pan;
        g.connect(p); p.connect(masterGain);
    } else {
        g.connect(masterGain);
    }
    return head;
}

export function spatial(sp, fn) {
    curSp = sp;
    try { fn(); } finally { curSp = null; }
}

// Parâmetros espaciais de uma fonte (srcRoom, srcX) ouvida em (listenerRoom, listenerX).
export function spatialFor(lr, lx, sr, sx) {
    const dist = pathDistance(lr, lx, sr, sx);
    const same = lr === sr;
    return {
        dist,
        gain: Math.max(0.04, 1 / (1 + dist / 600)),
        pan:  same ? Math.max(-1, Math.min(1, (sx - lx) / 900)) : 0,
        lp:   same ? 0 : 520,
    };
}

// ── Música reativa à tensão ───────────────────────────────────────────────
let music = null;

export function startMusic() {
    if (!audioCtx || music) return;
    const g = audioCtx.createGain(); g.gain.value = 0;
    const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
    const o1 = audioCtx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = audioCtx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 58.3;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(masterGain);
    o1.start(); o2.start();
    music = { g, f, o1, o2 };
}

export function setTension(t) {
    if (!music) return;
    const now = audioCtx.currentTime;
    music.g.gain.setTargetAtTime(0.01 + 0.05 * t, now, 0.4);
    music.f.frequency.setTargetAtTime(160 + 900 * t, now, 0.4);
    music.o2.frequency.setTargetAtTime(58.3 + 6 * t, now, 0.4);
}

export function stopMusic() {
    if (!music) return;
    const m = music; music = null;
    m.g.gain.setTargetAtTime(0, audioCtx.currentTime, 0.3);
    setTimeout(() => attempt(() => { m.o1.stop(); m.o2.stop(); }), 1500);
}

// ── Novos SFX ─────────────────────────────────────────────────────────────
export const sfxKillerStep = () => { playNoise(0.14, 260, 0.55); playTone(70, 0.12, 0.3, 'sine', 40); };
export const sfxBang       = () => { playNoise(0.18, 400, 0.6);  playTone(90, 0.2, 0.4, 'square', 50); };
export const sfxGlass      = () => { playNoise(0.35, 5000, 0.4, 'highpass'); playTone(2600, 0.2, 0.1, 'triangle', 1200); };
export const sfxPower      = () => { playTone(50, 1.2, 0.4, 'sawtooth', 120); playNoise(0.5, 1500, 0.3, 'bandpass'); playTone(880, 0.15, 0.1, 'square', 0, 0.9); };
export const sfxPickup     = () => { playTone(660, 0.12, 0.1, 'triangle'); playTone(990, 0.15, 0.08, 'triangle', 0, 0.08); };
export const sfxGasp       = () => playNoise(0.5, 900, 0.5, 'bandpass');
export const sfxWhisper    = () => playNoise(1.2, 3200, 0.06, 'bandpass');
// Lanterna: ligar sobe (dois cliques agudos), desligar desce; aviso grave de bateria fraca.
export const sfxLight      = on => on
    ? (playTone(900, 0.03, 0.1, 'square'), playTone(1500, 0.04, 0.09, 'square', 0, 0.04), playNoise(0.05, 2500, 0.05, 'highpass'))
    : (playTone(1400, 0.03, 0.1, 'square'), playTone(700, 0.05, 0.09, 'square', 0, 0.04));
export const sfxLowBattery = () => { playTone(220, 0.12, 0.12, 'sawtooth'); playTone(180, 0.18, 0.1, 'sawtooth', 0, 0.14); };
export const sfxHurt       = () => { playTone(120, 0.35, 0.5, 'sawtooth', 50); playNoise(0.3, 700, 0.5); };
export const sfxCreakHide  = () => { playTone(180, 0.5, 0.12, 'sawtooth', 120); playNoise(0.4, 500, 0.1, 'bandpass'); };
export const sfxBlackout   = () => { playTone(80, 0.6, 0.3, 'sawtooth', 30); playNoise(0.3, 2500, 0.2, 'highpass'); };
