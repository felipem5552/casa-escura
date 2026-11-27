// Testa a cadeia de puzzles: fusível → quadro de força → escritório → chave → porta da rua.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document = { getElementById: () => ({ textContent: '' }) };
const { rooms, applyLayout } = await import('../src/rooms.js');
const { world, resetWorld } = await import('../src/world.js');
const { createPlayer, interact, throwBottle, changeBattery, toggleDoorLock, docTotal } = await import('../src/player.js');
const { seedRng, shuffle } = await import('../src/rng.js');
const { DIFFICULTIES } = await import('../src/config.js');

function items() {
    const l = [];
    rooms.forEach((r, i) => (r.it || []).forEach(d => l.push({ room: i, x: d[0], itemType: d[1], loreText: d[3] || null, special: d[4] || null, searched: false, content: null })));
    return l;
}
const stand = (p, room, x) => { p.room = room; p.x = x; p.doorCooldown = 0; };

test('cadeia completa de puzzles até a vitória', () => {
    seedRng('PUZ'); applyLayout(shuffle); resetWorld(DIFFICULTIES.normal);
    const its = items(), p = createPlayer();
    const fuseBox = its.find(i => i.room === 1 && i.itemType === 's'); fuseBox.content = 'fuse';
    const keyBox  = its.find(i => i.room === 7 && i.itemType === 's'); keyBox.content  = 'key';
    const panel   = its.find(i => i.itemType === 'p');

    // porta do escritório sem energia
    const officeDoor = rooms[0].doors.find(d => d.to === 7);
    assert.equal(officeDoor.needs, 'power');
    stand(p, 0, officeDoor.x);
    assert.equal(interact(p, its, []), 'noPower');

    // quadro sem fusível
    stand(p, panel.room, panel.x);
    assert.equal(interact(p, its, []), 'needFuse');

    // pega fusível, instala
    stand(p, fuseBox.room, fuseBox.x);
    assert.equal(interact(p, its, []), 'foundFuse');
    stand(p, panel.room, panel.x);
    assert.equal(interact(p, its, []), 'powerOn');
    assert.equal(world.power, true);

    // agora o escritório abre
    stand(p, 0, officeDoor.x);
    assert.equal(interact(p, its, []), 'roomChange');
    assert.equal(p.room, 7);

    // chave
    stand(p, 7, keyBox.x);
    assert.equal(interact(p, its, []), 'foundKey');

    // porta da rua
    const front = rooms[1].doors.find(d => d.front);
    stand(p, 1, front.x);
    assert.equal(interact(p, its, []), 'win');
});

test('tranca/destranca e arrombamento exigem destrancar para passar', () => {
    seedRng('LOCK'); applyLayout(shuffle); resetWorld(DIFFICULTIES.normal);
    const its = items(), p = createPlayer();
    const door = rooms[0].doors.find(d => d.to === 2);
    stand(p, 0, door.x);
    assert.equal(toggleDoorLock(p), 'locked');
    assert.equal(interact(p, its, []), 'unlocked');
    assert.equal(interact(p, its, []), 'roomChange');
});

test('garrafa, pilhas, documentos e final "ficar"', () => {
    seedRng('DOC'); applyLayout(shuffle); resetWorld(DIFFICULTIES.normal);
    const its = items(), p = createPlayer();
    p.bottles = 1; p.dir = 1; stand(p, 1, 300);
    const r = throwBottle(p);
    assert.ok(r && r.x > 300); assert.equal(throwBottle(p), null);

    p.battery = 10; p.batteries = 1;
    assert.equal(changeBattery(p), true); assert.equal(p.battery, 100); assert.equal(changeBattery(p), false);

    const photo = its.find(i => i.special === 'photo');
    stand(p, photo.room, photo.x);
    interact(p, its, []);                       // sem todos os documentos: só lê
    assert.equal(p.photoSeen, false);
    its.filter(i => i.itemType === 'n' && !i.special).forEach(n => { stand(p, n.room, n.x); interact(p, its, []); });
    assert.equal(p.docs.size, docTotal(its));
    stand(p, photo.room, photo.x);
    assert.equal(interact(p, its, []), null);   // reconhece o próprio rosto
    assert.equal(interact(p, its, []), 'end:stay');
});

test('conteúdos sempre cabem: chave no escritório, fusível fora do porão', () => {
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
        seedRng(seed);
        const its = items();
        assert.ok(its.filter(i => i.room === 7 && i.itemType === 's').length >= 1);
        assert.ok(its.filter(i => [1, 2, 3, 4, 6].includes(i.room) && i.itemType === 's').length >= 1);
    }
});
