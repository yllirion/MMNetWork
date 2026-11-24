import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, createGame } from '../core/engine.js';
import { validateAttack } from '../core/attack.js';
import { WEAPONS } from '../core/data/weapons.js';
import { evadeOf } from '../core/state.js';
import { heatGenerated } from '../core/heat.js';
import { WEATHER } from '../core/weather.js';
import { game, mech, playWith } from './helpers.js';

const pair = (weather) => game([mech('a1', 1, 'medium', 6, 8), mech('b1', 2, 'medium', 10, 8, { facing: 3 })], { weather });

test('weather deck: 23 cards, one weather is drawn at the start; a new card every round; the discard is reshuffled', () => {
  const s = createGame({ seed: 3, mechs: [mech('a1', 1, 'light', 6, 8), mech('b1', 2, 'light', 10, 8)] });
  assert.equal(Object.values(WEATHER).reduce((a, w) => a + w.count, 0), 23);
  assert.equal(s.weather.deck.length + s.weather.discard.length + (s.weather.card ? 1 : 0), 23);
  assert.ok(WEATHER[s.weather.current] && s.weather.current !== 'same');
  // play 30 rounds of shutdowns: the deck never breaks, every weather is a real one
  let st = s; const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const m = Object.values(st.mechs).find((x) => x.owner === st.turn.player && !x.activated);
    let r = apply(st, { type: 'ACTIVATE', player: st.turn.player, mechId: m.id, then: 'shutdown' }); assert.ok(r.ok, r.error); st = r.state;
    if (st.activation) { r = apply(st, { type: 'END_ACTIVATION', player: st.turn.player }); if (r.ok) st = r.state; }
    seen.add(st.weather.current);
    assert.equal(st.weather.deck.length + st.weather.discard.length + (st.weather.card ? 1 : 0), 23);
  }
  assert.ok(st.round > 20); assert.ok(!seen.has('same')); assert.ok(seen.size >= 3);
});

test('heat storm +2 and fog −1 heat in every activation', () => {
  for (const [w, d] of [['heatstorm', 2], ['fog', -1], ['normal', 0]]) {
    const s = playWith(pair(w), apply, 1, 'a1', ['laser']);
    assert.equal(heatGenerated(s.activation), Math.max(0, d), w);
  }
});

test('thunderstorm: every mech has one more virtual evade', () => {
  assert.equal(evadeOf(pair('storm').mechs.b1).virtual, evadeOf(pair('normal').mechs.b1).virtual + 1);
});

test('fog and dust storm: every attack goes through fire (lasers −1 range); dust storm gives 2 blind tokens at the round start', () => {
  for (const w of ['fog', 'dust']) {
    const s = pair(w), L = validateAttack(s, s.mechs.a1, s.mechs.b1, WEAPONS.laser_l);
    assert.equal(L.los.fireHexes, 1, w);
    assert.equal(L.maxRange, (w === 'dust' ? WEAPONS.laser_l.maxRange - 4 : WEAPONS.laser_l.maxRange) - 1, w);
  }
  assert.equal(pair('dust').mechs.a1.blind, 2);
});
