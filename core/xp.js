import { rankOf } from './state.js';

// Experience stars (★). A player earns 1 ★ per kind and activation:
//  LAST_HIT  the active mech put an enemy mech out of action (disabled / destroyed)
//  MASSIVE   ONE attack dealt 3+ damage points, or 2+ identical critical hits to one target (counters restart with every attack / ram)
//  FLANKING  the active mech attacked a target's REAR projection while it stood in the target's FRONT projection at the start of the activation
//  TANK      (defender) an attack of damage >= class rank + 3 was fully absorbed by armor
//  SURVIVOR  (defender) the pilot ejected BEFORE the damage that destroyed / disabled the mech
export const XP_KINDS = { last_hit: 'LAST HIT', massive: 'MASSIVE DAMAGE', flanking: 'FLANKING', tank: 'TANK', survivor: 'SURVIVOR' };
export const RULES_XP = { tankBonus: 3, massiveDamage: 3, massiveCrits: 2 };

// Called by apply() after a handler: reads the events of this action. actorId = the mech whose activation the action belongs to (null: none).
export function awardXp(s, events, actorId) {
  if (!s.stars) return;
  const actor = actorId && s.mechs[actorId], act = s.activation;
  const bag = act ? (act.xp ??= { dealt: 0, crits: {}, given: [] }) : { dealt: 0, crits: {}, given: [] };
  const out = [];
  const give = (player, kind, mechId, once = true) => {
    const key = `${kind}:${mechId}`;
    if (once && bag.given.includes(key)) return;
    bag.given.push(key); s.stars[player] = (s.stars[player] ?? 0) + 1;
    out.push({ type: 'star', player, kind, mechId, total: s.stars[player] });
  };
  for (const e of events) {
    if (e.type === 'disabled' || e.type === 'destroyed') {
      const m = s.mechs[e.mechId];
      if (m?.pilotEjected && !bag.given.includes(`survivor:${m.id}`)) give(m.owner, 'survivor', m.id);
      if (actor && m && m.owner !== actor.owner) give(actor.owner, 'last_hit', actor.id);
    } else if (e.type === 'damage_die' && actor) {
      const m = s.mechs[e.mechId]; if (!m || m.owner === actor.owner) continue;
      if (e.face === 'hit') bag.dealt++;
      else { const k = `${m.id}:${e.face}`; bag.crits[k] = (bag.crits[k] ?? 0) + 1; }
      if (bag.dealt >= RULES_XP.massiveDamage || Object.values(bag.crits).some((n) => n >= RULES_XP.massiveCrits)) give(actor.owner, 'massive', actor.id);
    } else if (e.type === 'armor' && actor) {
      const t = s.mechs[e.targetId];
      if (t && t.owner !== actor.owner && e.damage > 0 && e.through === 0 && e.damage >= rankOf(t) + RULES_XP.tankBonus) give(t.owner, 'tank', t.id);
    } else if ((e.type === 'attack_done' || e.type === 'ram') && actor) {
      bag.dealt = 0; bag.crits = {};                                  // a new attack: the damage counters of the previous one are forgotten
      if (e.flank) give(actor.owner, 'flanking', actor.id);
    }
  }
  events.push(...out);
}
