import { DAMAGE_DIE, MISSILE_DIE } from './data/dice.js';
import { CLASSES } from './data/classes.js';
import { distance, key, neighbors } from './hex.js';
import { projection } from './los.js';
import { igniteForest } from './forest.js';
import { pilotFate } from './pilots.js';
import { RULES } from './rules.js';
import { getCell, mechAt, rankOf, systemsOn } from './state.js';

export function armorRoll(rng, mech, rear) {
  const faces = CLASSES[mech.cls].armor;
  const dice = rear ? 2 : mech.armorClass;
  const rolls = [], idx = [];
  for (let i = 0; i < dice; i++) {
    const k = rng.int(6), f = faces[k];
    idx.push(k);
    rolls.push(f.mark && mech.crits.armor >= f.mark ? 0 : f.v);
  }
  return { rolls, faces: idx, sum: rolls.reduce((a, b) => a + b, 0) };
}

// Armor step. Returns how many damage dice must be rolled, then opens the defender's decision window
// (eject BEFORE the damage dice) unless allowDecision is false.
export function resolveHit(s, rng, events, { sourceId, target, damage, unblockable = 0, rear, bonusArmor = 0, allowDecision = true }) {
  let absorbed = 0, rolls = [], faces = [];
  if (damage > 0) { const r = armorRoll(rng, target, rear); rolls = r.rolls; faces = r.faces; absorbed = r.sum + bonusArmor; }
  const through = Math.max(0, damage - absorbed) + unblockable;
  events.push({ type: 'armor', targetId: target.id, damage, unblockable, rear: !!rear, faces, rolls, bonusArmor, absorbed, through });
  beginDamage(s, rng, events, target, through, sourceId, allowDecision);
}

export function beginDamage(s, rng, events, target, n, sourceId, allowDecision = true) {
  if (n <= 0 || target.status !== 'active') return;
  if (allowDecision) {
    s.pending = { type: 'DEFENDER_DECISION', player: target.owner, targetId: target.id, dice: n, sourceId, options: ['take', 'eject'] };
    events.push({ type: 'decision_required', player: target.owner, kind: 'eject_or_take', dice: n });
  } else rollDamageDice(s, rng, events, target, n);
}

// Rolls damage dice. If the attacker has an unused TC, it may reroll one die ("crit table") before the result is applied.
export function rollDamageDice(s, rng, events, m, n, sourceId = null) {
  const faces = Array.from({ length: n }, () => rng.int(6));
  const act = s.activation, src = sourceId && s.mechs[sourceId];
  if (src && act && act.mechId === src.id && src.status === 'active' && src.equipment.tc && systemsOn(src) && !act.tcUsed) {
    s.pending = { type: 'TC_REROLL', player: src.owner, targetId: m.id, faces, sourceId, options: ['keep', ...faces.map((_, i) => `reroll:${i}`)] };
    events.push({ type: 'decision_required', player: src.owner, kind: 'tc_reroll', faces: faces.map((f) => DAMAGE_DIE[f]) });
    return;
  }
  applyDamageFaces(s, rng, events, m, faces);
}

// Plain damage is applied first (a mech whose HP runs out blows up); then EVERY critical hit is recorded, even after the mech
// is disabled or destroyed (3 crits of a system = disabled; counters cap at 3) — repairs will need the full damage picture.
export function applyDamageFaces(s, rng, events, m, faces) {
  const order = [...faces].sort((a, b) => (DAMAGE_DIE[b] === 'hit') - (DAMAGE_DIE[a] === 'hit'));   // hits first, stable for the rest
  for (const f of order) {
    const face = DAMAGE_DIE[f];
    if (face === 'hit') {
      if (m.status === 'destroyed') continue;
      m.damage++;
    } else {
      const sys = face.slice(5); // control | armor | cooling
      if (m.crits[sys] < 3) { m.crits[sys]++; if (sys === 'cooling') m.overheat = Math.min(RULES.maxOverheat, m.overheat + 1); }   // cooling crit: locked token, see heat.js
      if (RULES.critAddsDamage && m.status === 'active') m.damage++;
      if (m.crits[sys] >= 3 && m.status === 'active') { m.status = 'disabled'; events.push({ type: 'disabled', mechId: m.id }); pilotFate(s, rng, events, m, 'reserve'); }
    }
    events.push({ type: 'damage_die', mechId: m.id, face, idx: f });
    if (m.damage > CLASSES[m.cls].durability && m.status !== 'destroyed') destroyMech(s, rng, events, m, { detonate: true });
  }
  if (m.pilotEjected && m.status === 'active') { m.status = 'disabled'; events.push({ type: 'disabled', mechId: m.id, why: 'ejected' }); pilotFate(s, rng, events, m, 'reserve'); }   // survived the hit without the pilot: out of action
}

export function destroyMech(s, rng, events, m, { detonate = true } = {}) {
  m.status = 'destroyed';
  pilotFate(s, rng, events, m, 'dead');                // the pilot inside dies (a random one from the hand if the mech had none yet)
  const cell = getCell(s.map, m.pos);
  cell.cover = Math.min(4, cell.cover + rankOf(m)); // wreck tile
  events.push({ type: 'destroyed', mechId: m.id });
  if (!detonate) return;
  igniteForest(s, rng, events, m.pos, 'explosion');   // a mech blowing up in a forest sets it on fire
  // Detonation: rank-many missile dice (SRM-style) against every neighbour; each neighbour also gets blind tokens equal to the exploded mech's class rank.
  for (const n of neighbors(m.pos)) {
    const t = mechAt(s, n);
    if (!t || t.status !== 'active') continue;
    let dmg = 0; const faces = [];
    for (let i = 0; i < rankOf(m); i++) { const k = rng.int(6); faces.push(k); dmg += MISSILE_DIE[k].dmg; }
    t.blind = (t.blind ?? 0) + rankOf(m); events.push({ type: 'blind', mechId: t.id, n: t.blind, added: rankOf(m) });
    events.push({ type: 'detonation_hit', sourceId: m.id, targetId: t.id, damage: dmg, faces });
    resolveHit(s, rng, events, { sourceId: m.id, target: t, damage: dmg, rear: projection(t, m.pos) === 'rear', allowDecision: false });
  }
}
export { distance, key };
