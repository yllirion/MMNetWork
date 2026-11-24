// Mouse and keyboard input on the map and in the windows.
import { key, neighbor as hexNeighbor } from '../core/hex.js';
import { $, S, cv } from './dom.js';
import { newGame, pix, saveInput, st, ui } from './ui.js';
import { corrAction, firstMove, moveCommit } from './actions.js';
import { copyLink, flash, resetUi, send, undoUi } from './session.js';
import { renderDice } from './dicewin.js';
import { refresh } from './refresh.js';
import { renderSettings, showSettings } from './windows.js';

// ---- input
export function onClick(e) {
  const t = e.target.closest('[data-chip],[data-do],[data-w],[data-turn],[data-conv],[data-to],[data-die],[data-tc],[data-fold],[data-ram],[data-ramx],[data-imode],[data-skill],[data-mine],[data-minemode]'); if (!t) return; const a = st().activation;
  if (t.dataset.mine !== undefined) send({ type: 'RESOLVE_DECISION', choice: t.dataset.mine });
  else if (t.dataset.minemode) { ui.mineMode = ui.mineMode === t.dataset.minemode ? null : t.dataset.minemode; ui.mineSel = null; ui.gaMode = false; ui.armed = []; ui.ramMode = null; ui.jumpMode = false; refresh(); }
  else if (t.dataset.skill) send({ type: 'BUY_SKILL', pos: +t.dataset.skill });
  else if (t.dataset.chip) { if (!a.pool.find((p) => p.id === t.dataset.chip).spent) { ui.sel.has(t.dataset.chip) ? ui.sel.delete(t.dataset.chip) : ui.sel.add(t.dataset.chip); refresh(); } }
  else if (t.dataset.imode) { ui.inputMode = t.dataset.imode; saveInput(); if ($('settings').style.display === 'block') renderSettings(); refresh(); }
  else if (t.dataset.conv) { ui.conv = t.dataset.conv; refresh(); }
  else if (t.dataset.to) { const k = ui.conv; ui.conv = null; send({ type: 'CONVERT', kind: k, pipIds: [...ui.sel], to: t.dataset.to }); }
  else if (t.dataset.die) { const [si, k, i] = t.dataset.die.split(':'), act = corrAction('reroll', { shot: +si, group: k, index: +i }); if (act) send(act); }
  else if (t.dataset.fold) { ui.fold[t.dataset.fold] = !t.textContent.trim().startsWith('▾'); renderDice(); }
  else if (t.dataset.tc) send({ type: 'RESOLVE_DECISION', choice: t.dataset.tc });
  else if (t.dataset.w) { ui.ramMode = null; ui.gaMode = false; ui.mineMode = null; ui.mineSel = null; ui.armed = ui.armed.includes(t.dataset.w) ? ui.armed.filter((x) => x !== t.dataset.w) : [...ui.armed, t.dataset.w]; ui.jumpMode = false; refresh(); }
  else if (t.dataset.ram) { ui.gaMode = false; ui.ramMode = ui.ramMode === t.dataset.ram ? null : t.dataset.ram; ui.armed = []; ui.jumpMode = false; refresh(); }
  else if (t.dataset.ramx) { ui.ramExtra = Math.max(0, ui.ramExtra + +t.dataset.ramx); refresh(); }
  else if (t.dataset.turn) { ui.turnAfter = +t.dataset.turn; refresh(); }
  else {
    const d = t.dataset.do;
    if (d === 'closeres') { ui.lastShot = null; renderDice(); return; }
    if (d === 'new') { showSettings(false); if (ui.net) ui.net.newGame((r) => { if (!r.ok) flash(r.error); }); else { ui.g = newGame(); resetUi(); refresh(); } }
    else if (d === 'undo') { if (ui.net) ui.net.undo((r) => { if (!r.ok) flash(r.error); }); else { ui.g.undo(); undoUi(); refresh(); } }
    else if (d === 'link') copyLink();
    else if (d === 'jumpmode') { ui.jumpMode = !ui.jumpMode; ui.armed = []; ui.gaMode = false; refresh(); }
    else if (d === 'gamode') { ui.gaMode = !ui.gaMode; ui.armed = []; ui.ramMode = null; ui.jumpMode = false; ui.mineMode = null; ui.mineSel = null; refresh(); }
    else if (d.startsWith('ignore')) { const act = corrAction('ignoreEvade', { shot: +d.split(':')[1] }); if (act) send(act); }
    else if (d === 'take' || d === 'eject') send({ type: 'RESOLVE_DECISION', choice: d });
    else send({ roll: { type: 'ROLL_PILOT' }, shutdown: { type: 'EMERGENCY_SHUTDOWN' }, discard: { type: 'DISCARD_DICE', dieIds: [...ui.sel] }, commit: { type: 'COMMIT_MOVE', pipIds: moveCommit(st().mechs[a.mechId], a).ids },
      resolve: { type: 'RESOLVE_ATTACK' }, masc: { type: 'USE_MASC', pipIds: [firstMove()?.id] }, tl: { type: 'TURN', turn: -1 }, tr: { type: 'TURN', turn: 1 }, vev: { type: 'VIRTUAL_EVADE' }, end: { type: 'END_ACTIVATION' } }[d]);
  }
}

export const canvasPt = (ev) => { const r = cv.getBoundingClientRect(), k = cv.width / r.width; return { x: (ev.clientX - r.left) * k, y: (ev.clientY - r.top) * k }; };
export function cellAtPt(x, y) { return Object.values(st().map.cells).find((c) => { const p = pix(c); return Math.hypot(p.x - x, p.y - y) < S * 0.9; }); }
export function cellAt(ev) { const q = canvasPt(ev); return cellAtPt(q.x, q.y); }
export const mechIn = (c) => c && Object.values(st().mechs).find((m) => (m.status === 'active' || m.status === 'disabled') && key(m.pos) === key(c));

// keyboard movement (physical keys, any layout): W forward, Q/E forward + free turn, S back, A/D turn in place, Space jump mode, Z undo
export function keyStep(back, turn) {
  const a = st().activation; if (!a) return; const m = st().mechs[a.mechId], to = hexNeighbor(m.pos, back ? m.facing + 3 : m.facing);
  send({ type: 'MOVE_STEP', to: { q: to.q, r: to.r }, turn: back ? 0 : turn });
}
export const KEYS = { KeyW: () => keyStep(false, 0), KeyQ: () => keyStep(false, -1), KeyE: () => keyStep(false, 1), KeyS: () => keyStep(true, 0),
  KeyA: () => send({ type: 'TURN', turn: -1 }), KeyD: () => send({ type: 'TURN', turn: 1 }),
  Space: () => { ui.jumpMode = !ui.jumpMode; ui.armed = []; refresh(); }, KeyZ: () => document.querySelector('[data-do="undo"]')?.click() };
