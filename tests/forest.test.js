import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../core/engine.js';
import { armorBonusOf } from '../core/attack.js';
import { checkLine } from '../core/los.js';
import { at, game, mech, playWith } from './helpers.js';

const cellAt = (s, c, r) => s.map.cells[`${at(c, r).q},${at(c, r).r}`];
const forestMap = (hexes) => ({ terrain: hexes.map(([col, row]) => ({ col, row, type: 'forest' })) });

test('forest: energy dice with 2 or 3 heat set forest on the line on fire, nearest to the attacker first', () => {
  let seen = new Set();
  for (let seed = 1; seed < 60; seed++) {
    let s = game([mech('a1', 1, 'medium', 6, 8, { weapons: ['laser_l'] }), mech('b1', 2, 'medium', 10, 8, { facing: 3 })], { map: forestMap([[7, 8], [8, 8], [9, 8]]) });
    s = playWith(s, apply, 1, 'a1', ['laser']); s.rngState = seed;
    const r = apply(s, { type: 'FIRE', player: 1, mechId: 'a1', weaponId: 'w0', targetId: 'b1', pipIds: ['d0'] });
    assert.ok(r.ok, r.error);
    const heat = r.events.find((e) => e.type === 'attack').rolls.energy, k = heat.filter((h) => h >= 2).length;
    const burnt = [7, 8, 9].filter((c) => cellAt(r.state, c, 8).terrain === 'fire');
    assert.deepEqual(burnt, [7, 8, 9].slice(0, k), `heat ${heat}`);
    seen.add(k);
  }
  assert.ok(seen.has(0) && seen.size > 1);
});

test('forest gives +1 armor in the target hex and on the line (like rocks)', () => {
  const s = game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 10, 8, { facing: 3 })], { map: forestMap([[8, 8], [10, 8]]) });
  const los = checkLine(s, s.mechs.a1.pos, s.mechs.b1.pos);
  assert.equal(armorBonusOf(s, s.mechs.a1, s.mechs.b1, los).total, 2);
});

test('flamer: one energy die = heat for the attacker, no damage; target in forest -> forest burns', () => {
  let s = game([mech('a1', 1, 'medium', 6, 8, { weapons: ['flamer'] }), mech('b1', 2, 'medium', 7, 8, { facing: 3 })], { map: forestMap([[7, 8]]) });
  s = playWith(s, apply, 1, 'a1', ['laser']);
  const r = apply(s, { type: 'FIRE', player: 1, mechId: 'a1', weaponId: 'w0', targetId: 'b1', pipIds: ['d0'] });
  assert.ok(r.ok, r.error);
  const ev = r.events.find((e) => e.type === 'attack');
  assert.equal(ev.damage, 0); assert.ok(ev.heat >= 1);
  assert.ok(r.state.activation.heat.weapons >= 1);
  assert.equal(cellAt(r.state, 7, 8).terrain, 'fire');
  assert.ok(r.state.mechs.b1.overheat >= 2);                      // flamer +1, fire appearing under it +1
});

test('lasers: every point of terrain armor bonus (forest, rocks) also shortens the max range; other weapons are not affected', async () => {
  const { validateAttack } = await import('../core/attack.js');
  const { WEAPONS } = await import('../core/data/weapons.js');
  const s = game([mech('a1', 1, 'medium', 4, 8), mech('b1', 2, 'medium', 9, 8, { facing: 3 })], { map: forestMap([[5, 8], [6, 8], [9, 8]]) });
  const L = validateAttack(s, s.mechs.a1, s.mechs.b1, WEAPONS.laser_l);
  assert.equal(L.maxRange, WEAPONS.laser_l.maxRange - 3);
  const B = validateAttack(s, s.mechs.a1, s.mechs.b1, WEAPONS.ac5);
  assert.equal(B.maxRange, WEAPONS.ac5.maxRange);
  const far = game([mech('a1', 1, 'medium', 1, 8), mech('b1', 2, 'medium', 9, 8, { facing: 3 })], { map: forestMap([[3, 8], [4, 8], [9, 8]]) });
  assert.throws(() => validateAttack(far, far.mechs.a1, far.mechs.b1, WEAPONS.laser_s), /out of range/);   // 8 hexes > 9 − 3
});

test('overheat over 6 is dropped at once as unblockable damage dice: flamer on a mech with 6 tokens in a forest → 2 dice', () => {
  let s = game([mech('a1', 1, 'medium', 6, 8, { weapons: ['flamer'] }), mech('b1', 2, 'heavy', 7, 8, { facing: 3 })], { map: forestMap([[7, 8]]) });
  s.mechs.b1.overheat = 6;
  s = playWith(s, apply, 1, 'a1', ['laser']);
  const r = apply(s, { type: 'FIRE', player: 1, mechId: 'a1', weaponId: 'w0', targetId: 'b1', pipIds: ['d0'] });
  assert.ok(r.ok, r.error);
  assert.equal(r.state.mechs.b1.overheat, 6);
  assert.equal(r.events.filter((e) => e.type === 'damage_die' && e.mechId === 'b1').length, 2);
});

test('flamer outside a forest: the 7th token is damage at once, not later', () => {
  let s = game([mech('a1', 1, 'medium', 6, 8, { weapons: ['flamer'] }), mech('b1', 2, 'heavy', 7, 8, { facing: 3 })]);
  s.mechs.b1.overheat = 6;
  s = playWith(s, apply, 1, 'a1', ['laser']);
  const r = apply(s, { type: 'FIRE', player: 1, mechId: 'a1', weaponId: 'w0', targetId: 'b1', pipIds: ['d0'] });
  assert.equal(r.state.mechs.b1.overheat, 6);
  assert.equal(r.events.filter((e) => e.type === 'damage_die' && e.mechId === 'b1').length, 1);
});

test('no sticky forced shutdown: a mech that overflowed and cooled down may roll again', async () => {
  const { mustShutdown } = await import('../core/engine.js');
  const s = game([mech('a1', 1, 'light', 6, 8, { coolers: 'double' }), mech('b1', 2, 'light', 12, 8)]);
  const m = s.mechs.a1; m.overheat = 4;
  assert.equal(mustShutdown(m), false);
  m.overheat = 6; assert.equal(mustShutdown(m), true);          // 6 tokens = no pilot dice left
});

test('lasers: the nearer-enemy armor bonus shortens the laser range too', async () => {
  const { validateAttack, laserArmorCut } = await import('../core/attack.js');
  const { WEAPONS } = await import('../core/data/weapons.js');
  const { checkLine } = await import('../core/los.js');
  const s = game([mech('a1', 1, 'medium', 4, 8), mech('b2', 2, 'medium', 6, 8, { facing: 3 }), mech('b1', 2, 'medium', 10, 8, { facing: 3 })]);
  assert.equal(laserArmorCut(s, s.mechs.a1, s.mechs.b1, checkLine(s, s.mechs.a1.pos, s.mechs.b1.pos)), 1);
  assert.equal(validateAttack(s, s.mechs.a1, s.mechs.b1, WEAPONS.laser_l).maxRange, WEAPONS.laser_l.maxRange - 1);
});

test('forest hexes can be shot at by igniting weapons only; the shot can only set forest on fire', () => {
  let s = game([mech('a1', 1, 'medium', 6, 8, { weapons: ['laser_l', 'ac5'] }), mech('b1', 2, 'medium', 13, 3, { facing: 3 })], { map: forestMap([[8, 8], [9, 8]]) });
  s = playWith(s, apply, 1, 'a1', ['laser', 'ballistic']);
  const hex = at(9, 8);
  assert.equal(apply(s, { type: 'FIRE', player: 1, mechId: 'a1', weaponId: 'w1', targetHex: hex, pipIds: ['d1'] }).ok, false);   // AC5 cannot
  let burnt = 0;
  for (let seed = 1; seed < 30; seed++) {
    const c = structuredClone(s); c.rngState = seed;
    const r = apply(c, { type: 'FIRE', player: 1, mechId: 'a1', weaponId: 'w0', targetHex: hex, pipIds: ['d0'] });
    assert.ok(r.ok, r.error);
    const k = r.events.find((e) => e.type === 'attack').rolls.energy.filter((h) => h >= 2).length;
    const fired = [8, 9].filter((col) => cellAt(r.state, col, 8).terrain === 'fire');
    assert.deepEqual(fired, [8, 9].slice(0, k));                  // nearest first, the target hex last
    assert.ok(r.state.activation.heat.weapons >= 3);              // the attacker heats up as usual
    burnt += fired.length;
  }
  assert.ok(burnt > 0);
});
