// What the player can do right now: movement preview, legal targets, GA radius, who can be activated.
import { key, neighbors, mod6, distance } from '../core/hex.js';
import { mineAt, mineStepCost } from '../core/mines.js';
import { planStep, actionsAvailable } from '../core/movement.js';
import { RULES } from '../core/rules.js';
import { buildingId, hexTargetId, mechAt, getCell, rankOf } from '../core/state.js';
import { pickFacing, centerR, signedTurn } from './moveinput.js';
import { S } from './dom.js';
import { dirName, turnWord } from './labels.js';
import { myInput, ok, pix, st, ui } from './ui.js';
import { fireAction, jumpBudget, jumpPip, jumpPips, minePipsMove, minePipsPlace, ramAction } from './actions.js';
import { send } from './session.js';
import { refresh } from './refresh.js';
import { cellAtPt } from './input.js';

// ---- movement preview: what a click at the cursor would do (step / turn in place / jump / switch jump mode)
export const jumpActive = () => ui.jumpMode || ui.rmb;
export function movePreview() {
  const s = st(), a = s.activation; if (!ui.ptr || !a || a.phase !== 'PLAY' || s.pending || a.attack || s.winner !== null || !myInput()) return null;
  if (ui.gaMode) return null;                                        // GA mode: the cursor picks a radius, not a step
  const m = s.mechs[a.mechId], c = cellAtPt(ui.ptr.x, ui.ptr.y); if (!c) return null;
  const cfg = { mode: ui.inputMode, dead: ui.dead, S }, f = m.facing, hasJJ = (m.equipment.jumpjets ?? 0) > 0;
  if ((ui.armed.length || ui.ramMode) && (s.map.cells[key(c)]?.terrain === 'building' || Object.values(s.mechs).some((x) => x.id !== m.id && x.status !== 'destroyed' && key(x.pos) === key(c)))) return null;   // aiming at an occupied hex: it is a target, not a step
  const own = key(c) === key(m.pos), near = own || neighbors(m.pos).some((n) => key(n) === key(c));
  const P = pix(c);
  if (jumpActive()) {
    // a jump of n jets lands up to n hexes away and may turn up to 60° per jet: the facing is picked in the landing hex
    const k = jumpBudget(), d = distance(m.pos, c);
    if (!ui.legal.jumps.has(key(c))) return d > k && k > 0 ? null : { type: 'jump', h: c, bad: true, reason: !jumpPip() ? 'нет куба ⇧ в запасе' : 'сюда прыгнуть нельзя' };
    const all = [0, 1, -1, 2, -2, 3].filter((t) => Math.max(1, d, Math.abs(t)) <= k).map((t) => mod6(f + t));
    const g = pickFacing(cfg, P, ui.ptr.x, ui.ptr.y, all, f);
    return { type: 'jump', h: c, base: f, all, g, dist: d, jumps: g === null || g === undefined ? Math.max(1, d) : Math.max(1, d, Math.abs(signedTurn(f, g))), cost: 0 };
  }
  if (!near) return null;
  if (own) {
    if (hasJJ && Math.hypot(ui.ptr.x - P.x, ui.ptr.y - P.y) <= centerR(ui.inputMode, ui.dead, S)) return { type: 'arm', h: c };
    const all = [mod6(f - 1), mod6(f + 1)], cost = 1 + (m.anchor > 0 ? 1 : 0);
    if (!ok({ type: 'TURN', turn: 1 }) && !ok({ type: 'TURN', turn: -1 })) return { type: 'rot', h: c, bad: true, reason: 'не хватает ДД на поворот' };
    return { type: 'rot', h: c, base: f, all, g: pickFacing(cfg, P, ui.ptr.x, ui.ptr.y, all, f), cost };
  }
  let plan; try { plan = planStep(s, m, c); } catch (_) { return { type: 'step', h: c, bad: true, reason: 'сюда нельзя' }; }
  if (!ui.legal.moves.has(key(c))) return { type: 'step', h: c, bad: true, reason: plan.cost > actionsAvailable(m, a) ? `не хватает ДД (нужно ${plan.cost})` : 'сюда нельзя' };
  const all = plan.back ? [plan.newFacing] : [mod6(plan.newFacing - 1), plan.newFacing, mod6(plan.newFacing + 1)];
  return { type: 'step', h: c, base: plan.newFacing, all, g: pickFacing(cfg, P, ui.ptr.x, ui.ptr.y, all, plan.newFacing), cost: plan.cost, back: plan.back, dir: dirName(m, c) };
}
export function badge(p) {
  if (p.bad) return [p.reason, '#ff6b6b'];
  if (p.type === 'arm') return [ui.jumpMode ? 'выключить режим прыжка' : 'режим прыжка (клик) — или зажми ПКМ', '#e2c6ff'];
  if (p.g === null || p.g === undefined) return [p.type === 'rot' ? 'поворот на месте: выбери сторону' : 'выбери ориентацию', '#a9b2bf'];
  if (p.type === 'rot') return [`поворот на месте ${signedTurn(p.base, p.g) > 0 ? '↷ вправо' : '↶ влево'} 60° · ${p.cost} ДД`, '#cfe6ff'];
  if (p.type === 'jump') return [`прыжок${p.dist ? ` на ${p.dist}` : ' на месте'}, ${turnWord(p.base, p.g)} · ⇧×${p.jumps}, ${2 * p.jumps}🌡`, '#e2c6ff'];
  return [`${p.dir}, ${turnWord(p.base, p.g)}${p.g !== p.base ? ' (бесплатно)' : ''} · ${p.cost} ДД`, '#cfe6ff'];
}
export function doMove(p) {                       // commit what the preview shows
  const a = st().activation, m = st().mechs[a.mechId];
  if (!p || p.bad) return;
  if (p.type === 'arm') { ui.jumpMode = !ui.jumpMode; ui.armed = []; refresh(); return; }
  if (p.g === null || p.g === undefined) return;
  const to = { q: p.h.q, r: p.h.r };
  if (p.type === 'rot') send({ type: 'TURN', turn: signedTurn(m.facing, p.g) });
  else if (p.type === 'jump') send({ type: 'JUMP', to, turn: signedTurn(m.facing, p.g), jumps: p.jumps, pipIds: jumpPips(p.jumps) });
  else send({ type: 'MOVE_STEP', to, turn: signedTurn(p.base, p.g) });
}

export function computeLegal() {          // "what can I click?" = dry-run the pure engine
  ui.legal = { moves: new Map(), jumps: new Map(), targets: new Set(), hexTargets: new Map(), rams: new Set(), mineHexes: new Map(), mineSel: new Map(), mineStep: new Map() };
  const a = st().activation; if (!a || a.phase !== 'PLAY' || st().pending || a.attack) return;
  const m = st().mechs[a.mechId];
  if (ui.jumpMode || ui.rmb) {             // landing hexes within reach of the jets left (own hex = jump in place)
    const k = jumpBudget();
    if (k) for (const c of Object.values(st().map.cells)) { const d = distance(m.pos, c); if (d > k) continue; const n = Math.max(1, d); if (ok({ type: 'JUMP', to: c, turn: 0, jumps: n, pipIds: jumpPips(n) })) ui.legal.jumps.set(key(c), c); }
  }
  else for (const n of neighbors(m.pos)) if (ok({ type: 'MOVE_STEP', to: n, turn: 0 })) ui.legal.moves.set(key(n), n);
  if (ui.armed.length) {
    for (const t of Object.values(st().mechs)) if (t.owner !== m.owner && t.status === 'active' && ok(fireAction(m, ui.armed, t.id))) ui.legal.targets.add(t.id);
    for (const c of Object.values(st().map.cells)) if ((c.terrain === 'building' || (c.terrain === 'forest' && !mechAt(st(), c) && !mineAt(st(), c))) && ok(fireAction(m, ui.armed, hexTargetId(st(), c)))) ui.legal.hexTargets.set(key(c), c);   // buildings and (with igniting weapons) forests can be shot too
  }
  if (ui.armed.length) for (const mn of Object.values(st().mines ?? {})) if (mn.owner !== m.owner && !mechAt(st(), mn.pos) && ok(fireAction(m, ui.armed, `mine:${mn.id}`))) ui.legal.hexTargets.set(key(mn.pos), mn.pos);   // mines can be shot too
  if (ui.ramMode) for (const t of Object.values(st().mechs)) if (t.owner !== m.owner && t.status === 'active' && ok(ramAction(m, t.id))) ui.legal.rams.add(t.id);
  if (ui.mineMode === 'place') { const ids = minePipsPlace(); if (ids) for (const n of neighbors(m.pos)) if (ok({ type: 'PLACE_MINE', to: n, pipIds: ids })) ui.legal.mineHexes.set(key(n), n); }
  // own mines that can make at least one step with the dice of this activation are highlighted; a click on one selects it
  const free = !ui.armed.length && !ui.ramMode && !ui.gaMode && !ui.jumpMode && !ui.rmb && ui.mineMode !== 'place';
  if (!free) ui.mineSel = null;
  else {
    const steps = (mn) => { const out = []; for (const n of neighbors(mn.pos)) { const ids = minePipsMove(mn.id, getCell(st().map, n) ? mineStepCost(st(), n) : 1); if (ids && ok({ type: 'MOVE_MINE', mineId: mn.id, to: n, pipIds: ids })) out.push(n); } return out; };
    for (const mn of Object.values(st().mines ?? {})) if (mn.owner === m.owner && (a.mineMoves[mn.id] || !mn.activated)) {
      const st1 = steps(mn); if (!st1.length) continue;
      ui.legal.mineSel.set(mn.id, mn);
      if (mn.id === ui.mineSel) for (const n of st1) ui.legal.mineStep.set(key(n), n);
    }
    if (ui.mineSel && !ui.legal.mineSel.has(ui.mineSel)) ui.mineSel = null;
  }
}
// GA radius picked by the cursor: distance from the mech to the hovered hex (own hex = 1); null when the hex is farther than the max radius
export function gaRadiusAt(c) {
  const a = st().activation; if (!ui.gaMode || !c || !a) return null;
  const d = Math.max(1, distance(st().mechs[a.mechId].pos, c));
  return d <= RULES.gaMaxRadius ? d : null;
}
export // ---- pilots: the mech is chosen on the map, the pilot on a fly-out of cards to the left of the activation button
const canStart = (m) => { const s = st(); return !!m && !s.activation && !s.pending && s.winner === null && m.status === 'active' && !m.activated && m.owner === s.turn.player && rankOf(m) === s.turn.rank; };
