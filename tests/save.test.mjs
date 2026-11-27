import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSnapshot } from '../src/save.js';

const ctx = { roomWidths: [5600, 2400, 2200], killerIds: ['a', 'b'], itemCount: 5, maxHits: 2 };

test('save válido passa intacto nos campos principais', () => {
    const s = sanitizeSnapshot({ elapsed: 90, power: true, locked: { 1: true },
        player: { room: 2, x: 500, dir: -1, hasKey: true, battery: 40, hits: 1, docs: ['d1'] },
        killers: [{ id: 'a', room: 1, x: 700, goal: 2 }], searched: [0, 3] }, ctx);
    assert.equal(s.player.room, 2); assert.equal(s.player.x, 500); assert.equal(s.player.dir, -1);
    assert.deepEqual(s.killers, [{ id: 'a', room: 1, x: 700, goal: 2 }]);
    assert.deepEqual(s.searched, [0, 3]); assert.deepEqual(s.locked, { 1: true });
});

test('lixo total vira snapshot seguro', () => {
    for (const bad of [null, undefined, 42, 'x', {}, { player: 7, killers: 'z', searched: {} }]) {
        const s = sanitizeSnapshot(bad, ctx);
        assert.ok(s.player.room >= 0 && s.player.room < 3);
        assert.ok(Number.isFinite(s.player.x) && Number.isFinite(s.elapsed));
        assert.deepEqual(s.killers, []); assert.deepEqual(s.searched, []);
    }
});

test('sala, posição e acertos ficam dentro dos limites', () => {
    const s = sanitizeSnapshot({ player: { room: 99, x: 1e9, hits: 50, battery: -5, bottles: NaN },
        killers: [{ id: 'a', room: -3, x: -100, goal: 77 }, { id: 'zzz', room: 0, x: 0 }],
        searched: [1, 1, 9, -1, 'q'] }, ctx);
    assert.equal(s.player.room, 2);
    assert.equal(s.player.x, 2200 - 60);
    assert.equal(s.player.hits, 1);            // maxHits - 1: carregar nunca já começa "morto"
    assert.equal(s.player.battery, 0); assert.equal(s.player.bottles, 0);
    assert.equal(s.killers.length, 1);         // id desconhecido descartado
    assert.deepEqual(s.killers[0], { id: 'a', room: 0, x: 60, goal: 2 });
    assert.deepEqual(s.searched, [1]);
});
