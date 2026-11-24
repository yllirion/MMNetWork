// All mutable state of the client in one object (`ui`) and the shortcuts to the game state.
import { Game, apply } from '../core/engine.js';
import { toPixel } from '../core/hex.js';
import { targetOf } from '../core/state.js';
import { newGameState } from './scenario.js';
import { OX, OY, S, esc } from './dom.js';

export const newGame = () => new Game(newGameState());
// every piece of mutable UI state lives here, so the modules share it (ES imports are read-only bindings)
export const ui = {
  g: newGame(),
  sel: new Set(),
  conv: null,
  armed: [],
  jumpMode: false,
  turnAfter: 0,
  hover: null,
  hoverMechId: null,
  ramMode: null,
  ramExtra: 0,
  dicePos: { x: 0, y: 0 },
  flashMsg: '',
  flashTimer: null,
  logMarks: [],
  showLog: false,
  ptr: null,
  rmb: false,
  inputMode: 'zones',
  dead: 0.35,
  hintAlpha: 80,
  badgeRect: null,               // the step / jump badge near the cursor (canvas px), drawn by render.js                 // opacity of the hint popup background on the map, %
  lastShot: null,
  shotTimer: null,
  legal: { moves: new Map(), jumps: new Map(), targets: new Set(), hexTargets: new Map(), rams: new Set(), mineHexes: new Map(), mineSel: new Map(), mineStep: new Map() },
  // network session (client/net.js); null = hot-seat
  net: null,
  // 'place' | 'move'; the mine picked to move
  mineMode: null,
  mineSel: null,
  hoverBtn: null,
  // diceAnchor: where the window was put for the current shot (it keeps its top-left corner while it changes size)
  diceMoved: false,
  diceAnchor: null,
  // fold: sections the player has opened / closed by hand (reset with every new shot)
  shotSeq: 0,
  fold: {},
  // {id, facing}: where the target would look after the turn option under the cursor
  gaPrev: 0,
  gaMode: false,
  turnPrev: null,
  // shot preview for the armed weapons while the cursor is over an enemy mech
  preview: null,
  previewPos: null,
  // last cursor position relative to #stage
  infoPt: null,
  chosenMech: null,
  flyTimer: null,
  lastActId: null,
};

// on-map movement input: facing by cursor zones and/or arrow petals; right mouse button held = jump mode
try { const sv = JSON.parse(localStorage.getItem('mm.input') ?? 'null'); if (sv) { ui.inputMode = sv.mode ?? ui.inputMode; ui.dead = sv.dead ?? ui.dead; ui.showLog = !!sv.log; ui.hintAlpha = sv.hint ?? ui.hintAlpha; } } catch (_) {}
export const saveInput = () => { try { localStorage.setItem('mm.input', JSON.stringify({ mode: ui.inputMode, dead: ui.dead, log: ui.showLog, hint: ui.hintAlpha })); } catch (_) {} };
export const st = () => ui.g.state, actor = () => (st().pending ? st().pending.player : st().turn.player);   // whose input the game is waiting for
export const who = () => (ui.net ? ui.net.seat : actor()), myInput = () => !ui.net || (ui.net.online && st().winner === null && actor() === ui.net.seat);
export const name = (id) => esc(targetOf(st(), id)?.name ?? (String(id).startsWith('bld:') ? 'Здание' : id)), pix = (h) => ({ x: OX + S * toPixel(h).x, y: OY + S * toPixel(h).y });
export const ok = (a) => apply(st(), { player: who(), ...a }).ok;
