import test from 'node:test';
import assert from 'node:assert/strict';
import { awardXp } from '../core/xp.js';
import { initSkills, skillsRefill, skillsRoundStart, SKILLS } from '../core/skills.js';
import { destroyMech } from '../core/damage.js';
import { makeRng } from '../core/rng.js';
import { projection } from '../core/los.js';
import { apply } from '../core/engine.js';
import { at, game, mech, playWith } from './helpers.js';

const base = () => game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 9, 8, { facing: 3 })]);
const stars = (s, evs) => { const out = [...evs]; awardXp(s, out, 'a1'); return out.filter((e) => e.type === 'star'); };

test('skills: 23 unique cards, 10 on the track, 13 in the deck', () => {
  const s = base();
  assert.equal(s.skills.track.length, 10);
  assert.equal(s.skills.deck.length, SKILLS.total - 10);
  assert.deepEqual([...s.skills.track, ...s.skills.deck].sort((a, b) => a - b), Array.from({ length: 23 }, (_, i) => i + 1));
  assert.equal(SKILLS.costs[0], 2); assert.equal(SKILLS.costs[9], null);   // the 10th card is "X"
});

test('skills: round start discards the topmost card, shifts the track up and deals into the free bottom cell', () => {
  const s = base(), top = s.skills.track[0], second = s.skills.track[1], next = s.skills.deck.at(-1), ev = [];
  skillsRoundStart(s, makeRng(1), ev);                 // discard + shift + deal in one go
  assert.deepEqual(s.skills.discard, [top]);
  assert.equal(s.skills.track[0], second);          // shifted up
  assert.equal(s.skills.track[9], next);            // dealt at the bottom
  assert.equal(s.skills.track.filter((c) => c == null).length, 0);
  assert.equal(s.skills.deck.length, 12);
});

test('skills: an empty deck is rebuilt from the discard pile', () => {
  const s = base(); s.skills.discard = s.skills.deck.splice(0); s.skills.track[0] = null; s.skills.track[1] = null;
  const ev = []; skillsRefill(s, makeRng(3), ev);
  assert.ok(ev.some((e) => e.type === 'skills_reshuffled'));
  assert.equal(s.skills.track.filter((c) => c != null).length, 10);
});

test('★ LAST HIT: once per activation, only for an enemy put out of action', () => {
  const s = base();
  assert.equal(stars(s, [{ type: 'destroyed', mechId: 'b1' }, { type: 'disabled', mechId: 'b1' }]).filter((e) => e.kind === 'last_hit').length, 1);
  assert.equal(s.stars[1], 1);
  assert.equal(stars(base(), [{ type: 'disabled', mechId: 'a1' }]).length, 0);     // own mech does not count
});

test('★ MASSIVE DAMAGE: 3 damage points, or 2 identical crits on one target', () => {
  let s = base();
  const hit = { type: 'damage_die', mechId: 'b1', face: 'hit' };
  assert.equal(stars(s, [hit, hit]).length, 0);
  assert.equal(stars(s, [hit, hit, hit]).map((e) => e.kind)[0], 'massive');
  s = base();
  const c = { type: 'damage_die', mechId: 'b1', face: 'crit_armor' };
  assert.equal(stars(s, [c]).length, 0);
  assert.equal(stars(s, [c, c])[0].kind, 'massive');
  s = base();
  assert.equal(stars(s, [{ ...c, face: 'crit_armor' }, { ...c, face: 'crit_control' }]).length, 0);   // different crits do not add up
});

test('★ TANK: attack damage >= class rank + 3 fully absorbed (medium: rank 2 → 5)', () => {
  const armor = (damage, through) => [{ type: 'armor', targetId: 'b1', damage, through }];
  assert.equal(stars(base(), armor(5, 0))[0].player, 2);
  assert.equal(stars(base(), armor(4, 0)).length, 0);       // too weak
  assert.equal(stars(base(), armor(5, 1)).length, 0);       // something got through
});

test('★ SURVIVOR: the pilot ejected before the damage that disabled the mech', () => {
  const s = base(); s.mechs.b1.pilotEjected = true;
  const r = stars(s, [{ type: 'disabled', mechId: 'b1', why: 'ejected' }]);
  assert.deepEqual(r.map((e) => [e.kind, e.player]).sort(), [['last_hit', 1], ['survivor', 2]]);
});

test('★ FLANKING: rear shot from a mech that started in the target front projection', () => {
  const s = base();
  assert.equal(stars(s, [{ type: 'attack_done', attackerId: 'a1', targetId: 'b1', flank: true }])[0].kind, 'flanking');
  assert.equal(stars(base(), [{ type: 'attack_done', attackerId: 'a1', targetId: 'b1', flank: false }]).length, 0);
  assert.equal(projection(s.mechs.b1, at(6, 8)), 'front');
});

test('blind from an explosion: tokens = class rank of the exploded mech', () => {
  const s = game([mech('h1', 1, 'heavy', 8, 8), mech('b1', 2, 'light', 9, 8), mech('b2', 2, 'light', 7, 8)]);
  const ev = []; destroyMech(s, makeRng(2), ev, s.mechs.h1);
  assert.equal(s.mechs.b1.blind, 3);
  assert.ok(ev.some((e) => e.type === 'blind' && e.added === 3));
});

test('★ MASSIVE DAMAGE counts ONE attack: 2 + 2 points in two attacks give nothing', () => {
  const s = base(), hit = { type: 'damage_die', mechId: 'b1', face: 'hit' }, next = { type: 'attack_done', attackerId: 'a1', targetId: 'b1', flank: false };
  assert.equal(stars(s, [hit, hit, next, hit, hit]).length, 0);
  assert.equal(stars(base(), [next, hit, hit, hit]).filter((e) => e.kind === 'massive').length, 1);
});

test('skills: buying costs evade symbols of THIS activation, the card goes to the hand and the track closes up at the end', () => {
  let s = playWith(game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 12, 8, { facing: 3 })]), apply, 1, 'a1', ['laser', 'move', 'move', 'laser'], { evade: [0, 1, 2] });
  s.activation.initialEvade = 3; s.activation.pilotSkill = 0; s.mechs.a1.evade = 2;          // pilot skill 0 here: pilots are tested separately
  const card = s.skills.track[1];
  let r = apply(s, { type: 'BUY_SKILL', player: 1, pos: 9 }); assert.equal(r.ok, false);          // X: cannot be bought
  r = apply(s, { type: 'BUY_SKILL', player: 1, pos: 2 }); assert.equal(r.ok, false);             // costs 4 > 3 evade
  r = apply(s, { type: 'BUY_SKILL', player: 1, pos: 1 }); assert.ok(r.ok, r.error);              // costs 3
  assert.equal(r.state.skills.track[1], null); assert.deepEqual(r.state.hands[1], [card]);
  assert.equal(r.state.activation.evadeSpent, 3); assert.equal(r.state.mechs.a1.evade, 2);       // assigned evade stays on the mech token
  assert.equal(apply(r.state, { type: 'BUY_SKILL', player: 1, pos: 0 }).ok, false);              // nothing left
  const e = apply(r.state, { type: 'END_ACTIVATION', player: 1 });
  assert.ok(e.ok, e.error); assert.equal(e.state.skills.track.filter((c) => c == null).length, 0);
});

test('skills: bought cards last one activation and then go to the discard pile', () => {
  let s = playWith(game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 12, 8, { facing: 3 })]), apply, 1, 'a1', ['laser'], { evade: [0] });
  s.activation.initialEvade = 2;
  const card = s.skills.track[0];
  s = apply(s, { type: 'BUY_SKILL', player: 1, pos: 0 }).state;
  assert.deepEqual(s.hands[1], [card]);
  const e = apply(s, { type: 'END_ACTIVATION', player: 1 });
  assert.deepEqual(e.state.hands[1], []); assert.ok(e.state.skills.discard.includes(card));
  assert.ok(e.events.some((x) => x.type === 'skills_expired'));
});

test('skill cards EXTRA B/L/M/R give a converted pilot die of their colour, EXTRA E a virtual evade', () => {
  const base = () => { const s = playWith(game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 12, 8, { facing: 3 })]), apply, 1, 'a1', ['laser', 'move'], { evade: [0] }); s.activation.initialEvade = 2; s.activation.pilotSkill = 0; return s; };
  for (const [card, color] of [[1, 'ballistic'], [2, 'laser'], [3, 'move'], [4, 'missile']]) {
    const s = base(); s.skills.track[0] = card;
    const r = apply(s, { type: 'BUY_SKILL', player: 1, pos: 0 }); assert.ok(r.ok, r.error);
    const pip = r.state.activation.pool.find((p) => p.from);
    assert.equal(pip.color, color); assert.equal(pip.origin, 'converted'); assert.equal(pip.spent, false);
    assert.equal(apply(r.state, { type: 'CONVERT', player: 1, kind: 'toMove', pipIds: [pip.id], to: 'move' }).ok, false);   // cannot be converted
  }
  const s = base(); s.skills.track[0] = 5; const v = s.mechs.a1.virtualEvade;
  const r = apply(s, { type: 'BUY_SKILL', player: 1, pos: 0 }); assert.ok(r.ok, r.error);
  assert.equal(r.state.mechs.a1.virtualEvade, v + 1);
});
