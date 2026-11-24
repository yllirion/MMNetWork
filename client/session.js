// Sending actions (hot-seat or network), applying the results, undo, network status, flash messages.
import { WEAPONS } from '../core/data/weapons.js';
import { $, esc } from './dom.js';
import { wname, wtype } from './labels.js';
import { myInput, st, ui, who } from './ui.js';
import { logEvent } from './log.js';
import { panel } from './panel.js';
import { refresh } from './refresh.js';

// ---- the combat window remembers the last shot: weapon dice → armor dice → damage dice
export function trackShot(e) {
  const s = st();
  if (e.type === 'mine_detonation') ui.lastShot = null;
  if (e.type === 'attack') {
    const am = s.mechs[e.attackerId];
    const shot = { name: esc(wname(wtype(am, e.weapon))), sub: WEAPONS[wtype(am, e.weapon)].sub ?? null, faces: e.faces, miss: e.miss, damage: e.damage, unblockable: e.unblockable, turns: e.turns };
    if (ui.lastShot && !ui.lastShot.armor && ui.lastShot.targetId === e.targetId && ui.lastShot.open) ui.lastShot.shots.push(shot);   // same volley
    else ui.lastShot = { open: true, shots: [shot], targetId: e.targetId, armor: null, damage: [] };
  } else if (e.type === 'ams' && ui.lastShot) { (ui.lastShot.ams ??= []).push(e);
  } else if (e.type === 'evade_cut' && ui.lastShot) { (ui.lastShot.evCuts ??= []).push(e);
  } else if (e.type === 'cover_cut' && ui.lastShot) { ui.lastShot.coverCut = e;
  } else if (e.type === 'building_hit' && ui.lastShot) { ui.lastShot.open = false; ui.lastShot.building = e;
  } else if (ui.lastShot && e.type === 'armor' && e.targetId === ui.lastShot.targetId && !ui.lastShot.armor) {
    ui.lastShot.open = false;
    ui.lastShot.armor = { faces: e.faces, rolls: e.rolls, bonus: e.bonusArmor, absorbed: e.absorbed, through: e.through, rear: e.rear, cls: s.mechs[e.targetId].cls };
  } else if (ui.lastShot && e.type === 'damage_die' && e.mechId === ui.lastShot.targetId) ui.lastShot.damage.push(e.face);
}
export function send(a) {
  if (!a) return;
  if (ui.net) {                                  // network game: the server applies the action and broadcasts the result to both players
    if (!ui.net.online) return flash('нет связи с сервером');
    if (!ui.net.seat) return flash('вы наблюдатель');
    if (!myInput()) return flash('сейчас ход соперника');
    ui.net.action(a, (r) => { if (!r.ok) flash(r.error); });
    return;
  }
  const r = ui.g.dispatch({ player: who(), ...a });
  if (!r.ok) flash(r.error);
  else applied(a.type, r.events, ui.g.history.length);
  refresh();
}
// an action went through (ours, or — in a network game — anybody's): shot window, log, selection
export function applied(type, events, undoDepth) {
  if (type === 'FIRE' || type === 'RAM') { ui.lastShot = null; ui.diceMoved = false; ui.diceAnchor = null; ui.fold = {}; ui.shotSeq++; }
  ui.sel.clear();
  if (type === 'MOVE_STEP' || type === 'JUMP') ui.turnAfter = 0;   // the free turn is chosen anew for every step
  if (ui.lastShot) ui.lastShot.open = false;
  events.forEach(trackShot);
  if (ui.lastShot) ui.lastShot.open = false;
  const before = $('log').children.length;
  events.forEach(logEvent);
  if (undoDepth) ui.logMarks.push($('log').children.length - before); else ui.logMarks = [];   // the log follows undo
  if (type === 'FIRE') ui.armed = [];
  if (type === 'RAM') { ui.ramMode = null; ui.ramExtra = 0; }
  if (type === 'JUMP') ui.jumpMode = false;
}
export function resetUi() { ui.ramMode = null; ui.ramExtra = 0; ui.dicePos = { x: 0, y: 0 }; ui.diceMoved = false; ui.diceAnchor = null; ui.armed = []; ui.logMarks = []; ui.jumpMode = false; ui.lastShot = null; ui.sel.clear(); $('log').innerHTML = ''; }
export function undoUi() { const k = ui.logMarks.pop() ?? 0; for (let i = 0; i < k; i++) $('log').firstChild?.remove(); ui.armed = []; ui.jumpMode = false; ui.sel.clear(); }
// network game: `g` becomes a read-only mirror of the server's game
export const mirrorGame = (m) => ({ state: m.state, history: { length: m.undo }, canUndo() { return this.history.length > 0 && ui.net.online && !this.state.pending && this.state.turn.player === ui.net.seat; } });
export function netStatus() {
  if (!ui.net) return '';
  const other = ui.net.players.find((p) => p.seat !== ui.net.seat && (ui.net.seat || p.seat === 1));
  const me = ui.net.seat ? `вы — <span class="p${ui.net.seat}">игрок ${ui.net.seat}</span>` : 'вы — наблюдатель';
  const opp = !ui.net.online ? '<span class="p2">нет связи с сервером…</span>' : !ui.net.seat ? '' : other?.online ? 'соперник в сети' : other?.taken ? '<span class="p2">соперник отключился</span>' : 'ждём соперника — отправь ему ссылку';
  return ` · ${me}${opp ? ' · ' + opp : ''}`;
}
export async function copyLink() { try { await navigator.clipboard.writeText(location.href); flash('ссылка скопирована — отправь её сопернику'); } catch (_) { prompt('Ссылка на партию:', location.href); } }
export function flash(msg) { ui.flashMsg = msg; clearTimeout(ui.flashTimer); ui.flashTimer = setTimeout(() => { ui.flashMsg = ''; panel(); }, 3500); panel(); }
