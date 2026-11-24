import { RULES } from './rules.js';
import { TERRAIN } from './data/terrain.js';
import { rollDamageDice } from './damage.js';
import { getCell, heatCapacity } from './state.js';

// Heat generated so far in this activation (compared with the capacity at the end of it).
export const heatGenerated = (act) =>      // weather heat: heat storm +2, fog −1 (never below 0 in total)
  Math.max(0, Math.ceil(act.movePips / 2) + act.initialEvade + act.heat.weapons + act.heat.jumps + act.heat.equipment + (act.heat.weather ?? 0));

// End-of-activation heat control: cool first, then generated heat vs capacity, then overflow damage.
export function heatControl(s, rng, events, m, act) {
  const locked = m.crits.cooling; // tokens that cannot be removed while the cooling crit stands
  const cool = (m.coolers === 'double' ? 2 : 1) + (act.shutdown ? 1 : 0);
  const before = m.overheat;
  m.overheat = Math.max(locked, m.overheat - cool);
  const extra = TERRAIN[getCell(s.map, m.pos).terrain].extraCool ?? 0;
  m.overheat = Math.max(locked, m.overheat - extra);

  const cooled = before - m.overheat;                // tokens actually removed (coolers, shutdown, water)
  const generated = heatGenerated(act);
  const capacity = heatCapacity(m);
  const tokensAdded = Math.max(0, generated - capacity);
  m.overheat += tokensAdded;

  let overflow = 0;
  if (m.overheat > RULES.maxOverheat) { overflow = m.overheat - RULES.maxOverheat; m.overheat = RULES.maxOverheat; }
  events.push({ type: 'heat_control', mechId: m.id, generated, capacity, tokensAdded, before, cooled, overheat: m.overheat, overflow });
  if (overflow > 0) {
    rollDamageDice(s, rng, events, m, overflow); // unblockable: no armor roll, no eject window
  }
}

// EVERY overheat token outside the heat control goes through here (fire, flamer, OS, mine, forest): tokens above the maximum
// are dropped at once, one unblockable damage die each. A mech never holds more than RULES.maxOverheat tokens.
export function addOverheat(s, rng, events, m, n) {
  m.overheat += n;
  let overflow = 0;
  if (m.overheat > RULES.maxOverheat) { overflow = m.overheat - RULES.maxOverheat; m.overheat = RULES.maxOverheat; }
  if (overflow > 0) {
    rollDamageDice(s, rng, events, m, overflow);
  }
  return overflow;
}
