// Smoke test do render com canvas falso: pega erros de referência/TDZ que node --check não vê.
const mk = () => new Proxy(function () {}, {
    get: (t, k) => k === 'canvas' ? undefined : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : mk(),
    set: () => true, apply: () => mk(),
});
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => mk() });
globalThis.document = { getElementById: fakeCanvas, createElement: fakeCanvas };
const { render } = await import('../src/render.js');
const { rooms } = await import('../src/rooms.js');
const { world } = await import('../src/world.js');
const base = { x: 900, dir: 1, aim: 0.3, moving: true, light: true, hidden: null, battery: 15, room: 0 };
for (let room = 0; room < rooms.length; room++) {
    for (const reduced of [false, true]) {
        const p = { ...base, room };
        const ks = [{ room, x: 1200, px: 1190, dir: -1, state: 'chase', roleKey: 'watcher' }];
        render('play', p, ks, [{ room, x: 500, itemType: 'h' }, { room, x: 700, itemType: 's' }, { room, x: 300, itemType: 'p' }, { room, x: 200, itemType: 'n' }],
               [{ angle: 0, distance: 100, offsetY: 0, age: 1, lifetime: 3 }], 100, 5, {}, { shake: 0.5, zoom: 1, reduced });
        render('play', { ...p, hidden: {} }, [], [], [], 100, 5, {}, { reduced });
    }
}
world.blackout = 3;
render('play', base, [], [], [], 0, 2, {}, {});
render('menu', base, [], [], [], 0, 2, {}, {});
console.log('render smoke ok');
