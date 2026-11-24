// Pilot cards over the chosen mech token.
import { pilotsInHand } from '../core/pilots.js';
import { $, cv, esc } from './dom.js';
import { ok, pix, st, ui } from './ui.js';
import { send } from './session.js';

export const pilotCard = (p, btn) => `<${btn ? 'button' : 'div'} class="pcard p${p.owner}" ${btn ? `data-pilot="${p.id}"` : ''} title="${esc(p.name)}: навык ${p.skill} — добавляется к evade броска при покупке карт (если выпал хотя бы один evade)"><span class="pn">${esc(p.name)}</span><span class="ps">${p.skill}</span><small>навык</small></${btn ? 'button' : 'div'}>`;
// the power icon is drawn as SVG (the ⏻ character is missing from many system fonts), same shape as the button on the token
const POWER_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"><path d="M7.2 6.6a7.5 7.5 0 1 0 9.6 0"/><path d="M12 3v8.5"/></svg>';
// A card in the fly-out: click = the usual activation (pilot in, piloting roll at once); the button under the hovered card =
// emergency shutdown with this pilot. When the roll is impossible (overheat), the card only offers the shutdown.
const flyCard = (p, mechId) => {
  const canRoll = ok({ type: 'ACTIVATE', mechId, pilotId: p.id, then: 'roll' });
  return `<div class="pwrap${canRoll ? '' : ' noroll'}">
    <button class="pcard p${p.owner}" data-pilot="${p.id}" data-then="roll" ${canRoll ? '' : 'disabled'} title="${esc(p.name)}: навык ${p.skill} — добавляется к evade броска при покупке карт (если выпал хотя бы один evade).${canRoll ? ' Клик — активация: пилот садится, бросок пилотирования.' : ' Перегрев: бросок невозможен — только экстренное отключение.'}"><span class="pn">${esc(p.name)}</span><span class="ps">${p.skill}</span><small>${canRoll ? 'навык' : 'перегрев'}</small></button>
    <div class="pshutw"><button class="pshut" data-pilot="${p.id}" data-then="shutdown" title="экстренное отключение с этим пилотом">${POWER_SVG}</button></div></div>`;
};
// the cards are laid over the chosen mech's token (centred on it, kept inside the window)
export function showPilots() {
  clearTimeout(ui.flyTimer);
  const s = st(), m = ui.chosenMech && s.mechs[ui.chosenMech], hand = pilotsInHand(s, s.turn.player), fly = $('pilotfly');
  if (!m || !hand.length) { hidePilots(); return; }
  fly.innerHTML = hand.map((p) => flyCard(p, m.id)).join('');
  fly.style.display = 'flex';
  const q = pix(m.pos), r = cv.getBoundingClientRect(), x = r.left + q.x * r.width / cv.width, y = r.top + q.y * r.height / cv.height;
  fly.style.left = Math.max(4, Math.min(innerWidth - fly.offsetWidth - 4, x - fly.offsetWidth / 2)) + 'px';
  fly.style.top = Math.max(4, Math.min(innerHeight - fly.offsetHeight - 4, y - fly.offsetHeight / 2)) + 'px';
}
export function hidePilots(later) { clearTimeout(ui.flyTimer); if (later) ui.flyTimer = setTimeout(() => { $('pilotfly').style.display = 'none'; }, 250); else $('pilotfly').style.display = 'none'; }
export function startWith(pilotId, then) { const id = ui.chosenMech; ui.chosenMech = null; hidePilots(); send({ type: 'ACTIVATE', mechId: id, ...(pilotId ? { pilotId } : {}), ...(then ? { then } : {}) }); }
