// Pilots. Each player starts with as many pilots as mechs; a pilot's skill (1..4, random at the start) is added to the
// skill-card budget of an activation — but only if the piloting roll gave at least one evade.
// A pilot is chosen when a mech activates and sits in it until the next round starts (then every pilot returns to the hand).
// Destroyed mech → its pilot dies. Disabled by crits / pilot ejected → the pilot is "in reserve" (out of this battle).
// If the mech has no pilot at that moment (it has not activated this round), a random pilot from the owner's hand takes the fate.
export const PILOT_NAMES = ['Yarbin', 'Random', 'Dixon', 'Kadmir', 'Ragnar', 'Kali', 'Kato', 'Arran', 'Nitt', 'Ano', 'Legrand', 'Javier', 'Mall', 'Jacson', 'Nazar', 'Moren', 'Atlas', 'Himera'];

export function initPilots(s, rng, explicit = null) {
  s.pilots = {}; let n = 1;
  for (const p of s.players) {
    const list = explicit ? explicit.filter((x) => x.owner === p) : Object.values(s.mechs).filter((m) => m.owner === p).map(() => ({}));
    const names = [...PILOT_NAMES];
    for (const spec of list) {
      const id = spec.id ?? `p${n++}`;
      const name = spec.name ?? names.splice(rng.int(names.length), 1)[0];
      s.pilots[id] = { id, owner: p, name, skill: spec.skill ?? 1 + rng.int(4), status: 'hand', mechId: null };
    }
  }
}
export const pilotsInHand = (s, player) => Object.values(s.pilots ?? {}).filter((p) => p.owner === player && p.status === 'hand');
export const pilotOf = (s, m) => (m.pilotId && s.pilots?.[m.pilotId]) || null;

export function assignPilot(s, events, m, pilotId) {
  const hand = pilotsInHand(s, m.owner);
  if (!hand.length) return null;                                    // no pilots at all (old saves / tests without pilots)
  const p = pilotId ? hand.find((x) => x.id === pilotId) : hand[0];  // no choice given: the first one in the hand
  if (!p) throw new Error('pilot is not in the hand');
  p.status = 'mech'; p.mechId = m.id; m.pilotId = p.id;
  events.push({ type: 'pilot_assigned', mechId: m.id, pilotId: p.id, name: p.name, skill: p.skill });
  return p;
}

// round start: every pilot sitting in a mech goes back to the hand
export function returnPilots(s) {
  for (const p of Object.values(s.pilots ?? {})) if (p.status === 'mech') { const m = s.mechs[p.mechId]; if (m && m.pilotId === p.id) m.pilotId = null; p.status = 'hand'; p.mechId = null; }
}

// fate: 'dead' (mech destroyed) | 'reserve' (disabled by crits, ejected). Applied once per mech.
export function pilotFate(s, rng, events, m, fate) {
  if (!s.pilots || m.pilotFate) return;
  let p = pilotOf(s, m), random = false;
  if (!p || p.status !== 'mech') {
    const hand = pilotsInHand(s, m.owner); if (!hand.length) return;
    p = hand[rng.int(hand.length)]; random = true;
  }
  p.status = fate; p.mechId = m.id; m.pilotId = p.id; m.pilotFate = fate;
  events.push({ type: 'pilot_fate', mechId: m.id, pilotId: p.id, name: p.name, fate, random });
}
