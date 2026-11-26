import { RULES } from './rules.js';
import { rankOf } from './state.js';
import { skillsRoundStart } from './skills.js';
import { returnPilots } from './pilots.js';
import { weatherRoundStart } from './weather.js';

export const activeMechs = (s) => Object.values(s.mechs).filter((m) => m.status === 'active');
export const pendingMechs = (s, player, rank) => activeMechs(s).filter((m) => m.owner === player && !m.activated && rankOf(m) === rank);

// Whoever has more mechs in the class goes first; a tie goes to RULES.tieBreakFirstPlayer.
export function firstPlayer(s, rank) {
  const count = Object.fromEntries(s.players.map((p) => [p, 0]));
  activeMechs(s).filter((m) => rankOf(m) === rank).forEach((m) => count[m.owner]++);
  const best = Math.max(...Object.values(count));
  const top = s.players.filter((p) => count[p] === best);
  return top.includes(RULES.tieBreakFirstPlayer) ? RULES.tieBreakFirstPlayer : top[0];
}

export function startRound(s) {
  activeMechs(s).forEach((m) => (m.activated = false));
  returnPilots(s);                                                        // pilots leave the mechs and go back to the hand
  Object.values(s.mines ?? {}).forEach((mn) => (mn.activated = false));   // every mine is ready to be moved again
  const rank = Math.min(...activeMechs(s).map(rankOf));
  s.turn = { rank, player: firstPlayer(s, rank) };
}

// Alternate within a class; when one side runs out the other finishes; then next class; then next round.
export function advanceTurn(s, events, rng) {
  const { rank, player } = s.turn;
  const order = s.players, i = order.indexOf(player);
  for (let k = 1; k <= order.length; k++) {
    const p = order[(i + k) % order.length];
    if (pendingMechs(s, p, rank).length) { s.turn.player = p; return; }
  }
  const left = activeMechs(s).filter((m) => !m.activated).map(rankOf);
  if (left.length) {
    const next = Math.min(...left);
    s.turn = { rank: next, player: firstPlayer(s, next) };
    events.push({ type: 'class_started', rank: next, player: s.turn.player });
  } else {
    s.round++;
    startRound(s);
    skillsRoundStart(s, rng, events);
    events.push({ type: 'round_started', round: s.round, rank: s.turn.rank, player: s.turn.player });
    weatherRoundStart(s, rng, events);    // a new weather card for the round (after the round header in the log)     // the topmost card of the track is discarded at the start of every round (from round 2), the track closes up and refills at once
  }
}
