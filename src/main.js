// =============================================================================
// main.js — Loop, cenas, geração por seed, HUD e orquestração dos módulos
// =============================================================================

import { CANVAS_W, FLOOR_Y, DIFFICULTIES, NOISE } from './config.js';
import { rooms, applyLayout }                  from './rooms.js';
import { world, resetWorld }                   from './world.js';
import { emitNoise, tickNoise,
         resetNoise }                          from './noise.js';
import { seedRng, rnd, rndRange, pick,
         shuffle, dailySeed, randomSeed }      from './rng.js';
import { createDirector, updateDirector }      from './director.js';
import { initAudio, sfxClick, sfxHeartbeat, sfxBreath, sfxFootstep, sfxDeath,
         sfxWin, sfxDoor, sfxKillerStep, sfxBang, sfxGlass, sfxGasp, sfxWhisper,
         sfxHurt, sfxCreakHide, sfxLight, sfxLowBattery, sfxBlackout, transitionAmbient, stopAmbient,
         toggleMute, isMuted, suspendAudio, resumeAudio, spatial, spatialFor,
         startMusic, stopMusic, setTension, getVolume, setVolume } from './audio.js';
import { buildItems }                         from './items.js';
import { attempt, storeGet, storeGetJSON, storeSet } from './safe.js';
import { spawnKillers, updateKiller, getHeartbeatIntensity,
         anyKillerChasingInRoom }              from './killer.js';
import { createPlayer, updatePlayer, interact, getInteractionHint,
         throwBottle, changeBattery, toggleDoorLock, docTotal } from './player.js';
import { writeSave, readSave, hasSave, sanitizeSnapshot, getSaveTimestamp, deleteSave,
         getBestTime, submitTime, getEndings, unlockEnding } from './save.js';
import { render }                              from './render.js';
import { keysHeld, initInput, initTouch, registerCallbacks, bindings,
         REMAPPABLE, setBinding, resetBindings, captureNextKey, keyLabel, aimInput, initAim } from './input.js';
import { aimFromVector } from './aim.js';

// ── Estado ────────────────────────────────────────────────────────────────

let scene         = 'menu';   // 'menu' | 'options' | 'play' | 'paused' | 'dead' | 'win'
let player        = {};
let killers       = [];
let items         = [];
let director      = createDirector();
let aiCtx         = null;
let diffKey       = storeGet('casaEscura_diff') || 'normal';
let diff          = DIFFICULTIES[diffKey] || DIFFICULTIES.normal;
let seed          = '';
let seedDraft     = '';
let cameraX       = 0;
let gameTime      = 0;
let menuTime      = 0;
let msgTimer      = 0;
let dustParticles = [];
let lastFrameTime = 0;
let accumulator   = 0;
let endReady      = false;
let capAt         = 0;
let fps           = 60, fpsFrames = 0, fpsClock = 0;
let stats         = { searched: 0, spotted: 0, hurt: 0 };

const opts = { captions: true, ...storeGetJSON('casaEscura_opts', {}) };
const saveOpts = () => storeSet('casaEscura_opts', JSON.stringify(opts));

const STEP = 1 / 60;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fx = { shake: 0, zoom: 1, debug: false, dbg: null, reduced: reducedMotion };

const getEl = id => document.getElementById(id);
const root  = getEl('g');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randJit = (a, b) => a + Math.random() * (b - a);   // só cosmético
const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const ENDINGS = {
    fuga:    { kicker: 'liberdade',          title: 'VOCÊ ESCAPOU', pale: true,
               text: 'A porta se abre e o ar frio da noite te recebe.' },
    verdade: { kicker: 'a verdade',          title: 'A VERDADE',    pale: true,
               text: 'Lá fora, você olha para trás. Na janela do sótão, alguém usando o seu rosto acena para você.' },
    ficar:   { kicker: 'o último morador',   title: 'VOCÊ FICOU',   pale: false,
               text: 'Você entende. A casa sempre precisou de alguém para ficar. Agora é você que anda de um lado para o outro, a noite toda.' },
};
const ACTION_LABELS = { left: 'Esquerda', right: 'Direita', run: 'Correr', interact: 'Interagir', light: 'Lanterna',
                        throw: 'Jogar garrafa', battery: 'Trocar pilhas', lock: 'Trancar porta', breath: 'Segurar fôlego' };
const keysOf = a => bindings[a].map(keyLabel).filter((v, i, arr) => arr.indexOf(v) === i).join(' / ');

// ── UI helpers ────────────────────────────────────────────────────────────

function setScene(s) { scene = s; root.dataset.scene = s; }

function showOverlay(html, cls = '') {
    const ov = getEl('ov');
    ov.className = cls; ov.innerHTML = html; ov.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('on')));
}
function hideOverlay() { const ov = getEl('ov'); ov.classList.remove('on'); ov.hidden = true; }

function showMessage(text, duration) {
    const el = getEl('msg');
    el.classList.remove('lore'); el.textContent = text; msgTimer = duration ?? 2;
}

let toastHandle = null;
function toast(text) {
    const el = getEl('toast');
    el.textContent = text; el.classList.add('on');
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => el.classList.remove('on'), 1800);
}

let capHandle = null;

// ── Sinais de perigo ──────────────────────────────────────────────────────
// 1) Escondido: legenda por faixa de distância (com histerese) para o jogador saber se a espera tem fim.
// 2) Vinheta lateral vermelha do lado do assassino que está na sala.
function updateAim(dt) {
    let v = null;
    if (aimInput.touch && Math.hypot(aimInput.touch.dx, aimInput.touch.dy) > 14) v = { x: aimInput.touch.dx, y: aimInput.touch.dy };
    else if (!aimInput.touch && aimInput.mouse && performance.now() - aimInput.mouseAt < 3000)
        v = { x: aimInput.mouse.x - (player.x - cameraX), y: aimInput.mouse.y - (FLOOR_Y - 80) };
    let target = 0;
    if (v && !player.hidden) {
        const r = aimFromVector(v.x, v.y);
        if (!player.moving && r.side) player.dir = r.side;     // parado: o mouse escolhe o lado
        target = (!r.side || r.side === player.dir) ? r.aim : 0;
    }
    player.aim += (target - player.aim) * Math.min(1, dt * 12);
}

// Vibração curta no celular (ignorada com "reduzir movimento").
const vibrate = pattern => { if (!reducedMotion && navigator.vibrate) attempt(() => navigator.vibrate(pattern)); };
const coarsePointer = matchMedia('(pointer: coarse)').matches;
let nearWarned = false;

let hideCue = { band: -1, cand: -1, t: 0 };
let dangerL = 0, dangerR = 0;

function updateHideCue(dt) {
    if (!player.hidden) { hideCue.band = -1; hideCue.cand = -1; hideCue.t = 0; return; }
    let d = Infinity;
    for (const k of killers) if (k.room === player.room) d = Math.min(d, Math.abs(k.x - player.x));
    const band = d < 250 ? 3 : d < 550 ? 2 : d < Infinity ? 1 : 0;
    if (hideCue.band === -1) { hideCue.band = hideCue.cand = band; return; }   // 1ª leitura: sem legenda
    if (band !== hideCue.cand) { hideCue.cand = band; hideCue.t = 0; return; }
    hideCue.t += dt;
    if (band === hideCue.band || hideCue.t < 0.5) return;
    const prev = hideCue.band; hideCue.band = band;
    if (band === 3) caption('[passos bem perto]');
    else if (band === 2) caption(prev < 2 ? '[passos se aproximando]' : '[passos se afastando]');
    else if (band === 1 && prev > 1) caption('[passos se afastando]');
    else if (band === 0) caption('[silêncio... ele saiu da sala]');
}

function updateDangerEdges(dt) {
    let l = 0, r = 0;
    for (const k of killers) {
        if (k.room !== player.room) continue;
        const d = Math.abs(k.x - player.x);
        let i = Math.max(0, 1 - d / 900) * 0.8;
        if (k.state === 'chase') i = Math.max(0.75, i);
        if (player.hidden) i *= 0.6;
        if (k.x < player.x) l = Math.max(l, i); else r = Math.max(r, i);
    }
    const peak = Math.max(l, r);
    if (peak > 0.6 && !nearWarned) { nearWarned = true; vibrate(40); }
    else if (peak < 0.35) nearWarned = false;
    const f = Math.min(1, dt * 6);
    dangerL += (l - dangerL) * f; dangerR += (r - dangerR) * f;
    const el = getEl('danger');
    el.style.setProperty('--dl', dangerL.toFixed(3));
    el.style.setProperty('--dr', dangerR.toFixed(3));
}
function caption(text) {
    if (!opts.captions) return;
    const now = performance.now();
    if (now - capAt < 1200) return;
    capAt = now;
    const el = getEl('cap');
    el.textContent = text; el.classList.add('on');
    clearTimeout(capHandle);
    capHandle = setTimeout(() => el.classList.remove('on'), 1800);
}

function showBanner(text) {
    const b = getEl('banner');
    b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

function flashFade(duration = 0.5) {
    const f = getEl('fade');
    f.style.transition = 'none'; f.style.opacity = '1'; void f.offsetWidth;
    f.style.transition = `opacity ${duration}s`; f.style.opacity = '0';
}

// Clarão vermelho nas bordas (dano). Reinicia a animação CSS a cada golpe.
function flashHurt() {
    const h = getEl('hurt');
    h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit');
}

let lowBatWarned = false;   // aviso de bateria fraca já dado nesta carga

function clearHud() {
    ['hide', 'msg', 'key', 'obj', 'cap'].forEach(id => { getEl(id).textContent = ''; });
    getEl('sta').style.opacity = 0; getEl('bat').style.opacity = 0;
    getEl('banner').classList.remove('show');
}

const resize = () => root.style.setProperty('--u', (root.clientWidth / 100) + 'px');

// ── Telas ─────────────────────────────────────────────────────────────────

function showMenu() {
    setScene('menu');
    stopAmbient(); stopMusic(); clearHud();
    const save = hasSave() ? getSaveTimestamp() : null;
    const best = getBestTime();
    const endCount = getEndings().length;

    showOverlay(`
      <div class="panel">
        <p class="kicker">terror · furtividade</p>
        <h1>CASA ESCURA</h1>
        <p class="lead">Ligue a energia, abra o escritório, ache a <b>chave</b> e fuja pela porta da rua.<br>
        Algo ronda a casa — e ele ouve você.</p>
        <div class="seg">${Object.entries(DIFFICULTIES).map(([k, d]) =>
            `<button data-act="diff" data-v="${k}" class="${k === diffKey ? 'sel' : ''}">${d.label}</button>`).join('')}</div>
        <div class="row"><input type="text" id="seedin" maxlength="14" placeholder="seed (opcional)" value="${seedDraft}" autocomplete="off" spellcheck="false"></div>
        <div class="actions">
          <button class="btn primary" data-act="new">Novo jogo <kbd>Enter</kbd></button>
          <button class="btn" data-act="daily">Seed do dia</button>
          ${save ? `<button class="btn" data-act="continue">Continuar <kbd>C</kbd><small>salvo em ${save}</small></button>` : ''}
          <button class="btn" data-act="options">Opções</button>
        </div>
        <div class="controls">
          <span><b>Andar</b>${keysOf('left')} · ${keysOf('right')}</span>
          <span><b>Correr</b>${keysOf('run')}</span>
          <span><b>Lanterna</b>${keysOf('light')}</span>
          <span><b>Interagir</b>${keysOf('interact')}</span>
          <span><b>Garrafa</b>${keysOf('throw')}</span>
          <span><b>Pilhas</b>${keysOf('battery')}</span>
          <span><b>Trancar</b>${keysOf('lock')}</span>
          <span><b>Fôlego</b>${keysOf('breath')} (escondido)</span>
        </div>
        <p class="meta">P/Esc pausa · Ctrl+S salva · M som · F3 debug</p>
        ${best !== null ? `<p class="best">Melhor fuga · ${fmtTime(best)} · Finais ${endCount}/3</p>` : (endCount ? `<p class="best">Finais ${endCount}/3</p>` : '')}
      </div>`);
    const input = getEl('seedin');
    if (input) input.addEventListener('input', () => { seedDraft = input.value; });
}

function showOptions() {
    setScene('options');
    showOverlay(`
      <div class="panel">
        <p class="kicker">configurações</p>
        <h1 style="font-size:calc(var(--u)*5)">OPÇÕES</h1>
        <div class="row"><span class="meta">Volume</span><input type="range" id="vol" min="0" max="100" value="${Math.round(getVolume() * 100)}"></div>
        <div class="row"><button class="btn" data-act="captions">Legendas de som: ${opts.captions ? 'ligadas' : 'desligadas'}</button></div>
        <p class="meta">Teclas — clique para remapear</p>
        <div class="opts">${REMAPPABLE.map(a =>
            `<button class="btn" data-act="rebind" data-a="${a}">${ACTION_LABELS[a]} <b>${keysOf(a)}</b></button>`).join('')}</div>
        <div class="actions">
          <button class="btn" data-act="resetkeys">Restaurar teclas</button>
          <button class="btn primary" data-act="back">Voltar <kbd>Esc</kbd></button>
        </div>
      </div>`);
    const vol = getEl('vol');
    if (vol) vol.addEventListener('input', () => setVolume(vol.value / 100));
}

// ── Geração do mundo (seed) ───────────────────────────────────────────────

function buildSnapshot() {
    return {
        seed, diff: diffKey, elapsed: Math.round(gameTime),
        power: world.power, locked: world.locked,
        player: { room: player.room, x: Math.round(player.x), dir: player.dir, hasKey: player.hasKey,
                  hasFuse: player.hasFuse, battery: player.battery, batteries: player.batteries,
                  bottles: player.bottles, hits: player.hits, docs: [...player.docs], photoSeen: player.photoSeen },
        killers: killers.map(k => ({ id: k.id, room: k.room, x: Math.round(k.x), goal: k.goal })),
        searched: items.map((it, i) => it.searched ? i : -1).filter(i => i >= 0),
    };
}

function applySnapshot(raw) {
    const s = sanitizeSnapshot(raw, {
        roomWidths: rooms.map(r => r.w), killerIds: killers.map(k => k.id),
        itemCount: items.length, maxHits: diff.hits,
    });
    Object.assign(player, s.player, { docs: new Set(s.player.docs) });
    player.stamina = 100; player.tired = false; player.light = false; player.hidden = null;
    world.power  = !!s.power;
    world.locked = s.locked || {};
    s.killers.forEach(sk => {
        const k = killers.find(k => k.id === sk.id);
        if (k) { k.room = sk.room; k.x = sk.x; k.goal = sk.goal; k.state = 'patrol'; k.waitTimer = 1; }
    });
    // Assassino em cima do jogador ao carregar seria morte injusta: afasta para ≥ 600px
    killers.forEach(k => {
        if (k.room !== player.room || Math.abs(k.x - player.x) >= 500) return;
        const w = rooms[k.room].w, side = player.x < w / 2 ? 1 : -1;
        k.x = clamp(player.x + side * 600, 60, w - 60);
        if (Math.abs(k.x - player.x) < 500) k.x = clamp(player.x - side * 600, 60, w - 60);
    });
    s.searched.forEach(i => { if (items[i]) { items[i].searched = true; items[i].content = null; } });
    gameTime = s.elapsed || 0;
}

function newGame(fromSave = false, seedIn = '') {
    let snap = null;
    if (fromSave) { snap = readSave(); if (!snap) fromSave = false; }
    if (snap) { diffKey = snap.diff; }
    diff = DIFFICULTIES[diffKey] || DIFFICULTIES.normal;
    storeSet('casaEscura_diff', diffKey);

    seed = snap ? snap.seed : ((seedIn || '').trim().toUpperCase() || randomSeed());
    seedRng(seed);
    applyLayout(shuffle);
    resetWorld(diff); resetNoise();
    items = buildItems(diff);

    player   = createPlayer();
    killers  = spawnKillers(diff, player);
    director = createDirector();
    aiCtx    = { player, items, world, diff, director, hooks };

    dustParticles = []; gameTime = 0; accumulator = 0;
    stats = { searched: 0, spotted: 0, hurt: 0 };
    fx.shake = 0; fx.zoom = 1; lowBatWarned = false;
    getEl('g').classList.remove('wounded'); getEl('hurt').classList.remove('hit');
    if (snap) applySnapshot(snap);

    setScene('play');
    hideOverlay(); clearHud(); flashFade(0.9);
    transitionAmbient(rooms[player.room].ambient);
    startMusic();
    showBanner(rooms[player.room].n);
    showMessage(snap ? 'Partida carregada.' : 'A casa está sem energia. Procure um fusível e a chave.', 4);
    if (coarsePointer) setTimeout(() => { if (scene === 'play') toast('Arraste na metade direita da tela para mirar a lanterna.'); }, 4500);
}

// ── Fim de jogo ───────────────────────────────────────────────────────────

function endGameCommon() {
    stopAmbient(); stopMusic(); clearHud(); deleteSave();
    endReady = false;
}

function die(reason) {
    if (scene !== 'play') return;
    setScene('dead');
    endGameCommon();
    sfxDeath();
    fx.shake = 0.8;
    const t = gameTime;
    setTimeout(() => {
        showOverlay(`
          <div class="panel">
            <p class="kicker">fim de jogo</p>
            <h1>VOCÊ MORREU</h1>
            <p class="lead">${reason}</p>
            <p class="stats">Sobreviveu <b>${fmtTime(t)}</b> · Vasculhou <b>${stats.searched}</b> · Avistado <b>${stats.spotted}×</b> · Feridas <b>${stats.hurt}</b></p>
            <p class="meta">${diff.label} · seed ${seed}</p>
            <div class="actions"><button class="btn primary" data-act="again">Tentar de novo <kbd>Enter</kbd></button>
            <button class="btn" data-act="menu">Menu <kbd>Esc</kbd></button></div>
          </div>`, 'dead');
        endReady = true;
    }, 1100);
}

function triggerEnd(id) {
    if (scene !== 'play') return;
    setScene('win');
    endGameCommon();
    sfxWin(); flashFade(1.2);
    const t = gameTime, e = ENDINGS[id];
    const record = id !== 'ficar' && submitTime(t);
    const count  = unlockEnding(id);
    setTimeout(() => {
        showOverlay(`
          <div class="panel">
            <p class="kicker">${e.kicker}</p>
            <h1 class="${e.pale ? 'pale' : ''}">${e.title}</h1>
            <p class="lead">${e.text}</p>
            <p class="stats">Tempo <b>${fmtTime(t)}</b> · Vasculhou <b>${stats.searched}</b> · Avistado <b>${stats.spotted}×</b> · Documentos <b>${player.docs.size}/${docTotal(items)}</b></p>
            ${record ? '<p class="best">Novo recorde!</p>' : ''}
            <p class="meta">Finais descobertos ${count}/3 · ${diff.label} · seed ${seed}</p>
            <div class="actions"><button class="btn primary" data-act="again">Jogar de novo <kbd>Enter</kbd></button>
            <button class="btn" data-act="menu">Menu <kbd>Esc</kbd></button></div>
          </div>`, 'win');
        endReady = true;
    }, 900);
}
const triggerWin = () => triggerEnd(player.docs.size >= docTotal(items) ? 'verdade' : 'fuga');

function pauseGame() {
    if (scene !== 'play') return;
    setScene('paused');
    suspendAudio();
    showOverlay(`
      <div class="panel">
        <p class="kicker">em pausa</p>
        <h1>PAUSADO</h1>
        <div class="actions">
          <button class="btn primary" data-act="resume">Continuar <kbd>P</kbd></button>
          <button class="btn" data-act="save">Salvar <kbd>Ctrl+S</kbd></button>
          <button class="btn" data-act="mute">Som: ${isMuted() ? 'desligado' : 'ligado'} <kbd>M</kbd></button>
          <button class="btn" data-act="menu">Menu <kbd>Q</kbd></button>
        </div>
      </div>`);
}
function resumeGame() {
    if (scene !== 'paused') return;
    hideOverlay(); setScene('play'); resumeAudio();
}

// ── Hooks da IA (sons espaciais, legendas, regras de dano) ─────────────────

const hooks = {
    onSpotted() {
        showMessage('Ele te viu!', 1.5); stats.spotted++;
        fx.shake = Math.max(fx.shake, 0.4);
        vibrate([60, 40, 90]);
    },
    onCatch() {
        vibrate(220);
        player.hits++;
        if (player.hits >= diff.hits) { die('Ele te pegou.'); return 'dead'; }
        player.invuln = 2.5; stats.hurt++;
        fx.shake = 1; sfxHurt(); flashHurt(); caption('[ele te acerta]');
        showMessage('Ele te acertou! Você está ferido — mais lento e mais barulhento.', 3);
        return 'hurt';
    },
    onStep(k) {
        const sp = spatialFor(player.room, player.x, k.room, k.x);
        if (sp.dist > 2000) return;
        spatial(sp, () => sfxKillerStep());
        if (sp.dist < 1200) caption(k.room === player.room ? '[passos pesados]' : '[passos pesados atrás da porta]');
    },
    onDoor(k) {
        const sp = spatialFor(player.room, player.x, k.room, k.x);
        if (sp.dist > 1500) return;
        spatial(sp, () => sfxDoor(1));
        caption('[uma porta se abre]');
    },
    onBang(k, lockRoom, doorX) {
        const sp = spatialFor(player.room, player.x, k.room, doorX);
        spatial(sp, () => sfxBang());
        caption('[batidas na porta]');
    },
    onOpenHide() {
        sfxCreakHide(); fx.shake = Math.max(fx.shake, 0.15);
        caption('[um armário range]');
    },
    onCheckHide(k, item) {
        if (player.hidden !== item) return;
        const chance = player.holding ? diff.surviveHold : diff.surviveBase;
        if (rnd() > chance) die('Ele abriu o armário e te encontrou.');
        else { fx.shake = 0.3; caption('[ele fecha o armário e se afasta]'); }
    },
    onBlackout() { showMessage('A energia caiu.', 2.5); sfxBlackout(); caption('[a luz estala e apaga]'); },
    onFakeSound() {
        const others = rooms.map((_, i) => i).filter(i => i !== player.room);
        const r = pick(others), x = rndRange(300, rooms[r].w - 300);
        const sp = spatialFor(player.room, player.x, r, x);
        const kind = pick(['door', 'steps', 'whisper', 'glass']);
        if (kind === 'door')    spatial(sp, () => sfxDoor(0.9));
        if (kind === 'glass')   spatial(sp, () => sfxGlass());
        if (kind === 'whisper') spatial(sp, () => sfxWhisper());
        if (kind === 'steps')   [0, 450, 900].forEach(t => setTimeout(() => { if (scene === 'play') spatial(sp, () => sfxKillerStep()); }, t));
        caption('[um ruído em outro cômodo]');
    },
};

// ── Ações (teclado, botões e toque convergem aqui) ────────────────────────

function handleFlashlight() {
    if (player.hidden) {
        if (killers.some(k => k.room === player.room)) die('A luz te entregou dentro do armário.');
        return;
    }
    if (!player.light && player.battery <= 0) { showMessage('Sem bateria. Troque as pilhas.', 1.8); return; }
    player.light = !player.light;
    sfxLight(player.light);
}

function handleInteract() {
    const wasHidden = !!player.hidden;
    const ev = interact(player, items, killers);
    if (!wasHidden && player.hidden) {
        sfxCreakHide(); flashFade(0.25);
        caption('[você prende o ar no escuro]');
        showMessage(`Escondido. Segure o fôlego (${keysOf('breath')}) quando ele abrir o armário.`, 3.4);
    } else if (wasHidden && !player.hidden) {
        flashFade(0.2);
    }
    if (!ev) return;
    if (ev === 'win')              return triggerWin();
    if (ev === 'end:stay')         return triggerEnd('ficar');
    if (ev.startsWith('die:'))     return die(ev.slice(4));

    const msgs = {
        stayHidden:      ['Ele ainda está perto. Espere.', 1.6],
        locked:          ['Está trancada.', 1.8],
        noPower:         ['A fechadura elétrica está sem energia.', 2.2],
        unlocked:        ['Você destrancou a porta.', 1.4],
        needFuse:        ['O quadro de força está sem fusível.', 2.2],
        powerOn:         ['A energia voltou. A casa inteira ouviu isso.', 3.5],
        powerAlready:    ['A energia já está ligada.', 1.5],
        foundKey:        ['Você achou a chave da porta da rua!', 3],
        foundFuse:       ['Um fusível. Serve no quadro de força (Porão).', 3],
        foundBattery:    ['Pilhas! (R para trocar)', 2.2],
        foundBottle:     ['Uma garrafa. Jogue para distrair (G).', 2.5],
        foundMedkit:     ['Um curativo. Você enfaixa o ferimento.', 2.5],
        searchEmpty:     ['Nada aqui além de poeira...', 1.8],
        alreadySearched: ['Você já vasculhou isto.', 1.5],
    };
    if (ev.startsWith('found') || ev === 'searchEmpty') stats.searched++;
    if (msgs[ev]) showMessage(...msgs[ev]);
    if (ev === 'roomChange') {
        transitionAmbient(rooms[player.room].ambient);
        flashFade(0.45); showBanner(rooms[player.room].n);
    }
}

function handleThrow() {
    if (player.hidden) return;
    const r = throwBottle(player);
    if (!r) { showMessage('Sem garrafas.', 1.2); return; }
    spatial(spatialFor(player.room, player.x, player.room, r.x), () => sfxGlass());
    showMessage('Você jogou uma garrafa.', 1.2);
}

function handleBattery() {
    if (changeBattery(player)) { sfxClick(); showMessage('Pilhas trocadas.', 1.6); }
    else showMessage(player.batteries > 0 ? 'A bateria ainda está cheia.' : 'Sem pilhas reserva.', 1.6);
}

function handleLock() {
    const r = toggleDoorLock(player);
    if (r) showMessage(r === 'locked' ? 'Porta trancada.' : 'Porta destrancada.', 1.4);
}

function handleSave() {
    if (scene !== 'play' && scene !== 'paused') return;
    toast(writeSave(buildSnapshot()) ? 'Partida salva' : 'Erro ao salvar');
}

function handleMute() {
    toast(toggleMute() ? 'Som desligado' : 'Som ligado');
    const b = document.querySelector('#ov [data-act="mute"]');
    if (b) b.firstChild.textContent = `Som: ${isMuted() ? 'desligado' : 'ligado'} `;
}

const currentSeedInput = () => (getEl('seedin')?.value ?? seedDraft);

function handleEnter() {
    initAudio();
    if (scene === 'menu')   return newGame(false, currentSeedInput());
    if (scene === 'paused') return resumeGame();
    if ((scene === 'dead' || scene === 'win') && endReady) return newGame(false, '');
}

function handlePauseKey() {
    if (scene === 'play')    return pauseGame();
    if (scene === 'paused')  return resumeGame();
    if (scene === 'options') return showMenu();
    if ((scene === 'dead' || scene === 'win') && endReady) return showMenu();
}

function overlayAction(act, el) {
    initAudio();
    const a = {
        new:      () => newGame(false, currentSeedInput()),
        daily:    () => newGame(false, dailySeed()),
        again:    () => newGame(false, ''),
        continue: () => newGame(true),
        options:  showOptions,
        back:     showMenu,
        resume:   resumeGame,
        save:     handleSave,
        mute:     handleMute,
        menu:     showMenu,
        diff:     () => { diffKey = el.dataset.v; showMenu(); },
        captions: () => { opts.captions = !opts.captions; saveOpts(); showOptions(); },
        resetkeys:() => { resetBindings(); showOptions(); },
        rebind:   () => {
            el.classList.add('wait'); el.textContent = 'pressione uma tecla…';
            captureNextKey(code => { if (code !== 'Escape') setBinding(el.dataset.a, code); showOptions(); });
        },
    }[act];
    a?.();
}

// ── Update (passo fixo de 1/60 s) ─────────────────────────────────────────

function update(dt) {
    gameTime += dt;

    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) getEl('msg').textContent = ''; }

    const up = updatePlayer(player, dt, { diff });
    if (up.lightDied) { showMessage('A lanterna apagou. Troque as pilhas (R).', 2.5); sfxClick(); }
    if (up.gasp) {
        sfxGasp(); emitNoise(player.room, player.x, NOISE.gasp, 'gasp');
        if (killers.some(k => k.room === player.room && (k.state === 'search' || k.state === 'inspect') && Math.abs(k.x - player.x) < 900)) {
            return die('Ele ouviu você ofegar.');
        }
    }

    // Passos: som + ruído que os assassinos podem ouvir
    const hurtMul = player.hits > 0 ? NOISE.hurtMul : 1;
    if (player.moving) {
        player.stepDistance += up.speed * dt;
        if (player.stepDistance > (up.isRunning ? 50 : 62)) {
            player.stepDistance = 0;
            sfxFootstep(up.isRunning);
            emitNoise(player.room, player.x, (up.isRunning ? NOISE.run : NOISE.walk) * hurtMul, 'step');
        }
    }
    if (player.tired && !player.hidden) {
        player.breathTimer -= dt;
        if (player.breathTimer <= 0) {
            player.breathTimer = 0.8; sfxBreath();
            emitNoise(player.room, player.x, NOISE.breath, 'step');
        }
    }

    // HUD
    const sta = getEl('sta');
    sta.style.opacity = player.stamina < 99 ? 1 : 0;
    sta.firstChild.style.width = player.stamina + '%';
    sta.firstChild.style.background = player.tired ? '#a33' : '#b9b09c';
    const bat = getEl('bat');
    bat.style.opacity = (player.light || player.battery < 100) ? 1 : 0;
    bat.firstChild.style.width = player.battery + '%';
    bat.firstChild.style.background = player.battery < 20 ? '#a33' : '#d9bf7a';
    if (player.battery >= 20) lowBatWarned = false;
    else if (player.light && !lowBatWarned && player.battery > 0) {
        lowBatWarned = true; sfxLowBattery();
        showMessage(player.batteries > 0 ? `Bateria fraca. Troque as pilhas (${keysOf('battery')}).` : 'Bateria fraca — sem pilhas reserva.', 2.6);
    }
    getEl('g').classList.toggle('wounded', player.hits > 0);

    const inv = [];
    if (player.hasKey)  inv.push('Chave ✔');
    if (player.hasFuse) inv.push('Fusível ✔');
    if (player.batteries) inv.push('Pilhas ×' + player.batteries);
    if (player.bottles)   inv.push('Garrafas ×' + player.bottles);
    if (player.docs.size) inv.push(`Documentos ${player.docs.size}/${docTotal(items)}`);
    if (player.hits > 0)  inv.push('Ferido');
    getEl('key').textContent = inv.join('\n');
    getEl('obj').textContent =
        player.hasKey ? 'Fuja pela porta da rua'
        : !world.power ? (player.hasFuse ? 'Instale o fusível no Porão' : 'Procure um fusível')
        : 'Encontre a chave no Escritório';

    const msgEl = getEl('msg');
    if (player.narrativeText && player.narrativeTimer > 0) {
        msgEl.classList.add('lore'); msgEl.textContent = player.narrativeText; msgTimer = 0;
    } else msgEl.classList.remove('lore');

    // IA
    aiCtx.player = player;
    for (const k of killers) {
        if (scene !== 'play') return;
        updateKiller(k, aiCtx, dt);
    }
    updateDirector(director, { killers, world, hooks }, dt);
    tickNoise(dt);
    world.heat.forEach((h, i) => { world.heat[i] = h * (1 - dt / 120); });
    world.heat[player.room] += dt;

    // Batimento + música
    const heart = getHeartbeatIntensity(killers, player);
    player.heartbeatTimer -= dt;
    if (heart > 0.15 && player.heartbeatTimer <= 0) {
        sfxHeartbeat(0.4 + heart * 0.6);
        player.heartbeatTimer = 1.3 - 0.85 * heart;
    }
    setTension(Math.max(director.intensity, heart));
    updateAim(dt);
    updateHideCue(dt);
    updateDangerEdges(dt);

    if (msgTimer <= 0 && !player.narrativeText) msgEl.textContent = getInteractionHint(player, items, killers);

    cameraX = clamp(player.x - CANVAS_W / 2, 0, rooms[player.room].w - CANVAS_W);

    // Poeira da lanterna (cosmético)
    if (player.light && !player.hidden && dustParticles.length < 40) {
        dustParticles.push({ angle: randJit(-0.35, 0.35), distance: randJit(30, 600),
                             offsetY: randJit(-30, 30), lifetime: randJit(1, 3), age: 0 });
    }
    dustParticles.forEach(p => { p.age += dt; p.distance += randJit(-8, 8) * dt; p.offsetY += randJit(-10, 6) * dt; });
    dustParticles = dustParticles.filter(p => p.age < p.lifetime && player.light);
}

// ── Loop ──────────────────────────────────────────────────────────────────

function frame(ts) {
    const dt = Math.min(0.1, (ts - lastFrameTime) / 1000 || 0);
    lastFrameTime = ts;

    fpsFrames++; fpsClock += dt;
    if (fpsClock >= 0.5) { fps = Math.round(fpsFrames / fpsClock); fpsFrames = 0; fpsClock = 0; }

    if (scene === 'play') {
        accumulator += dt;
        let n = 0;
        while (accumulator >= STEP && n++ < 6) { update(STEP); accumulator -= STEP; }
        if (n >= 6) accumulator = 0;
    }
    const inMenu = scene === 'menu' || scene === 'options';
    if (inMenu) menuTime += dt;

    fx.shake = reducedMotion ? 0 : Math.max(0, fx.shake - dt * 1.6);
    const zoomTarget = (!reducedMotion && scene === 'play' && anyKillerChasingInRoom(killers, player)) ? 1.06 : 1;
    fx.zoom += (zoomTarget - fx.zoom) * Math.min(1, dt * 3);
    if (fx.debug) fx.dbg = { director, diff, seed, fps };

    render(inMenu ? 'menu' : scene, player, killers, items, dustParticles, cameraX,
           inMenu ? menuTime : gameTime, keysHeld, fx);

    requestAnimationFrame(frame);
}

// ── Inicialização ─────────────────────────────────────────────────────────

async function init() {
    resize();
    addEventListener('resize', resize);

    registerCallbacks({
        onInteract: handleInteract, onFlashlight: handleFlashlight, onThrow: handleThrow,
        onBattery: handleBattery,   onLock: handleLock,             onEnter: handleEnter,
        onSave: handleSave,         onPause: handlePauseKey,        onMute: handleMute,
        onDebug: () => { fx.debug = !fx.debug; toast(fx.debug ? 'Debug ligado (F3)' : 'Debug desligado'); },
        onContinue: () => { if (scene === 'menu' && hasSave()) { initAudio(); newGame(true); } },
        onQuit: () => { if (scene === 'paused') showMenu(); },
        getScene: () => scene,
    });
    initInput();
    initTouch();
    initAim(getEl('c'));

    getEl('ov').addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (btn) overlayAction(btn.dataset.act, btn);
    });

    addEventListener('blur', pauseGame);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    showMenu();
    requestAnimationFrame(frame);
}

init();
