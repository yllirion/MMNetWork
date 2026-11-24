// The dice / combat window in the middle of the field.
import { volleyBreakdown, correctionsLeft } from '../core/attack.js';
import { CLASSES } from '../core/data/classes.js';
import { MISSILE_DIE, DAMAGE_DIE } from '../core/data/dice.js';
import { WEAPONS } from '../core/data/weapons.js';
import { targetOf, rankOf } from '../core/state.js';
import { $, S, esc, img, mini } from './dom.js';
import { ARMOR_IMG, DMG_IMG, FACE, TOK, WIMG, wname, wtype } from './labels.js';
import { name, pix, st, ui } from './ui.js';
import { ARMI, turnButtons } from './panel.js';

export const amsRow = (a, label) => (a && a.dice ? `<div class="drow sm" title="AMS: жёлтые кубы, ** и *** — промахи">${a.dice.map((f) => `<div class="d"><img src="${img(WIMG.ballistic(f))}" alt=""></div>`).join('')}<small>${label}</small></div>` : (a && a.faces ? `<div class="drow sm">${a.faces.map((f) => `<div class="d"><img src="${img(WIMG.ballistic(f))}" alt=""></div>`).join('')}<small>${label}</small></div>` : ''));
export const shotResult = (x) => (x.miss ? '✖ ПРОМАХ' : `✔ урон ${x.damage}${x.unblockable ? '+' + x.unblockable : ''}`);
export 
// ---- the dice window in the middle of the field
//  while the player can correct a shot: weapon dice with a 🔄 button (and the number of corrections left) over each die;
//  afterwards: a read-only summary (weapon dice → armor dice → damage dice) that never blocks the field and goes away on its own
// the window opens beside the target (about two hexes away, on the side away from the attacker) so it never covers the mech; once dragged it stays where the player put it
function placeDice() {
  const box = $('dice').querySelector('.dicebox'); if (!box || ui.diceMoved) return;
  const s = st(), id = s.activation?.attack?.targetId ?? ui.lastShot?.targetId, tg = id && targetOf(s, id); if (!tg) return;
  const stage = $('stage').getBoundingClientRect(), cvr = $('cv').getBoundingClientRect(), k = cvr.width / $('cv').width;
  const T = pix(tg.pos), tx = cvr.left - stage.left + T.x * k, ty = cvr.top - stage.top + T.y * k;
  const am = s.activation && s.mechs[s.activation.mechId], ax = am ? cvr.left - stage.left + pix(am.pos).x * k : tx - 1;
  const ay = am ? cvr.top - stage.top + pix(am.pos).y * k : ty;
  const w = box.offsetWidth, h = box.offsetHeight, gap = 2 * Math.sqrt(3) * S * k, W = stage.width, H = stage.height;
  const cy = Math.min(Math.max(ty - h / 2, 4), Math.max(4, H - h - 4)), cx = Math.min(Math.max(tx - w / 2, 4), Math.max(4, W - w - 4));
  const R = { l: tx + gap, t: cy }, L = { l: tx - gap - w, t: cy }, D = { l: cx, t: ty + gap }, U = { l: cx, t: ty - gap - h };
  const cand = (ax <= tx ? [R, L, D, U] : [L, R, D, U]);                         // away from the attacker first
  const fits = (c) => c.l >= 4 && c.t >= 4 && c.l + w <= W - 4 && c.t + h <= H - 4;
  const hitsAtk = (c) => ax > c.l - 28 && ax < c.l + w + 28 && ay > c.t - 28 && ay < c.t + h + 28;     // do not cover the attacker either
  const pick = ui.diceAnchor && ui.diceAnchor.seq === ui.shotSeq ? ui.diceAnchor : cand.find((c) => fits(c) && !hitsAtk(c)) ?? cand.find(fits) ?? cand[0];
  ui.diceAnchor = { l: pick.l, t: pick.t, seq: ui.shotSeq };
  const left = Math.min(Math.max(pick.l, 4), Math.max(4, W - w - 4)), top = Math.min(Math.max(pick.t, 4), Math.max(4, H - h - 4));
  ui.dicePos = { x: Math.round(left + w / 2 - W / 2), y: Math.round(top + h / 2 - H / 2) };
  box.style.transform = `translate(${ui.dicePos.x}px,${ui.dicePos.y}px)`;
}
export const isOpen = (key, auto) => (key in ui.fold ? ui.fold[key] : auto);
export const foldHead = (key, open, title, sum) => `<div class="fold" data-fold="${key}" title="свернуть / развернуть">${open ? '▾' : '▸'} <b>${title}</b>${open ? '' : ` <span class="fsum">${sum}</span>`}</div>`;
export const turnPoints = (shots) => shots.reduce((n, x) => n + (x.faces.missile ?? []).filter((i) => MISSILE_DIE[i].dmg === 0 || MISSILE_DIE[i].srm).length, 0);
// The unified shot window. One layout for the whole shot, filled from the top as the shot goes on:
//   header (target + what we are waiting for) → weapons (missile group first, then single weapons) → total line → armor → damage dice → decision zone
export function renderDice() {
  const s = st(), a = s.activation, el = $('dice'), p = s.pending, corr = !!(a && a.attack);
  if (!corr && !ui.lastShot) { el.innerHTML = ''; return; }
  const L = ui.lastShot, A = corr ? a.attack : null, tid = corr ? A.targetId : L.targetId, m = a && s.mechs[a.mechId];
  const tgt = targetOf(s, tid), tcls = tgt && !tgt.isBuilding ? CLASSES[tgt.cls].armor : null;
  // ---- the shots of the window in one shape
  let shots, evCuts, amsEv, coverEv, br = null;
  if (corr) {
    br = volleyBreakdown(s); evCuts = br.events.filter((e) => e.type === 'evade_cut'); amsEv = br.events.filter((e) => e.type === 'ams'); coverEv = br.events.find((e) => e.type === 'cover_cut');
    shots = A.shots.map((sh, si) => { const w = WEAPONS[wtype(m, sh.wid)]; return { si, name: esc(wname(wtype(m, sh.wid))), sub: w.sub ?? null, faces: sh.rolls, dist: sh.dist, left: correctionsLeft(s, a, m, tgt, w) }; });
  } else { evCuts = L.evCuts ?? []; amsEv = L.ams ?? []; coverEv = L.coverCut; shots = L.shots; }
  const total = corr ? { dmg: br.dmg, unb: br.unb } : (() => { const raw = L.shots.reduce((n, x) => n + (x.miss ? 0 : x.damage), 0), cut = evCuts.reduce((n, x) => n + x.cut, 0) + amsEv.reduce((n, x) => n + x.cut, 0) + (coverEv?.cut ?? 0); return { dmg: Math.max(0, raw - cut), unb: L.shots.reduce((n, x) => n + (x.unblockable ?? 0), 0) }; })();
  const dice = (x) => Object.entries(x.faces).flatMap(([k, v]) => v.map((f, i) => ({ k, f, i })));
  const shotHtml = (x) => corr
    ? `<div class="wgrp"><div class="dhead">${x.name} · дист ${x.dist}</div><div class="drow">${dice(x).map((d) => `<div class="d">${x.left ? `<button data-die="${x.si}:${d.k}:${d.i}" title="Корректировка: переброс этого куба">🔄 ${x.left}</button>` : '<span class="ph"></span>'}<img src="${img(WIMG[d.k](d.f))}" alt=""></div>`).join('')}</div></div>`
    : `<div class="wgrp"><div class="dhead">${x.name}</div><div class="drow">${dice(x).map((d) => `<div class="d"><img src="${img(WIMG[d.k](d.f))}" alt=""></div>`).join('')}</div><div class="dres">${shotResult(x)}${x.turns ? ` · поворот до ${x.turns}×60°` : ''}</div></div>`;
  const rawOf = (x) => (x.miss ? 0 : x.damage);
  const groupHtml = (sub, mem) => {                                    // a missile group: launchers, then the one cut chain of the whole group
    const ev = evCuts.find((e) => e.sub === sub), am = amsEv.find((e) => e.sub === sub);
    const raw = corr ? br.results.filter((r) => r.sub === sub).reduce((n, r) => n + r.dmg, 0) : mem.reduce((n, x) => n + rawOf(x), 0);
    const net = Math.max(0, raw - (ev?.cut ?? 0) - (am?.cut ?? 0));
    const pts = sub === 'lrm' ? turnPoints(mem) : 0, rating = sub === 'lrm' && tgt && !tgt.isBuilding ? rankOf(tgt) + (am?.devices ?? A?.ams?.lrm?.devices ?? 0) : 0;
    return `<div class="wgrp grp"><div class="dhead">${sub.toUpperCase()} ×${mem.length}</div>${mem.map(shotHtml).join('')}`
      + `<div class="chain">Σ ${raw}${ev ? ` → ${mini('tok_evade', 'evade', 'pi')} ${ev.tokens}${ev.ignored ? ` (−${ev.ignored} игнор)` : ''}: −${ev.cut}` : ''}${am ? ` → AMS: −${am.cut}` : ''} = <b>${net}</b></div>`
      + (am ? amsRow(am, `AMS vs ${sub.toUpperCase()}`) : '')
      + (sub === 'lrm' && pts ? `<div class="chain">поворот: ${pts} ÷ ${rating} → ${Math.floor(pts / Math.max(1, rating))} × 60°</div>` : '') + '</div>';
  };
  const order = ['lrm', 'srm'], groups = order.filter((k) => shots.some((x) => x.sub === k)), singles = shots.filter((x) => !order.includes(x.sub));
  const weaponsInner = `<div class="wcol">${groups.map((k) => groupHtml(k, shots.filter((x) => x.sub === k))).join('')}${coverEv ? `<div class="chain">🧱 укрытие ${coverEv.cover} на линии: ракеты залпа −${coverEv.cut}</div>` : ''}${singles.map(shotHtml).join('')}</div>`;
  const wSum = [...groups.map((k) => { const mem = shots.filter((x) => x.sub === k); return `${k.toUpperCase()} ×${mem.length}`; }), ...singles.map((x) => `${x.name}${corr ? '' : x.miss ? ' ✖' : ' ' + x.damage}`)].join(' · ');
  // ---- stage
  const hasArmor = !!(L && L.armor), hasBld = !!(L && L.building), dmgDice = !corr && L ? (p && p.type === 'TC_REROLL' ? p.faces.map((i) => DAMAGE_DIE[i]) : L.damage) : [];
  const tcFaces = !corr && p && p.type === 'TC_REROLL' && p.targetId === tid;
  const mine = !corr && p && p.targetId === tid && ['OS_DECISION', 'DEFENDER_DECISION', 'TC_REROLL', 'TURN_TARGET'].includes(p.type) ? p : null;
  const status = corr ? 'корректировка' : mine ? { OS_DECISION: `ждём игрока ${p.player}: Omni Shield`, DEFENDER_DECISION: `ждём игрока ${p.player}: принять урон или катапульта`, TC_REROLL: `ждём игрока ${p.player}: переброс TC`, TURN_TARGET: `ждём игрока ${p.player}: разворот цели` }[p.type] : 'завершено';
  let h = `<div class="dicebox${corr ? '' : ' res'}" style="transform:translate(${ui.dicePos.x}px,${ui.dicePos.y}px)"><div class="dhead dgrab" title="потяни, чтобы переместить окно">⠿ → ${name(tid)} <span class="dstat">· ${status}</span></div>`;
  const wOpen = isOpen('w', !hasArmor && !hasBld);
  h += (corr ? '' : foldHead('w', wOpen, 'Оружие', wSum)) + (corr || wOpen ? weaponsInner : '');
  const totLine = `урон по цели: <b>${total.dmg}</b>${total.unb ? ` (+${total.unb} без брони)` : ''}`;
  h += `<div class="dtotal">${corr ? 'ожидаемый ' : ''}${totLine}</div>`;
  if (!corr && hasBld) h += `<div class="dsub">Здание: урон ${L.building.damage} · ${L.building.destroyed ? 'разрушено → ' + (L.building.becomes === 'fire' ? 'огонь' : 'камни') : 'устояло (осталось ' + L.building.left + ')'}</div>`;
  if (!corr && hasArmor) {
    const ar = L.armor, aOpen = isOpen('a', !dmgDice.length);
    h += foldHead('a', aOpen, `Броня (${ar.rear ? 'тыл' : 'фронт'})`, `поглощено ${ar.absorbed}, прошло ${ar.through}`)
      + (aOpen ? `<div class="dsub">поглощено ${ar.absorbed}${ar.bonus ? ` (в т.ч. бонус ${ar.bonus})` : ''} · прошло ${ar.through}</div><div class="drow sm">${ar.faces.map((f, k) => `<div class="d"><img class="${ar.rolls[k] < tcls[f].v ? 'dim' : ''}" src="${img(ARMOR_IMG(f))}" alt="" title="${ar.rolls[k]}"></div>`).join('')}</div>` : '');
  }
  if (!corr && dmgDice.length) h += `<div class="dsub">Кубы урона${tcFaces ? ' — клик по кубу: переброс TC' : ''}</div><div class="drow sm">${dmgDice.map((f, i) => `<div class="d">${tcFaces ? `<button data-tc="reroll:${i}" style="margin:0;padding:0;border:0;background:none"><img src="${img(DMG_IMG[f])}" alt="" title="${FACE[f]}"></button>` : `<img src="${img(DMG_IMG[f])}" alt="" title="${FACE[f]}">`}</div>`).join('')}</div>`;
  // ---- the decision zone: always the last thing in the window
  h += '<div class="dzone">';
  if (corr) h += `<button data-do="resolve">✔ Завершить выстрел (урон ${total.dmg + total.unb}${total.unb ? `, из них без брони ${total.unb}` : ''})</button>`;
  else if (mine && mine.type === 'OS_DECISION') h += `<div class="dsub">Активировать <b>Omni Shield</b>: +1 ${ARMI} и +1 ${mini(TOK.overheat, 'overheat', 'pi')}?</div><button data-tc="use">🛡 Активировать OS</button><button data-tc="skip">Не активировать</button>`;
  else if (mine && mine.type === 'DEFENDER_DECISION') h += `<div class="dsub">${name(mine.targetId)} получает ${mine.dice} куб. урона</div><button data-do="take">Принять урон</button><button data-do="eject">Катапультироваться</button>`;
  else if (mine && mine.type === 'TC_REROLL') h += '<button data-tc="keep">Оставить как есть</button>';
  else if (mine && mine.type === 'TURN_TARGET') h += `<div class="dsub"><b>Повернуть цель</b> (до ${mine.turns} × 60°)</div>${turnButtons(mine)}`;
  else if (!p) h += '<button data-do="closeres">Закрыть</button>';
  h += '</div></div>';
  el.innerHTML = h;
  placeDice();
}
