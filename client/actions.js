// Action builders: the UI picks dice automatically, the engine validates.
import { planCorrection } from '../core/attack.js';
import { WEAPONS } from '../core/data/weapons.js';
import { MINE_PIPS } from '../core/mines.js';
import { actionsFor } from '../core/movement.js';
import { targetOf } from '../core/state.js';
import { CHEAP, COLORS, wtype } from './labels.js';
import { ok, st, ui } from './ui.js';
import { flash } from './session.js';

export const gain = (m, a, nm) => (nm ? actionsFor(m.speed, a.movePips + nm) - actionsFor(m.speed, a.movePips) : 0);   // movement actions that the button will give
export const convFits = (c, n) => n > 0 && n % c.n === 0;
// a conversion button is live only if the engine would accept it for at least one target color (so no move → move)
export const convUseful = (k, c) => convFits(c, ui.sel.size) && (c.to ?? COLORS).some((to) => ok({ type: 'CONVERT', kind: k, pipIds: [...ui.sel], to }));   // several groups can be converted in one go
export const minePipsPlace = () => {
  const a = st().activation, free = poolOf(a).filter((p) => !p.spent), ids = [];
  for (const c of ['laser', 'missile']) { const p = free.find((x) => x.color === c && !ids.includes(x.id)); if (!p) return null; ids.push(p.id); }
  return ids;
};
export function minePipsMove(mineId, cost = 1) {       // [] = the mine still has enough actions from the dice already given to it; null = not enough free dice
  const a = st().activation, m = st().mechs[a.mechId], rec = a.mineMoves[mineId] ?? { pips: 0, spent: 0 };
  const free = poolOf(a).filter((p) => !p.spent && MINE_PIPS.includes(p.color));
  const use = (c) => m.weapons.filter((w) => WEAPONS[w.type].pips.includes(c)).length;      // spare the colors the mech still shoots with
  free.sort((x, y) => (ui.sel.has(y.id) - ui.sel.has(x.id)) || use(x.color) - use(y.color));
  const need = [];
  for (let n = rec.pips; actionsFor('1', n) - rec.spent < cost; ) { n++; need.push(free[need.length]?.id); if (need.length > free.length) return null; }
  return need.every(Boolean) ? need : null;
}
export const byPref = (x, y) => (ui.sel.has(y.id) - ui.sel.has(x.id)) || (CHEAP.indexOf(x.color) - CHEAP.indexOf(y.color));

// ---- action builders: the UI picks dice automatically, the engine validates
// "Get ДД": converts every free move die that still adds movement actions (a die that would add nothing stays untouched)
// the dice a weapon / movement may use: when the player has selected some dice of the pilot roll, only those; otherwise the whole pool
export const poolOf = (a) => (ui.sel.size ? a.pool.filter((p) => ui.sel.has(p.id)) : a.pool);
export function moveCommit(m, a) {
  const free = poolOf(a).filter((p) => !p.spent && p.color === 'move').sort((x, y) => (x.evade ? 1 : 0) - (y.evade ? 1 : 0));
  const target = actionsFor(m.speed, a.movePips + free.length); let k = 0;
  while (k < free.length && actionsFor(m.speed, a.movePips + k) < target) k++;
  return { ids: free.slice(0, k).map((p) => p.id), gain: target - actionsFor(m.speed, a.movePips) };
}
export const firstMove = () => poolOf(st().activation ?? { pool: [] }).find((p) => !p.spent && p.color === 'move');
// can this weapon still be paid for, given the dice already earmarked by the other armed weapons (TC may stand in for one die)?
export function canPay(m, a, wid) {
  const w = WEAPONS[wtype(m, wid)];
  if (w.payWith || a.fired.includes(wid)) return true;
  if (!w.noMass && w.pips.length === 1 && Object.values(a.mass).some((x) => x.weapons.includes(wid))) return true;
  const used = new Set(); let tcFree = !!m.equipment.tc && !a.tcUsed;
  for (const id of [...ui.armed.filter((x) => x !== wid), wid]) {
    const ww = WEAPONS[wtype(m, id)]; if (ww.payWith) continue;
    if (!ww.noMass && ww.pips.length === 1 && poolOf(a).filter((p) => !p.spent && p.color === ww.pips[0]).length >= 2) continue;   // mass activation pays it (with a heat penalty)
    const ids = pickPips(ww, used); ids.forEach((i) => used.add(i));
    if (ids.length < ww.pips.length) {
      const spare = poolOf(a).filter((p) => !p.spent && !used.has(p.id)).length;
      if (id === wid && !(tcFree && spare >= ww.pips.length - ids.length)) return false;
      if (id !== wid && tcFree) tcFree = false;
    }
  }
  return true;
}
export function pickPips(w, used) {
  const a = st().activation, out = [], pool = [...poolOf(a)].sort((x, y) => ui.sel.has(y.id) - ui.sel.has(x.id));
  for (const c of w.pips) { const p = pool.find((p) => !p.spent && p.color === c && !out.includes(p.id) && !used.has(p.id)); if (p) out.push(p.id); }
  return out;
}
// one FIRE action for a whole volley: every armed weapon gets its own dice
export function fireAction(m, wids, tid) {
  const a = st().activation, used = new Set(), weapons = []; let tcFree = !!m.equipment.tc && !a.tcUsed;
  for (const wid of wids) {
    const w = WEAPONS[wtype(m, wid)];
    if (w.payWith) { weapons.push({ weaponId: wid, pipIds: [] }); continue; }             // melee: paid with movement actions
    if (!w.noMass && w.pips.length === 1 && Object.values(a.mass).some((x) => x.weapons.includes(wid))) { weapons.push({ weaponId: wid, pipIds: [] }); continue; } // paid by mass activation
    const ids = pickPips(w, used); ids.forEach((id) => used.add(id));
    if (ids.length < w.pips.length && tcFree) {                                          // TC: any die may pay for one attack action
      const rest = poolOf(a).filter((p) => !p.spent && !used.has(p.id)).sort(byPref).slice(0, w.pips.length - ids.length);
      rest.forEach((p) => { used.add(p.id); ids.push(p.id); }); tcFree = false;
      weapons.push({ weaponId: wid, pipIds: ids, useTC: true });
    } else weapons.push({ weaponId: wid, pipIds: ids });
  }
  if (String(tid).startsWith('mine:')) return { type: 'FIRE', targetMineId: tid.slice(5), weapons, ...(ui.sel.size ? { only: [...ui.sel] } : {}) };
  if (/^(bld|forest):/.test(String(tid))) { const [q, r] = tid.slice(tid.indexOf(':') + 1).split(',').map(Number); return { type: 'FIRE', targetHex: { q, r }, weapons, ...(ui.sel.size ? { only: [...ui.sel] } : {}) }; }
  return { type: 'FIRE', targetId: tid, weapons, ...(ui.sel.size ? { only: [...ui.sel] } : {}) };
}
// Fire correction costs the weapon's own dice again: one die, or a PAIR for Gauss / PPC (CC may stand in for one die).
export function corrAction(mode, extra = {}) {
  const s = st(), a = s.activation, m = s.mechs[a.mechId], A = a.attack, shot = extra.shot ?? 0;
  const plan = planCorrection(s, a, m, targetOf(s, A.targetId), WEAPONS[wtype(m, A.shots[shot].wid)], [...ui.sel]);
  if (plan && plan.cc && !ui.sel.has(plan.extra)) { flash('CC: выбери в пуле кубик пилотирования, который потратить на корректировку'); return null; }
  return plan ? { type: 'CORRECT', mode, shot, pipIds: plan.pipIds, ...(plan.cc ? { cc: plan.cc } : {}), ...extra } : null;
}
export function ramAction(m, tid) {
  const a = st().activation, n = 2 + ui.ramExtra;
  if (ui.ramMode === 'jump') return { type: 'RAM', targetId: tid, via: 'jump', extraActions: ui.ramExtra, pipIds: [...a.pool].sort((x, y) => ui.sel.has(y.id) - ui.sel.has(x.id)).filter((p) => !p.spent && p.color === 'jumpjet').slice(0, n).map((p) => p.id) };
  return { type: 'RAM', targetId: tid, extraActions: ui.ramExtra };
}
// jump dice for a jump of n jets (selected dice first); null when there are not enough
export const jumpPips = (n) => { const a = st().activation; if (!a) return null; const ids = [...a.pool].sort((x, y) => ui.sel.has(y.id) - ui.sel.has(x.id)).filter((p) => !p.spent && p.color === 'jumpjet').slice(0, n).map((p) => p.id); return ids.length === n ? ids : null; };
// how many jumps the mech can make in one go now: jets left and free jump dice
export const jumpBudget = () => { const s = st(), a = s.activation; if (!a) return 0; const m = s.mechs[a.mechId]; return Math.max(0, Math.min((m.equipment.jumpjets ?? 0) - a.jumpsUsed, a.pool.filter((p) => !p.spent && p.color === 'jumpjet').length)); };
export const jumpPip = () => { const a = st().activation; return a && [...a.pool].sort((x, y) => ui.sel.has(y.id) - ui.sel.has(x.id)).find((p) => !p.spent && p.color === 'jumpjet')?.id; };
