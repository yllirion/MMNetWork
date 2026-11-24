import { ENERGY_DIE } from './data/dice.js';
import { TERRAIN } from './data/terrain.js';
import { addOverheat } from './heat.js';
import { mechAt, getCell } from './state.js';

// Forest: +1 armor (like rocks: in the target's hex and on the line of fire) until it burns down into a fire hex.
// It ignites from: energy weapon dice showing 2 or 3 heat (one forest hex per such die, nearest to the attacker first),
// a flamer used on a target standing in it, a mine's overheat effect on a mech standing in it, a mech exploding in it.
export const isForest = (s, hex) => getCell(s.map, hex)?.terrain === 'forest';

export function igniteForest(s, rng, events, hex, why) {
  const cell = getCell(s.map, hex); if (!cell || cell.terrain !== 'forest') return false;
  cell.terrain = 'fire';
  events.push({ type: 'forest_burns', hex: { q: hex.q, r: hex.r }, why });
  for (const mn of Object.values(s.mines ?? {})) if (mn.pos.q === hex.q && mn.pos.r === hex.r) { delete s.mines[mn.id]; events.push({ type: 'mine_removed', mineId: mn.id, owner: mn.owner, why: 'fire' }); }
  const m = mechAt(s, hex);
  if (m && m.status === 'active') { events.push({ type: 'overheat_token', mechId: m.id, why: 'fire_appeared', n: 1 }); addOverheat(s, rng, events, m, 1); }   // fire appearing under a mech: +1 overheat
  return true;
}

// Energy dice of a volley that light the forest: faces with 2 or 3 heat.
export const igniterDice = (shots) => shots.reduce((a, sh) => a + (sh.rolls.energy ?? []).filter((i) => ENERGY_DIE[i] >= 2).length, 0);

// Forest hexes of the line of fire, from the attacker towards the target (the target's own hex last).
// Disputed line: the variant with more forest.
export function forestOnLine(s, variants, to) {
  let best = [];
  for (const v of variants) {
    const f = v.slice(1, -1).filter((h) => isForest(s, h));
    if (f.length > best.length) best = f;
  }
  return isForest(s, to) ? [...best, to] : best;
}
export { TERRAIN };
