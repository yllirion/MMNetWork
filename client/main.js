// Entry point: the modules are imported first, then the bootstrap below wires the DOM events, the network session and the first render.
import { apply } from '../core/engine.js';
import { key } from '../core/hex.js';
import { mineStepCost, mineAt } from '../core/mines.js';
import { pilotsInHand } from '../core/pilots.js';
import { buildingId, hexTargetId } from '../core/state.js';
import { connect } from './net.js';
import { $, cv } from './dom.js';
import { myInput, pix, saveInput, st, ui, who } from './ui.js';
import { fireAction, minePipsMove, minePipsPlace, ramAction } from './actions.js';
import { canStart, doMove, gaRadiusAt, movePreview } from './legal.js';
import { applied, flash, mirrorGame, resetUi, send, undoUi } from './session.js';
import { btnAt, draw, mineHandle } from './render.js';
import { panel } from './panel.js';
import { renderMech } from './mechcard.js';
import { info, placeInfo } from './tooltip.js';
import { hidePilots, showPilots, startWith } from './pilotpick.js';
import { refresh } from './refresh.js';
import { KEYS, canvasPt, cellAt, mechIn, onClick } from './input.js';
import { applyHintAlpha, renderSettings, showLogWin, showSettings } from './windows.js';

// ---- network session (hot-seat when there is no server)
connect({
  joined(m) {                                 // first join and every reconnect: take the whole state and rebuild the log
    resetUi(); ui.g = mirrorGame(m);
    m.log.forEach((x, i) => { try { applied(x.type, x.events, Math.max(0, m.undo - (m.log.length - 1 - i))); } catch (e) { console.warn('log replay', e); } });
    if (!st().activation?.attack && !st().pending) ui.lastShot = null;
    refresh();
  },
  update(m) { ui.g = mirrorGame(m); applied(m.type, m.events, m.undo); refresh(); },
  undone(m) { ui.g = mirrorGame(m); undoUi(); refresh(); },
  reset(m) { resetUi(); ui.g = mirrorGame(m); refresh(); },
  presence() { panel(); },
  status(_, err) { if (err) flash(err); refresh(); },
}).then((n) => { ui.net = n; if (ui.net) refresh(); });

// ---- panels and windows
for (const host of [$('panel'), $('dice')]) host.addEventListener('mouseover', (e) => {          // hovering a turn option shows the resulting facing of the enemy mech
  const b = e.target.closest('[data-tc]'), p = st().pending; if (!b || !p || p.type !== 'TURN_TARGET') return;
  const [k, n] = b.dataset.tc.split(':'), f = st().mechs[p.targetId].facing;
  ui.turnPrev = k === 'L' ? { id: p.targetId, facing: (f - +n + 6) % 6 } : k === 'R' ? { id: p.targetId, facing: (f + +n) % 6 } : k === 'flip' ? { id: p.targetId, facing: (f + 3) % 6 } : null; draw();
});
for (const host of [$('panel'), $('dice')]) host.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tc]') && ui.turnPrev) { ui.turnPrev = null; draw(); } });
$('panel').addEventListener('click', onClick); $('dice').addEventListener('click', onClick);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.chosenMech) { ui.chosenMech = null; hidePilots(); refresh(); } });
window.addEventListener('resize', () => { if (ui.chosenMech && $('pilotfly').style.display !== 'none') showPilots(); });
$('pilotfly').addEventListener('click', (e) => { const c = e.target.closest('[data-pilot]'); if (c && !c.disabled) startWith(c.dataset.pilot, c.dataset.then); });
$('btnSet').addEventListener('click', () => showSettings($('settings').style.display !== 'block'));
$('roundbar').addEventListener('click', () => { ui.showLog = !ui.showLog; saveInput(); showLogWin(); });   // the round bar is the log toggle
$('logClose').addEventListener('click', () => { ui.showLog = false; saveInput(); showLogWin(); });
$('settings').addEventListener('click', (e) => { if (e.target.id === 'setClose') showSettings(false); else onClick(e); });
$('settings').addEventListener('input', (e) => {
  if (e.target.id === 'deadSlider') { ui.dead = +e.target.value / 100; saveInput(); renderSettings(); draw(); }
  if (e.target.id === 'hintSlider') { ui.hintAlpha = +e.target.value; saveInput(); applyHintAlpha(); $('hintVal').textContent = ui.hintAlpha + '%'; }
});
applyHintAlpha();
$('corner').addEventListener('click', onClick);
$('skills').addEventListener('click', onClick);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') showSettings(false); });
showLogWin();

// ---- the map: mouse
cv.addEventListener('mousemove', (e) => {
  ui.ptr = canvasPt(e); { const sr = $('stage').getBoundingClientRect(); ui.infoPt = { x: e.clientX - sr.left, y: e.clientY - sr.top }; }
  if (ui.rmb && !(e.buttons & 2)) { ui.rmb = false; refresh(); return; }
  const hb = btnAt(ui.ptr); if ((hb?.id ?? null) !== ui.hoverBtn) { ui.hoverBtn = hb?.id ?? null; cv.style.cursor = hb ? 'pointer' : ''; cv.title = hb?.title ?? ''; }
  const c = cellAt(e) ?? null, was = ui.hover;
  ui.hover = c; if (!was || !c || key(was) !== key(c)) { ui.hoverMechId = mechIn(c)?.id ?? null; info(c); renderMech(); } else placeInfo();
  draw();
});
cv.addEventListener('mouseleave', () => { ui.ptr = null; ui.infoPt = null; ui.hoverBtn = null; cv.style.cursor = ''; cv.title = ''; if (ui.rmb) return; ui.hover = null; ui.hoverMechId = null; info(null); renderMech(); draw(); });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mousedown', (e) => { if (e.button !== 2) return; const a = st().activation; if (!a || a.phase !== 'PLAY' || st().pending || a.attack) return; ui.ptr = canvasPt(e); ui.rmb = true; refresh(); });
window.addEventListener('mouseup', (e) => {                       // releasing the right button over a hex = jump there (outside the field = cancel)
  if (e.button !== 2 || !ui.rmb) return;
  ui.ptr = canvasPt(e); const p = e.target === cv ? movePreview() : null;
  ui.rmb = false;
  if (p && !p.bad && p.g !== null && p.g !== undefined) doMove(p); else refresh();
});
window.addEventListener('blur', () => { if (ui.rmb) { ui.rmb = false; refresh(); } });
const onMineHandle = (mn, pt) => { const h = mineHandle(mn); return Math.hypot(pt.x - h.x, pt.y - h.y) <= h.r * 1.25; };
cv.addEventListener('click', (e) => {
  const bt = btnAt(canvasPt(e)); if (bt) { ui.hoverBtn = null; cv.style.cursor = ''; cv.title = ''; send({ type: bt.id === 'roll' ? 'ROLL_PILOT' : 'EMERGENCY_SHUTDOWN' }); return; }
  const c = cellAt(e); if (!c || st().pending || st().winner !== null) return; const m = mechIn(c), a = st().activation;
  if (!a) { ui.chosenMech = m && canStart(m) && myInput() ? m.id : null; refresh(); if (ui.chosenMech) { if (pilotsInHand(st(), st().turn.player).length) showPilots(); else startWith(null); } else hidePilots(); return; }   // pick the mech → pilot cards right on its token
  if (a.phase !== 'PLAY') return;
  if (ui.gaMode) { const rr = gaRadiusAt(c); if (rr) { ui.gaMode = false; send({ type: 'USE_GA', radius: rr }); } return; }
  if (ui.legal.mineHexes.has(key(c))) send({ type: 'PLACE_MINE', to: { q: c.q, r: c.r }, pipIds: minePipsPlace() });
  else if (ui.legal.mineStep.has(key(c))) send({ type: 'MOVE_MINE', mineId: ui.mineSel, to: { q: c.q, r: c.r }, pipIds: minePipsMove(ui.mineSel, mineStepCost(st(), c)) });
  else if (mineAt(st(), c) && ui.legal.mineSel.has(mineAt(st(), c).id) && (onMineHandle(mineAt(st(), c), canvasPt(e)) || !ui.legal.moves.has(key(c)))) {   // own mine: select / deselect
    const id = mineAt(st(), c).id; ui.mineSel = ui.mineSel === id ? null : id; refresh();      // (if the mech can step there, only the handle picks the mine)
  }
  else if (m && ui.ramMode && ui.legal.rams.has(m.id)) send(ramAction(st().mechs[a.mechId], m.id));
  else if (!m && ui.legal.hexTargets.has(key(c))) send(fireAction(st().mechs[a.mechId], ui.armed, mineAt(st(), c) ? `mine:${mineAt(st(), c).id}` : hexTargetId(st(), c)));
  else if (m && ui.legal.targets.has(m.id)) send(fireAction(st().mechs[a.mechId], ui.armed, m.id));
  else { ui.ptr = canvasPt(e); doMove(movePreview()); }
});
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  const fn = KEYS[e.code], a = st().activation; if (!fn || e.repeat) return;
  if (e.code !== 'KeyZ' && !(a && a.phase === 'PLAY' && !st().pending && !a.attack && st().winner === null)) return;
  e.preventDefault(); fn();
});
globalThis.__mm = { get g() { return ui.g; }, refresh, pix, send, dry: (a) => apply(st(), { player: who(), ...a }), get legal() { return ui.legal; }, fireAction, get armed() { return ui.armed; } };   // debug hook for smoke tests
refresh();

// the correction window can be dragged by its header
{
  let drag = null;
  $('dice').addEventListener('pointerdown', (e) => { const h = e.target.closest('.dgrab'); if (!h) return; drag = { x: e.clientX - ui.dicePos.x, y: e.clientY - ui.dicePos.y }; ui.diceMoved = true; h.setPointerCapture(e.pointerId); e.preventDefault(); });
  $('dice').addEventListener('pointermove', (e) => { if (!drag) return; ui.dicePos = { x: e.clientX - drag.x, y: e.clientY - drag.y }; const b = $('dice').querySelector('.dicebox'); if (b) b.style.transform = `translate(${ui.dicePos.x}px,${ui.dicePos.y}px)`; });
  $('dice').addEventListener('pointerup', () => { drag = null; });
}
