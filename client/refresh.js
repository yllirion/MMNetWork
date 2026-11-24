// One refresh of everything after a state or UI change.
import { CONVERSIONS } from '../core/engine.js';
import { st, ui } from './ui.js';
import { convFits, jumpPip } from './actions.js';
import { computeLegal } from './legal.js';
import { draw } from './render.js';
import { renderDice } from './dicewin.js';
import { panel } from './panel.js';
import { renderMech } from './mechcard.js';
import { info } from './tooltip.js';
import { renderWeather } from './windows.js';

export function refresh() {
  const curAct = st().activation?.mechId ?? null;
  if (curAct !== ui.lastActId) { ui.lastActId = curAct; ui.gaMode = false; ui.mineMode = null; ui.mineSel = null; ui.lastShot = null; ui.diceMoved = false; ui.armed = []; ui.ramMode = null; ui.ramExtra = 0; ui.jumpMode = false; ui.conv = null; ui.sel.clear(); }   // a new activation starts with nothing selected
  if (ui.conv && !convFits(CONVERSIONS[ui.conv], ui.sel.size)) ui.conv = null;
  const a = st().activation;
  if (ui.gaMode && !(a && a.phase === 'PLAY' && !a.attack && !st().pending && !a.gaUsed)) ui.gaMode = false;
  if (ui.jumpMode && !(a && a.phase === 'PLAY' && !a.attack && !st().pending && jumpPip())) ui.jumpMode = false;
  if (!(st().pending?.type === 'TURN_TARGET')) ui.turnPrev = null;
  computeLegal(); info(ui.hover); panel(); renderMech(); renderDice(); renderWeather(); draw();
}
