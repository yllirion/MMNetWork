import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../core/engine.js';
import { parseSlots } from '../core/data/slots.js';
import { CLASSES } from '../core/data/classes.js';
import { at, game, mech, playWith as pw } from './helpers.js';

// the turn order is not what these tests are about: give the turn to the acting mech
const playWith = (s0, ap, player, mechId, colors, o) => { const s = structuredClone(s0); s.turn = { rank: CLASSES[s.mechs[mechId].cls].rank, player }; return pw(s, ap, player, mechId, colors, o); };

const T = (col, row, type) => ({ col, row, type });
const world = (extra = {}, opts = {}) => game([
  mech('a1', 1, 'medium', 6, 8, { equipment: { minelayer: 1 }, weapons: ['laser_m'] }),
  mech('a2', 1, 'light', 6, 10),
  mech('b1', 2, 'medium', 10, 8, { facing: 3 }),
], { map: { terrain: [T(8, 12, 'fire')] }, ...opts });
const play = (s, mechId, colors, o) => playWith(s, apply, 1, mechId, colors, o);

test('slot: "Миноукладчик" is minelayer equipment', () => {
  assert.equal(parseSlots(['Миноукладчик', 'Большой лазер', 'JJ-II']).equipment.minelayer, 1);
  assert.deepEqual(parseSlots(['Миноукладчик']).unknown, []);
});

test('minelayer: laser + missile put an ACTIVATED mine on an adjacent free hex', () => {
  let s = play(world(), 'a1', ['laser', 'missile', 'move']);
  assert.equal(apply(s, { type: 'PLACE_MINE', player: 1, to: at(8, 8), pipIds: ['d0', 'd1'] }).ok, false);     // not adjacent
  assert.equal(apply(s, { type: 'PLACE_MINE', player: 1, to: at(7, 8), pipIds: ['d0', 'd2'] }).ok, false);     // wrong dice
  const r = apply(s, { type: 'PLACE_MINE', player: 1, to: at(7, 8), pipIds: ['d0', 'd1'] });
  assert.ok(r.ok, r.error);
  const mine = Object.values(r.state.mines)[0];
  assert.deepEqual([mine.owner, mine.activated], [1, true]);
  assert.equal(apply(r.state, { type: 'PLACE_MINE', player: 1, to: at(6, 7), pipIds: ['d2'] }).ok, false);      // one minelayer, one mine per activation
});

test('minelayer: not onto a mech, another mine or a fire hex', () => {
  const s0 = world({}, { mines: [{ owner: 1, pos: at(5, 8) }] });
  let s = play(s0, 'a1', ['laser', 'missile']);
  assert.equal(apply(s, { type: 'PLACE_MINE', player: 1, to: at(5, 8), pipIds: ['d0', 'd1'] }).ok, false);     // mine already there
  const f = game([mech('a1', 1, 'medium', 7, 12, { equipment: { minelayer: 1 } }), mech('b1', 2, 'medium', 12, 4, { facing: 3 })], { map: { terrain: [T(8, 12, 'fire')] } });
  s = play(f, 'a1', ['laser', 'missile']);
  assert.equal(apply(s, { type: 'PLACE_MINE', player: 1, to: at(8, 12), pipIds: ['d0', 'd1'] }).ok, false);    // fire
});

test('mines move only when NOT activated; any mech of the owner moves them with laser / ballistic / missile dice (speed 1)', () => {
  let s = world({}, { mines: [{ owner: 1, pos: at(5, 9) }] });
  const id = Object.keys(s.mines)[0];
  s = play(s, 'a2', ['ballistic', 'move', 'laser', 'laser']);
  assert.equal(apply(s, { type: 'MOVE_MINE', player: 1, mineId: id, to: at(5, 8), pipIds: ['d1'] }).ok, false);   // a move die does not count
  let r = apply(s, { type: 'MOVE_MINE', player: 1, mineId: id, to: at(5, 8), pipIds: ['d0'] });
  assert.ok(r.ok, r.error); assert.equal(r.state.mines[id].activated, true);
  r = apply(r.state, { type: 'MOVE_MINE', player: 1, mineId: id, to: at(4, 8), pipIds: ['d2'] });               // a 2nd die for a 2nd step: rating 1 → 2 dice = 1 action
  assert.equal(r.ok, false);
  const r2 = apply(apply(s, { type: 'MOVE_MINE', player: 1, mineId: id, to: at(5, 8), pipIds: ['d0'] }).state, { type: 'MOVE_MINE', player: 1, mineId: id, to: at(4, 8), pipIds: ['d2', 'd3'] });
  assert.ok(r2.ok, r2.error);                                                                                     // 3 dice in total = 2 actions
  const done = apply(r2.state, { type: 'END_ACTIVATION', player: 1 });
  assert.ok(done.ok, done.error);
  s = structuredClone(done.state); s.mines[id].activated = true;
  const again = play(s, 'a1', ['ballistic']);                                                                    // another mech, same round: the mine is activated
  assert.equal(apply(again, { type: 'MOVE_MINE', player: 1, mineId: id, to: at(3, 8), pipIds: ['d0'] }).ok, false);
});

test('round start makes every mine ready again', () => {
  let s = world({}, { mines: [{ owner: 1, pos: at(5, 9) }] });
  Object.values(s.mines)[0].activated = true;
  // finish the whole round: each mech shuts down at once
  for (let i = 0; i < 10 && s.round === 1; i++) {
    const pl = s.turn.player, m = Object.values(s.mechs).find((x) => x.owner === pl && !x.activated && x.status === 'active' && x.cls === (['light', 'medium', 'heavy', 'assault'][s.turn.rank - 1]));
    s = apply(s, { type: 'ACTIVATE', player: pl, mechId: m.id }).state;
    s.activation.phase = 'PLAY'; s.activation.pool = [];
    const r = apply(s, { type: 'END_ACTIVATION', player: pl });
    assert.ok(r.ok, r.error); s = r.state;
  }
  assert.equal(s.round, 2);
  assert.equal(Object.values(s.mines)[0].activated, false);
});

const stepOnto = (faces) => {
  const s0 = game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 10, 8, { facing: 3 })], { mines: [{ owner: 1, pos: at(9, 8) }] });
  let s = playWith(s0, apply, 2, 'b1', ['move', 'move', 'move']);
  s.activation.movePips = 3;
  const r = apply(s, { type: 'MOVE_STEP', player: 2, to: at(9, 8), turn: 0 });
  assert.ok(r.ok, r.error);
  return r;
};
test('a mech stepping onto an ENEMY mine detonates it: the mine rolls two dice and its OWNER chooses', () => {
  const r = stepOnto();
  assert.equal(r.state.pending.type, 'MINE_CHOICE'); assert.equal(r.state.pending.player, 1);                   // owner decides
  assert.equal(r.state.pending.faces.length, 2); assert.deepEqual(r.state.mines, {});                           // the mine is gone
  assert.ok(r.events.some((e) => e.type === 'mine_detonation'));
  assert.equal(apply(r.state, { type: 'RESOLVE_DECISION', player: 2, choice: '0' }).ok, false);                  // the victim cannot choose
});

test('mine faces: overheat / blind / anchor tokens', () => {
  for (const [face, field] of [[0, 'overheat'], [1, 'blind'], [2, 'anchor']]) {
    const r = stepOnto(); r.state.pending.faces = [face, 5];
    const o = apply(r.state, { type: 'RESOLVE_DECISION', player: 1, choice: '0' });
    assert.ok(o.ok, o.error); assert.equal(o.state.mechs.b1[field], 1, field);
  }
});

test('mine faces: 3 damage is blockable (armor roll + defender decision), 1 damage is unblockable', () => {
  let r = stepOnto(); r.state.pending.faces = [3, 4];
  let o = apply(r.state, { type: 'RESOLVE_DECISION', player: 1, choice: '0' });
  assert.ok(o.events.some((e) => e.type === 'armor' && e.damage === 3 && !e.unblockable));
  r = stepOnto(); r.state.pending.faces = [3, 4];
  o = apply(r.state, { type: 'RESOLVE_DECISION', player: 1, choice: '1' });
  const armor = o.events.find((e) => e.type === 'armor');
  assert.equal(armor.damage, 0); assert.equal(armor.unblockable, 1); assert.equal(armor.through, 1);
  assert.equal(o.state.pending.type, 'DEFENDER_DECISION');
});

test('mine face: 2 turns of 60° — the mine OWNER then turns the mech', () => {
  const r = stepOnto(); r.state.pending.faces = [5, 5];
  const o = apply(r.state, { type: 'RESOLVE_DECISION', player: 1, choice: '0' });
  assert.equal(o.state.pending.type, 'TURN_TARGET'); assert.equal(o.state.pending.player, 1); assert.equal(o.state.pending.turns, 2);
  const t = apply(o.state, { type: 'RESOLVE_DECISION', player: 1, choice: 'R:2' });
  assert.equal(t.state.mechs.b1.facing, (3 + 2) % 6);
});

test('passing through OWN mines is fine, stopping on one is not', () => {
  const s0 = game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 12, 8, { facing: 3 })], { mines: [{ owner: 1, pos: at(7, 8) }] });
  let s = playWith(s0, apply, 1, 'a1', ['move', 'move', 'move']); s.activation.movePips = 3;
  const r = apply(s, { type: 'MOVE_STEP', player: 1, to: at(7, 8), turn: 0 });
  assert.ok(r.ok, r.error); assert.equal(r.state.pending, null); assert.equal(Object.keys(r.state.mines).length, 1);   // no detonation
  const end = apply(r.state, { type: 'END_ACTIVATION', player: 1 });
  assert.equal(end.ok, false);
  const more = apply(r.state, { type: 'MOVE_STEP', player: 1, to: at(8, 8), turn: 0 });
  assert.ok(more.ok, more.error);
});

test('the owner moves a mine onto an enemy mech: it detonates at once', () => {
  const s0 = game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 8, 8, { facing: 3 })], { mines: [{ owner: 1, pos: at(7, 8) }] });
  const s = playWith(s0, apply, 1, 'a1', ['ballistic']);
  const r = apply(s, { type: 'MOVE_MINE', player: 1, mineId: Object.keys(s.mines)[0], to: at(8, 8), pipIds: ['d0'] });
  assert.ok(r.ok, r.error); assert.equal(r.state.pending.type, 'MINE_CHOICE'); assert.equal(r.state.pending.targetId, 'b1');
  assert.equal(apply(s, { type: 'MOVE_MINE', player: 1, mineId: Object.keys(s.mines)[0], to: at(8, 8), pipIds: ['d0'] }).state.mines && true, true);
});

test('a mine pushed into a fire hex burns up, nobody is hurt', () => {
  const s0 = game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 12, 4, { facing: 3 })], { mines: [{ owner: 1, pos: at(7, 8) }], map: { terrain: [T(8, 8, 'fire')] } });
  const s = playWith(s0, apply, 1, 'a1', ['ballistic']);
  const r = apply(s, { type: 'MOVE_MINE', player: 1, mineId: Object.keys(s.mines)[0], to: at(8, 8), pipIds: ['d0'] });
  assert.ok(r.ok, r.error); assert.deepEqual(r.state.mines, {}); assert.ok(r.events.some((e) => e.type === 'mine_removed' && e.why === 'fire'));
});

test('any damage destroys a mine (it can be shot); allied mines cannot be targeted', () => {
  const s0 = game([mech('a1', 1, 'medium', 6, 8, { weapons: ['laser_m'] }), mech('b1', 2, 'medium', 12, 4, { facing: 3 })], { mines: [{ owner: 2, pos: at(9, 8) }, { owner: 1, pos: at(8, 8) }] });
  const s = playWith(s0, apply, 1, 'a1', ['laser']);
  const [mine2, mine1] = [Object.values(s.mines).find((m) => m.owner === 2), Object.values(s.mines).find((m) => m.owner === 1)];
  assert.equal(apply(s, { type: 'FIRE', player: 1, targetMineId: mine1.id, weapons: [{ weaponId: 'w0', pipIds: ['d0'] }] }).ok, false);
  const r = apply(s, { type: 'FIRE', player: 1, targetMineId: mine2.id, weapons: [{ weaponId: 'w0', pipIds: ['d0'] }] });
  assert.ok(r.ok, r.error);
  let st = r.state; if (st.activation.attack) st = apply(st, { type: 'RESOLVE_ATTACK', player: 1 }).state;
  assert.equal(st.mines[mine2.id], undefined);
});

test('mine terrain: rock costs +1 action, so a step into rock needs 3 dice in total', () => {
  let s = world({}, { map: { terrain: [T(5, 8, 'rock'), T(8, 12, 'fire')] }, mines: [{ owner: 1, pos: at(5, 9) }] });
  const id = Object.keys(s.mines)[0];
  s = play(s, 'a2', ['laser', 'laser', 'laser', 'ballistic']);
  const mv = (st, to, ids) => apply(st, { type: 'MOVE_MINE', player: 1, mineId: id, to, pipIds: ids });
  assert.equal(mv(s, at(5, 8), ['d0']).ok, false);                  // 1 die = 1 action, rock needs 2
  assert.equal(mv(s, at(5, 8), ['d0', 'd1']).ok, false);            // 2 dice = still 1 action
  const r = mv(s, at(5, 8), ['d0', 'd1', 'd2']);                     // 3 dice = 2 actions
  assert.ok(r.ok, r.error); assert.deepEqual(r.state.mines[id].pos, at(5, 8));
});
