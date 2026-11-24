import { TERRAIN } from './data/terrain.js';
import { fail } from './errors.js';
import { distance, key, neighbors } from './hex.js';
import { addOverheat } from './heat.js';
import { igniteForest } from './forest.js';
import { resolveHit } from './damage.js';
import { getCell, mechAt } from './state.js';

// MINES. A mine is a speed-1, light-class object that belongs to a player. Any damage destroys it. State: `activated` = it was placed / moved
// this round and cannot be moved again (ASSUMPTION: the design text says both "round start → activated" and "only NOT activated mines move";
// the consistent reading is used: round start resets every mine to NOT activated = ready to be moved).
// A mine detonates when an ENEMY mech is in its hex: either the owner moved the mine there, or the mech stepped / jumped onto it.
// The mine rolls 2 dice, the MINE OWNER picks which one applies:
export const MINE_FACES = ['overheat', 'blind', 'anchor', 'damage3', 'unblock1', 'turn2'];
export const MINE_SPEED = '1';
export const MINE_PIPS = ['laser', 'ballistic', 'missile'];        // pilot dice that give a mine movement actions

export const mineAt = (s, pos) => Object.values(s.mines ?? {}).find((m) => key(m.pos) === key(pos));
export const mineTargetId = (id) => `mine:${id}`;

// Where a mine may be put / moved (adjacent hex handled by the caller). null = ok, otherwise the reason. Enemy ACTIVE mech there = detonation.
export function mineCannotEnter(s, mine, hex) {
  const cell = getCell(s.map, hex);
  if (!cell) return 'off the map';
  if (TERRAIN[cell.terrain].blocksMove) return 'impassable terrain';
  if (TERRAIN[cell.terrain].forbidClass?.includes('light')) return 'light objects cannot enter this terrain';   // a mine is light class
  if (cell.cover - 1 >= 2) return 'cover is two classes higher';
  const other = mineAt(s, hex); if (other && other.id !== mine.id) return 'another mine is there';
  const occ = mechAt(s, hex);
  if (occ && (occ.owner === mine.owner || occ.status !== 'active')) return 'hex is occupied';
  return null;
}
// Movement actions one mine step costs: 1 + terrain surcharge (rock, mud, deep water) + 1 for cover one class above the mine (light = rank 1).
export function mineStepCost(s, hex) {
  const cell = getCell(s.map, hex);
  return 1 + (TERRAIN[cell.terrain].moveExtra ?? 0) + (cell.cover - 1 === 1 ? 1 : 0);
}
export const mineNeighbors = (s, mine) => neighbors(mine.pos).filter((h) => !mineCannotEnter(s, mine, h));

export function newMine(s, owner, pos) {
  s.mines ??= {}; s.nextMine ??= 1;
  const mine = { id: `m${s.nextMine++}`, owner, pos: { q: pos.q, r: pos.r }, activated: true };
  s.mines[mine.id] = mine;
  return mine;
}
export function removeMine(s, events, mine, why) {
  delete s.mines[mine.id];
  events.push({ type: 'mine_removed', mineId: mine.id, owner: mine.owner, pos: mine.pos, why });
}
// Fire hex: the mine burns up (no effect on anyone).
export const mineBurns = (s, mine) => !!TERRAIN[getCell(s.map, mine.pos).terrain].fire;

// A mine and an enemy active mech share a hex → roll 2 dice and let the owner choose.
export function detonateMine(s, rng, events, mine, target) {
  const faces = [rng.int(6), rng.int(6)];
  delete s.mines[mine.id];
  s.pending = { type: 'MINE_CHOICE', player: mine.owner, targetId: target.id, mineId: mine.id, faces, options: ['0', '1'] };
  events.push({ type: 'mine_detonation', mineId: mine.id, owner: mine.owner, targetId: target.id, faces: faces.map((f) => MINE_FACES[f]) });
  events.push({ type: 'decision_required', player: mine.owner, kind: 'mine_choice' });
}
// After a mech arrives in a hex by its own movement (step / jump).
export function stepOnMine(s, rng, events, m) {
  const mine = mineAt(s, m.pos);
  if (!mine || mine.owner === m.owner || m.status !== 'active') return;
  detonateMine(s, rng, events, mine, m);
}

// The owner chose a die: apply it to the mech.
export function applyMineFace(s, rng, events, p, t, choice) {
  const face = MINE_FACES[p.faces[+choice]];
  events.push({ type: 'mine_effect', mineId: p.mineId, targetId: t.id, face });
  if (t.status !== 'active') return;
  switch (face) {
    case 'overheat': events.push({ type: 'overheat_token', mechId: t.id, why: 'mine', n: 1 }); addOverheat(s, rng, events, t, 1); igniteForest(s, rng, events, t.pos, 'mine'); break;
    case 'blind': t.blind = (t.blind ?? 0) + 1; events.push({ type: 'blind', mechId: t.id, n: t.blind, added: 1, why: 'mine' }); break;
    case 'anchor': t.anchor++; events.push({ type: 'anchor_token', mechId: t.id, n: t.anchor, why: 'mine' }); break;
    case 'damage3': resolveHit(s, rng, events, { sourceId: null, target: t, damage: 3, rear: false }); break;       // blockable: armor roll, the defender may eject
    case 'unblock1': resolveHit(s, rng, events, { sourceId: null, target: t, damage: 0, unblockable: 1, rear: false }); break;
    case 'turn2': s.turnQueue = { player: p.player, targetId: t.id, sourceId: null, turns: 2 }; break;               // the mine owner turns the mech by up to 2 × 60°
  }
}
export { distance };
