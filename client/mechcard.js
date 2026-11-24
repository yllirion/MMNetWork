// Mech specification card.
import { CLASSES } from '../core/data/classes.js';
import { WEAPONS } from '../core/data/weapons.js';
import { heatGenerated } from '../core/heat.js';
import { pilotOf } from '../core/pilots.js';
import { heatCapacity, evadeOf, systemsOn } from '../core/state.js';
import { $, esc, img, mini } from './dom.js';
import { CLS_LETTER, CLS_RU, COOLER_RU, SYS_EFFECT, SYS_IMG, SYS_RU, TOK, wname } from './labels.js';
import { st, ui } from './ui.js';
import { ARMI, costIcons } from './panel.js';

// ---- mech specification card: the hovered mech, otherwise the one that is activating
export const items = (rows) => `<ul class="items">${rows.map((r) => `<li class="${r.state ?? ''}" ${r.tip ? `title="${esc(r.tip)}"` : ''}><span class="nm">${r.html}</span></li>`).join('')}</ul>`;
// armor class: the shield icons 3/4/5; any other number gets the same shield drawn in SVG
export const armorIcon = (n) => [3, 4, 5].includes(n) ? `<img class="armi" src="${img('armor' + n)}" alt="${n}">`
  : `<svg class="armi" viewBox="0 0 32 32"><path d="M16 2 L29 7 Q29 22 16 30 Q3 22 3 7 Z" fill="#fff" stroke="#000" stroke-width="2.5"/><text x="16" y="23" text-anchor="middle" font-size="17" font-weight="900" font-family="Arial" fill="#000">${n}</text></svg>`;
// frame colours: green = ready / working, red = used (or switched off), yellow = paid by a mass activation; no frame outside the activation
export function pilotLine(m) {
  const p = pilotOf(st(), m);
  if (!p) return st().pilots && m.status === 'active' ? '<div class="pline"><small>пилот не назначен (садится при активации)</small></div>' : '';
  return `<div class="pline">👤 Пилот <b>${esc(p.name)}</b> · навык <b>${p.skill}</b>${p.status === 'dead' ? ' · <b style="color:#e25555">погиб</b>' : p.status === 'reserve' ? ' · <b>в резерве</b>' : ''}</div>`;
}
export function mechCard(m) {
  const s = st(), a = s.activation, on = a && a.mechId === m.id ? a : null;          // "used" marks exist only for the mech that is activating
  const cap = heatCapacity(m), segs = Math.max(8, cap), gen = on ? heatGenerated(on) : 0, ev = evadeOf(m), dur = CLASSES[m.cls].durability, eq = m.equipment, live = systemsOn(m);
  const bar = Array.from({ length: segs }, (_, i) => `<i class="${i < cap ? 'cap' : ''} ${i < gen ? (i < cap ? 'fill' : 'over') : ''}"></i>`).join('');
  const weapons = m.weapons.map((w) => {
    const def = WEAPONS[w.type], fired = on?.fired.includes(w.id), paid = !fired && on && Object.values(on.mass).some((x) => x.weapons.includes(w.id));
    return { state: fired ? 'used' : paid ? 'paid' : on ? 'ready' : '', tip: fired ? 'задействовано' : paid ? 'оплачено массовой активацией' : on ? 'готово' : '', html: `<b>${esc(wname(w.type))}</b> ${costIcons(def)}<small>${def.minRange}–${def.maxRange} гекс.</small>` };
  });
  const act1 = (used, html, tip) => ({ state: !live ? 'off' : on ? (used ? 'used' : 'ready') : '', tip: !live ? 'отключено (экстренное отключение)' : on ? (used ? 'задействовано' : 'готово') : tip, html });
  const pass = (html, tip) => ({ state: live ? 'ready' : 'off', tip: live ? tip : 'отключено (экстренное отключение)', html });
  const gear = [{ state: 'ready', tip: 'работает всегда', html: `Охладители <b>${COOLER_RU[m.coolers] ?? m.coolers}</b><small>ёмкость ${cap}, остывает на ${m.coolers === 'double' ? 2 : 1}</small>` }];
  for (let i = 0; i < (eq.jumpjets ?? 0); i++) gear.push({ ...act1(on && i < on.jumpsUsed, `<b>${esc(eq.jjNames?.[i] ?? 'JJ')}</b><small>1 куб ⇧ = 1 прыжок</small>`), state: on ? (i < on.jumpsUsed ? 'used' : 'ready') : '' });
  if (eq.masc) gear.push(act1(on?.masc, '<b>MASC</b><small>1 move = 2 ДД, +1🌡</small>'));
  if (eq.cc) gear.push(act1(on?.ccUsed, '<b>CC</b><small>любой куб → цвет для корректировки</small>'));
  if (eq.tc) gear.push(act1(on?.tcUsed, '<b>TC</b><small>смена типа атаки / переброс куба урона</small>'));
  if (eq.ga) gear.push(act1(on?.gaUsed, '<b>GA</b><small>anchor всем в радиусе; энерг. куб тепла за единицу радиуса</small>'));
  if (eq.minelayer) gear.push(act1(on && on.minesPlaced >= eq.minelayer, `<b>Миноукладчик</b>${eq.minelayer > 1 ? ' ×' + eq.minelayer : ''} ${costIcons({ pips: ['laser', 'missile'] })}<small>мина на соседний гекс</small>`));
  if (eq.ecm) gear.push(pass('<b>ECM</b><small>+1 virtual evade</small>', 'активно'));
  if (eq.ams) gear.push(pass(`<b>AMS</b>${eq.ams > 1 ? ' ×' + eq.ams : ''}<small>кубы против ракет</small>`, 'активно'));
  if (eq.os) gear.push(pass(`<b>OS</b><small>+1 ${ARMI}, +1 overheat; раз за вражескую активацию</small>`, 'готов'));
  const crits = Object.entries(m.crits).filter(([, n]) => n > 0);
  const tok = (name, label, n) => (n ? `<span title="${label}">${mini(TOK[name], label, 'tk')}<b>${n}</b></span>` : '');
  const tokens = [tok('overheat', 'overheat', m.overheat), tok('evade', 'evade', ev.evade), tok('virtual', 'virtual evade', ev.virtual), tok('anchor', 'anchor', m.anchor), tok('blind', 'blind: −2 к макс. дальности за жетон', m.blind)].join('');
  return `<div class="mc"><h4><span class="p${m.owner}">${esc(m.name)}</span>${m.status === 'disabled' ? '<span class="tag">выведен из строя</span>' : m.shutdown ? '<span class="tag" style="border-color:#e25555;color:#e25555">экстренно отключён</span>' : m.activated ? '<span class="tag">ходил</span>' : ''}${on ? '<span class="tag">активация</span>' : ''}</h4>
    ${pilotLine(m)}
    <div class="mline"><span class="clsb p${m.owner}" title="класс: ${CLS_RU[m.cls]}">${CLS_LETTER[m.cls]}</span><span title="класс брони ${m.armorClass}: ${m.armorClass} куб. брони спереди, 2 сзади">${armorIcon(m.armorClass)}</span><span>скорость <b>${esc(m.speed)}</b></span></div>
    <div class="kv"><span>Теплоёмкость</span><span><div class="hbar" title="закрашено: тепло, набранное в этой активации; красное — сверх ёмкости (станет жетонами overheat)">${bar}</div><small>${on ? `набрано ${gen} из ${cap}${gen > cap ? ` → +${gen - cap} overheat` : ''}` : `ёмкость ${cap}`} · жетонов overheat: ${m.overheat}/6</small></span>
    <span>HP</span><span><div class="hp">${Array.from({ length: dur }, (_, i) => `<i class="${i < m.damage ? 'f' : ''}"></i>`).join('')}<i class="last ${m.damage > dur ? 'f' : ''}" title="уничтожен, когда повреждений больше ${dur}">☠</i></div><small>повреждений ${m.damage} из ${dur}</small></span></div>
    ${crits.length ? `<div class="sec">Критические повреждения</div>${items(crits.map(([k, n]) => ({ state: n >= 3 ? 'used' : '', tip: n >= 3 ? 'выведен из строя' : '', html: `${mini(SYS_IMG[k], SYS_RU[k], 'pi')} <b>${SYS_RU[k]}</b> ×${n} <small>${SYS_EFFECT[k]}</small>` })))}` : ''}
    ${tokens ? `<div class="sec">Жетоны</div><div class="toks">${tokens}</div>` : ''}
    <div class="cols"><div><div class="sec">Оружие</div>${weapons.length ? items(weapons) : '<small>нет</small>'}</div><div><div class="sec">Оборудование</div>${items(gear)}</div></div></div>`;
}
export function renderMech() {
  const s = st(), id = ui.hoverMechId ?? s.activation?.mechId ?? ui.chosenMech, m = id && s.mechs[id];
  $('mech').innerHTML = m && (m.status === 'active' || m.status === 'disabled') ? mechCard(m) : '<small>Наведи на мех или начни активацию — здесь будет его спецификация.</small>';
}
