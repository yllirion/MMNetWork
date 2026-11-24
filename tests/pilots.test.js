import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, createGame } from '../core/engine.js';
import { destroyMech, applyDamageFaces } from '../core/damage.js';
import { makeRng } from '../core/rng.js';
import { at, game, mech } from './helpers.js';

const two = (pilots) => game([mech('a1', 1, 'medium', 6, 8), mech('a2', 1, 'medium', 6, 10), mech('b1', 2, 'medium', 12, 8, { facing: 3 }), mech('b2', 2, 'medium', 12, 10, { facing: 3 })], pilots ? { pilots } : {});
const P = [{ id: 'x1', owner: 1, name: 'A', skill: 2 }, { id: 'x2', owner: 1, name: 'B', skill: 4 }, { id: 'y1', owner: 2, name: 'C', skill: 1 }, { id: 'y2', owner: 2, name: 'D', skill: 3 }];

test('pilots: one per mech, skill 1..4, all in the hand at the start', () => {
  const s = two();
  const ps = Object.values(s.pilots);
  assert.equal(ps.length, 4);
  assert.equal(ps.filter((p) => p.owner === 1).length, 2);
  assert.ok(ps.every((p) => p.skill >= 1 && p.skill <= 4 && p.status === 'hand' && p.name));
});

test('pilots: chosen on ACTIVATE, only from the own hand; they return at the start of the next round', () => {
  let s = two(P);
  assert.equal(apply(s, { type: 'ACTIVATE', player: 1, mechId: 'a1', pilotId: 'y1' }).ok, false);      // enemy pilot
  let r = apply(s, { type: 'ACTIVATE', player: 1, mechId: 'a1', pilotId: 'x2' }); assert.ok(r.ok, r.error);
  assert.equal(r.state.pilots.x2.status, 'mech'); assert.equal(r.state.mechs.a1.pilotId, 'x2'); assert.equal(r.state.activation.pilotSkill, 4);
  // play the whole round with shutdowns, then check the hand
  s = r.state;
  const order = [['a1', 1], ['b1', 2], ['a2', 1], ['b2', 2]];
  for (const [id, pl] of order) {
    if (!s.activation) { const x = apply(s, { type: 'ACTIVATE', player: pl, mechId: id }); assert.ok(x.ok, x.error); s = x.state; }
    const x = apply(s, { type: 'EMERGENCY_SHUTDOWN', player: pl }); assert.ok(x.ok, x.error); s = x.state;
  }
  assert.equal(s.round, 2);
  assert.ok(Object.values(s.pilots).every((p) => p.status === 'hand'));
  assert.ok(Object.values(s.mechs).every((m) => !m.pilotId));
});

test('pilots: the skill adds to the card budget only when the roll gave an evade', () => {
  let s = two(P);
  s = apply(s, { type: 'ACTIVATE', player: 1, mechId: 'a1', pilotId: 'x1' }).state;           // skill 2
  s.activation.phase = 'PLAY'; s.activation.pool = [{ id: 'd0', die: 0, color: 'laser', evade: true, spent: false, origin: 'roll' }];
  s.activation.initialEvade = 2;
  assert.ok(apply(s, { type: 'BUY_SKILL', player: 1, pos: 2 }).ok);                         // costs 4 = 2 evade + skill 2
  assert.equal(apply(s, { type: 'BUY_SKILL', player: 1, pos: 3 }).ok, false);                // costs 5
  s.activation.initialEvade = 0;
  assert.equal(apply(s, { type: 'BUY_SKILL', player: 1, pos: 0 }).ok, false);                // no evade: the skill alone buys nothing
});

test('pilots: dies with a destroyed mech; a mech without a pilot takes a random one from the hand; disabled → reserve', () => {
  let s = two(P);
  s = apply(s, { type: 'ACTIVATE', player: 1, mechId: 'a1', pilotId: 'x1' }).state;
  const ev = [];
  destroyMech(s, makeRng(3), ev, s.mechs.a1, { detonate: false });
  assert.equal(s.pilots.x1.status, 'dead');
  destroyMech(s, makeRng(3), ev, s.mechs.b1, { detonate: false });                           // b1 has not activated: random pilot of player 2
  const dead2 = Object.values(s.pilots).filter((p) => p.owner === 2 && p.status === 'dead');
  assert.equal(dead2.length, 1); assert.equal(s.mechs.b1.pilotId, dead2[0].id);
  assert.ok(ev.some((e) => e.type === 'pilot_fate' && e.random));
  // disabled by crits: reserve
  const b2 = s.mechs.b2; b2.crits.control = 2;
  applyDamageFaces(s, makeRng(1), ev, b2, [2]);                                              // third control crit
  assert.equal(b2.status, 'disabled'); assert.equal(s.pilots[b2.pilotId].status, 'reserve');
  assert.equal(Object.values(s.pilots).filter((p) => p.owner === 2 && p.status === 'hand').length, 0);
});

test('ACTIVATE with then: roll right away, or emergency shutdown right away; atomic when the roll is impossible', () => {
  let s = two(P);
  let r = apply(s, { type: 'ACTIVATE', player: 1, mechId: 'a1', pilotId: 'x1', then: 'roll' });
  assert.ok(r.ok, r.error); assert.notEqual(r.state.activation.phase, 'ROLL'); assert.ok(r.state.activation.pool.length > 0);
  r = apply(s, { type: 'ACTIVATE', player: 1, mechId: 'a1', pilotId: 'x1', then: 'shutdown' });
  assert.ok(r.ok, r.error); assert.equal(r.state.mechs.a1.shutdown, true);
  const hot = structuredClone(s); hot.mechs.a1.overheat = 6;
  const bad = apply(hot, { type: 'ACTIVATE', player: 1, mechId: 'a1', pilotId: 'x1', then: 'roll' });
  assert.equal(bad.ok, false); assert.equal(hot.activation ?? null, null);     // nothing happened
  assert.ok(apply(hot, { type: 'ACTIVATE', player: 1, mechId: 'a1', pilotId: 'x1', then: 'shutdown' }).ok);
});
