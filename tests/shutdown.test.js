import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../core/engine.js';
import { evadeOf } from '../core/state.js';
import { amsSources } from '../core/ams.js';
import { at, game, mech } from './helpers.js';

const world = () => game([
  mech('a1', 1, 'light', 6, 8, { equipment: { ecm: true, ams: 1, cc: true, tc: true, os: true } }),
  mech('b1', 2, 'light', 10, 8, { facing: 3 }),
  mech('b2', 2, 'medium', 11, 9, { facing: 3 }),
]);

test('emergency shutdown: equipment off and no light class virtual evade until the next activation', () => {
  let s = world();
  const before = evadeOf(s.mechs.a1).virtual;                     // innate light +1, ECM +1
  assert.equal(before, 2);
  s.turn = { rank: 1, player: 1 };
  let r = apply(s, { type: 'ACTIVATE', player: 1, mechId: 'a1' }); assert.ok(r.ok, r.error);
  r = apply(r.state, { type: 'EMERGENCY_SHUTDOWN', player: 1 }); assert.ok(r.ok, r.error);
  const a1 = r.state.mechs.a1;
  assert.equal(a1.shutdown, true);
  assert.equal(evadeOf(a1).virtual, 0);
  assert.deepEqual(amsSources(r.state, r.state.mechs.b2, a1, 'srm'), []);          // its AMS is dead
  // next activation: systems come back
  const s2 = structuredClone(r.state); s2.mechs.a1.activated = false; s2.turn = { rank: 1, player: 1 }; s2.activation = null;
  const r2 = apply(s2, { type: 'ACTIVATE', player: 1, mechId: 'a1' }); assert.ok(r2.ok, r2.error);
  assert.equal(r2.state.mechs.a1.shutdown, false);
  assert.equal(evadeOf(r2.state.mechs.a1).virtual, 2);
  assert.equal(amsSources(r2.state, r2.state.mechs.b2, r2.state.mechs.a1, 'srm').length, 1);
});
