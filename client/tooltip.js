// The hint popup on the map: hex properties, shot / ram / GA previews.
import { shotPreview } from '../core/attack.js';
import { TERRAIN } from '../core/data/terrain.js';
import { WEAPONS } from '../core/data/weapons.js';
import { massPlan, ramDamage, apply } from '../core/engine.js';
import { key, distance } from '../core/hex.js';
import { mineAt } from '../core/mines.js';
import { RULES } from '../core/rules.js';
import { targetOf, buildingId, hexTargetId, rankOf } from '../core/state.js';
import { $, esc, mini } from './dom.js';
import { ARMOR_PART, BAND_RU, CLASS_EN, TNAME, TOK, bandTxt, wname, wtype } from './labels.js';
import { name, pix, st, ui, who } from './ui.js';
import { fireAction, ramAction } from './actions.js';
import { gaRadiusAt } from './legal.js';
import { ARMI } from './panel.js';

// ---- hover: hex properties
export function describeCell(c) {
  const t = TERRAIN[c.terrain], L = [], mn = mineAt(st(), c);
  if (mn) L.push(`${mini(`mine_p${mn.owner}_${mn.activated ? 'inactive' : 'active'}`, 'мина', 'pi')} <b>Мина игрока ${mn.owner}</b>: ${mn.activated ? 'уже двигалась или поставлена в этом раунде (жетон inactive)' : 'готова к перемещению (жетон active)'}; любой урон уничтожает; детонирует под вражеским мехом`);
  if (t.moveExtra) L.push(`вход стоит на ${t.moveExtra} действие движения больше`);
  if (t.armor) L.push(`+${t.armor} ${ARMI} меху в этом гексе`);
  if (t.fire) L.push('стрельба сквозь огонь: +1 virtual evade цели и −1 дальность лазеров за каждый гекс огня на линии; цель, стоящая в огне, получает +1 virtual evade', '+1 overheat при входе, старте активации и появлении огня');
  if (t.extraCool) L.push(`контроль нагрева: −1 дополнительный ${mini('tok_overheat', 'overheat', 'pi')}`, `лазеры по меху здесь: −${t.waterLaser} дальности за каждый ${mini('tok_overheat', 'overheat', 'pi')}`);
  if (t.burns) L.push('Лес — это огнеопасный гекс');
  if (t.forbidClass) L.push('легкие мехи не могут занимать гекс');
  if (t.blocksMove) L.push('движение невозможно', 'закрывает линию огня');
  if (t.hp) L.push(`прочность ${t.hp} (при разрушении — камни или огонь)`); else if (t.indestructible) L.push('неразрушимо');
  if (c.cover) L.push(`укрытие/обломки размера ${c.cover}`);
  return `<span class="sw" style="background:#${t.color}"></span><b>${TNAME[c.terrain]}</b> <small>(${c.col},${c.row} · до края ${c.edge})</small>${L.length ? '<ul style="margin:4px 0 0;padding-left:18px">' + L.map((x) => `<li>${x}</li>`).join('') + '</ul>' : '<br><small>особых свойств нет</small>'}`;
}
// the common part of the aiming tooltip: distance, side and armor dice of the target, its owner, and the armor bonuses that apply to EVERY weapon of the volley
export function aimHeader(hm, p) {
  if (hm.isMine) return `<b>Выстрел</b> → Дист. ${p.dist} · Мина игрока ${hm.owner} (любой урон уничтожает)`;
  if (hm.isBuilding) return `<b>Выстрел</b> → Дист. ${p.dist} · Здание (4 урона одной атакой)`;
  if (hm.isForest) return `<b>Выстрел</b> → Дист. ${p.dist} · Лес (только поджечь)`;
  const rear = p.side === 'rear', dice = rear ? 2 : hm.armorClass;
  const src = (x) => x.terrain ? `<span class="sw" style="background:#${TERRAIN[x.terrain].color}" title="${esc(TNAME[x.terrain])}${x.where === 'line' ? ' на линии' : ' в гексе цели'}: +${x.n}"></span>${x.n > 1 ? '×' + x.n : ''}` : mini('icon_nearer', ARMOR_PART.nearer, 'pi');
  const bonus = p.armor.total ? ` · +${p.armor.total}${mini('icon_armor', 'бонус брони', 'pi')} (${p.armor.parts.map(src).join(' ')})` : '';
  return `<b>Выстрел</b> → Дист. ${p.dist} · ${rear ? 'Rear' : 'Front'} ${dice} · <span class="p${hm.owner}">${esc(hm.name)}</span>${bonus}`;
}
export const fireSw = (k) => `<span class="sw" style="background:#${TERRAIN.fire.color}" title="Огонь: ${k} гекс."></span>${k > 1 ? '×' + k : ''}`;
export const jjLine = (p) => p.jj > 0 ? `<p class="jjl">${mini('jumpjet', 'прыжковые двигатели', 'pi')} <b>JJ:</b> гексы на R${p.jj} игнорируются (кроме цели и соседних с ней гексов)</p>` : '';
// one weapon group of the aiming tooltip: name ×n, ✔, the pilot dice that will pay for it (missing ones struck out, with the penalty heat), then range / modifiers
export function weaponBlock(p, n, slots, heat) {
  const dice = slots.map((s) => s.ok ? mini(s.color, 'куб пилотирования', 'pi') : `<span class="dxs">${mini(s.color, 'куба не хватает', 'pi')}</span>`).join('');
  const bad = p.error && !/range/.test(p.error) ? ` <span style="color:#e25555">✖ ${esc(p.error)}</span>` : '';
  let head = `<b>${esc(p.name)}${n > 1 ? ' ×' + n : ''}</b>${p.ok ? ' <span style="color:#4caf50">✔</span>' : bad} ${dice}${heat ? ` <b>+${heat}🌡</b>` : ''}${p.sub === 'lrm' ? ' <small>(навесом: влияют только первый гекс и гекс перед целью)</small>' : ''}`;
  let body;
  if (p.laserReach) {
    const mods = p.reachMods.map((x) => /огонь/.test(x.what) ? `−${x.n} ${fireSw(x.n)}` : `−${x.n} ${esc(x.what)}`).join(', ');
    body = `Макс. дальность <b style="color:${p.band === 'out' ? '#e25555' : 'inherit'}">${p.maxRange}</b>${p.band === 'out' ? '' : ' (' + BAND_RU[p.band] + ')'}${mods ? ` (${mods})` : ''}`;
  } else if (p.sub) {
    const ams = (img) => p.amsDice ? ` · AMS: ${p.amsDice} ${mini(img, 'кубы AMS (баллистика)', 'pi')}${p.sub === 'lrm' ? `, класс для поворота +${p.amsDevices}` : ''}` : '';
    const fireTxt = p.fire ? ' ' + fireSw(p.fire) : '';
    if (p.sub === 'srm') {                                          // SRM: only the tokens that actually cut the damage (close range already took 1 off)
      const tok = [p.evade ? `${p.evade}${mini('tok_evade', 'evade', 'pi')}` : '', p.virt ? `${p.virt}${mini('tok_virtual_evade', 'virtual evade', 'pi')}` : ''].filter(Boolean);
      head += tok.length ? ` (${tok.join(' ')})` : '';
      body = `Дальность ${p.eff} (${bandTxt(p)})${tok.length ? ` · ${tok.join('+')}${fireTxt} вычитаются из урона ракет` : ''}${ams('w_ballistic_1damage')}`;
    } else body = `Дальность ${p.eff} (${bandTxt(p)})<br>${p.evade}${mini('tok_evade', 'evade', 'pi')}+${p.virt}${mini('tok_virtual_evade', 'virtual evade', 'pi')}${p.fire ? ' (' + fireSw(p.fire) + ')' : ''} вычитаются из урона ракет${ams('w_ballistic_0damage')}`;
  } else {
    const mods = p.rangeMods.map((x) => x.what.startsWith('virtual') ? `+${x.n} ${mini('tok_virtual_evade', x.what, 'pi')}${p.fire ? ` (${fireSw(p.fire)})` : ''}` : x.what === 'evade' ? `+${x.n} ${mini('tok_evade', 'evade', 'pi')}` : `+${x.n} ${esc(x.what)}`).join(' ');
    body = `Дальность ${p.eff} (${bandTxt(p)})${mods ? ` (${mods})` : ''}${p.turnOnHit ? ` · при попадании ↻ ${60 * p.turnOnHit}°` : ''}`;
  }
  return `<p>${head}<br>${body}${p.plain.length ? '<br><small>' + p.plain.map(esc).join(' · ') + '</small>' : ''}</p>`;
}
export function info(c) {
  const s = st(), a = s.activation, hb = ui.hover && (s.map.cells[key(ui.hover)]?.terrain === 'building' || (ui.armed.length && ui.legal.hexTargets.has(key(ui.hover)) && !mineAt(s, ui.hover))) ? targetOf(s, hexTargetId(s, ui.hover)) : null;
  const hmn = ui.hover && !hb && !ui.hoverMechId && mineAt(s, ui.hover) ? targetOf(s, `mine:${mineAt(s, ui.hover).id}`) : null;
  const hm = (ui.hoverMechId && s.mechs[ui.hoverMechId]) || hb || hmn;
  ui.preview = null; ui.previewPos = hm ? hm.pos : null;
  if (a && a.phase === 'PLAY' && !a.attack && ui.armed.length && hm && hm.status === 'active' && (hm.isBuilding || hm.isForest || hm.owner !== s.mechs[a.mechId].owner)) {
    const am = s.mechs[a.mechId];
    ui.preview = ui.armed.map((wid) => { const w = WEAPONS[wtype(am, wid)]; return { wid, name: wname(wtype(am, wid)), ...shotPreview(s, am, hm, w) }; });
    const mp = massPlan(am, a, fireAction(am, ui.armed, hm.id).weapons ?? [], ui.sel.size ? [...ui.sel] : null);
    const have = {};                                                  // dice per color that the volley can still hand out, spent group by group
    for (const c of new Set(ui.preview.flatMap((p) => p.pips))) { const m = mp.find((x) => x.color === c); have[c] = m ? m.take : a.pool.filter((q) => !q.spent && q.color === c && (!ui.sel.size || ui.sel.has(q.id))).length; }
    const seen = new Map(); ui.preview.forEach((p) => { const k = p.name; seen.set(k, { p, n: (seen.get(k)?.n ?? 0) + 1 }); });   // identical weapons: one block with ×N
    const blocks = [...seen.values()].map(({ p, n }) => {
      const slots = []; let heat = 0;
      for (let i = 0; i < n; i++) for (const c of p.pips) { const ok = have[c] > 0; if (ok) have[c]--; slots.push({ color: c, ok }); if (!ok && mp.some((x) => x.color === c)) heat++; }
      return weaponBlock(p, n, slots, heat);
    });
    setInfo(aimHeader(hm, ui.preview[0]) + jjLine(ui.preview[0]) + blocks.join(''));
    return;
  }
  if (a && a.phase === 'PLAY' && ui.gaMode) {
    const am = s.mechs[a.mechId], rr = gaRadiusAt(c);
    if (!rr) { setInfo(c ? `<p><b>GA</b>: радиус не больше ${RULES.gaMaxRadius} — гекс слишком далеко.</p>` : ''); return; }
    const hit = Object.values(s.mechs).filter((t) => t.status === 'active' && distance(am.pos, t.pos) <= rr);
    setInfo(`<p><b>⚓ GA, радиус ${rr}</b> → ${name(am.id)} бросает ${rr} энерг. ${rr === 1 ? 'куб' : rr < 5 ? 'куба' : 'кубов'}: +${rr}–${3 * rr} тепла<br>${mini(TOK.anchor, 'anchor', 'pi')} получат: ${hit.map((t) => `<span class="p${t.owner}">${esc(t.name)}</span>`).join(', ')}<br><small>клик — активировать</small></p>`); return;
  }
  if (a && a.phase === 'PLAY' && !a.attack && ui.ramMode) {
    const am = s.mechs[a.mechId], rt = hm && !hm.isBuilding && hm.owner !== am.owner && hm.status === 'active' ? hm : null;
    const cost = ui.ramMode === 'jump' ? `${2 + ui.ramExtra} куб. ⇧ (+${2 * (2 + ui.ramExtra)}🌡, +${2 + ui.ramExtra} virtual evade)` : `${2 + ui.ramExtra + (am.anchor > 0 ? 1 : 0)} ДД`;
    const rule = `Таран${ui.ramMode === 'jump' ? ' с JJ' : ''}: стоит ${cost}. Каждое действие сверх базы (разгон ${ui.ramExtra}) повышает класс на 1; урон = класс с разгоном − класс цели (мин. 0), не больше собственного класса (${rankOf(am)}); броня не действует.`;
    if (rt) { const dmg = ramDamage(rankOf(am), rankOf(rt), ui.ramExtra), why = apply(st(), { player: who(), ...ramAction(am, rt.id) }); setInfo(`<p><b>Таран → ${name(rt.id)}</b> ${why.ok ? '<span style="color:#4caf50">✔</span>' : `<span style="color:#e25555">✖ ${esc(why.error)}</span>`}<br>Урон ${dmg}: класс ${CLASS_EN[am.cls]} ${rankOf(am)}${ui.ramExtra ? ` + разгон ${ui.ramExtra} = ${rankOf(am) + ui.ramExtra}` : ''} против ${CLASS_EN[rt.cls]} ${rankOf(rt)}, максимум ${rankOf(am)}. Цена: ${cost}. Защитник может катапультироваться до броска урона.</p>`); return; }
    setInfo(`<p>${rule}<br><small>Наведи на соседнего врага.</small></p>`); return;
  }
  setInfo(c ? describeCell(c) : '');
}
export // the hint is a translucent popup on the map next to the cursor (flips to the other side near the edges)
function setInfo(html) { const el = $('info'); el.innerHTML = html; el.style.display = html && ui.infoPt ? 'block' : 'none'; placeInfo(); }
// The popup sits next to the cursor. While aiming it must not cover the line of fire: of the eight places around the cursor
// (and, if needed, farther ones) the first that keeps clear of the attacker→target segment wins.
export function placeInfo() {
  const el = $('info'); if (!ui.infoPt || el.style.display === 'none') return;
  const W = $('stage').clientWidth, H = $('stage').clientHeight, w = el.offsetWidth, h = el.offsetHeight, gap = 22, cx = ui.infoPt.x, cy = ui.infoPt.y;
  const clamp = (x, y) => [Math.max(4, Math.min(W - w - 4, x)), Math.max(4, Math.min(H - h - 4, y))];
  const a = st().activation, seg = a && ui.previewPos ? [toStage(pix(st().mechs[a.mechId].pos)), toStage(pix(ui.previewPos))] : null;
  const bd = ui.badgeRect ? (() => { const p0 = toStage(ui.badgeRect), p1 = toStage({ x: ui.badgeRect.x + ui.badgeRect.w, y: ui.badgeRect.y + ui.badgeRect.h }); return { x: p0.x - 6, y: p0.y - 6, w: p1.x - p0.x + 12, h: p1.y - p0.y + 12 }; })() : null;
  const overBadge = (x, y) => bd && x < bd.x + bd.w && x + w > bd.x && y < bd.y + bd.h && y + h > bd.y;
  const cands = [];
  for (const k of [1, 3, 6]) {
    const g = gap * k;
    cands.push([cx + g, cy + g], [cx + g, cy - g - h], [cx - g - w, cy + g], [cx - g - w, cy - g - h], [cx - w / 2, cy + g], [cx - w / 2, cy - g - h], [cx + g, cy - h / 2], [cx - g - w, cy - h / 2]);
  }
  let best = clamp(cands[0][0], cands[0][1]);
  for (const [x0, y0] of cands) {
    const [x, y] = clamp(x0, y0);
    if (x <= cx && cx <= x + w && y <= cy && cy <= y + h) continue;              // never under the cursor
    if (overBadge(x, y)) continue;                                // never over the step / jump badge
    if (!seg || !segHitsRect(seg[0], seg[1], x - 6, y - 6, w + 12, h + 12)) { best = [x, y]; break; }
  }
  el.style.left = best[0] + 'px'; el.style.top = best[1] + 'px';
}
// canvas pixel → #stage coordinates
function toStage(p) {
  const cv = $('cv'), r = cv.getBoundingClientRect(), sr = $('stage').getBoundingClientRect();
  return { x: r.left - sr.left + p.x * r.width / cv.width, y: r.top - sr.top + p.y * r.height / cv.height };
}
// does the segment a–b cross (or lie inside) the rectangle?
function segHitsRect(a, b, x, y, w, h) {
  const inside = (p) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  if (inside(a) || inside(b)) return true;
  const cross = (p1, p2, p3, p4) => {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x); if (!d) return false;
    const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d, v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  };
  const c = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  return [0, 1, 2, 3].some((i) => cross(a, b, c[i], c[(i + 1) % 4]));
}
