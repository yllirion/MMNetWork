// The side panel (actions of the activation) and the skills track.
import { correctionsLeft, volleyDamage } from '../core/attack.js';
import { CLASSES } from '../core/data/classes.js';
import { DAMAGE_DIE } from '../core/data/dice.js';
import { WEAPONS } from '../core/data/weapons.js';
import { skillBudget, mustShutdown, CONVERSIONS } from '../core/engine.js';
import { MINE_FACES } from '../core/mines.js';
import { actionsAvailable } from '../core/movement.js';
import { pilotsInHand } from '../core/pilots.js';
import { RULES } from '../core/rules.js';
import { SKILLS, skillCard } from '../core/skills.js';
import { targetOf, systemsOn } from '../core/state.js';
import { $, esc, img, mini } from './dom.js';
import { COLORS, CONV_LABEL, DMG_IMG, FACE, MINE_FACE_IMG, MINE_FACE_TXT, TOK, TURN_LAB, className, wname, wtype } from './labels.js';
import { myInput, name, ok, st, ui } from './ui.js';
import { canPay, convUseful, firstMove, jumpPip, minePipsPlace, moveCommit } from './actions.js';
import { canStart } from './legal.js';
import { netStatus } from './session.js';

// ---- side panel
export const chip = (p) => `<span class="chip ${p.spent ? 'spent' : ''} ${ui.sel.has(p.id) ? 'sel' : ''} ${p.origin === 'converted' ? 'conv' : ''}" data-chip="${p.id}"><img src="${img(p.color + (p.evade ? '_e' : ''))}" alt="${p.color}" title="${p.color}${p.evade ? ' + evade' : ''}"></span>`;
export const colorBtn = (c, attrs) => `<button ${attrs}><img src="${img(c)}" alt="${c}" title="${c}"></button>`;
export const ARMI = mini('icon_armor', 'бонусная броня', 'pi');      // bonus armor icon used in texts instead of «ЕБ»
export const costIcons = (def) => def.payWith ? `<b>(${def.moveCost} ДД)</b>` : def.pips.map((c) => mini(c, c, 'pi')).join('');
export const turnButtons = (p) => p.options.map((o) => `<button data-tc="${o}">${TURN_LAB[o]}</button>`).join('');
export function renderSkills(s) {
  const a = s.activation, left = a && a.phase === 'PLAY' && !a.attack && !s.pending ? skillBudget(a) - a.evadeSpent : null;   // evade of the roll + pilot skill (only with evade), minus what is already assigned
  $('skills').innerHTML = (s.skills?.track ?? Array(10).fill(null)).map((c, i) => {
    const cost = SKILLS.costs[i], can = left != null && c != null && cost != null && cost <= left;
    const tip = c == null ? 'пусто' : cost == null ? 'X: купить нельзя' : left == null ? `стоимость ${cost} ${'evade'} (покупка — в свою активацию)` : `купить за ${cost} (свободно ${left}: evade ${a.initialEvade}${a.initialEvade ? ' + навык пилота ' + a.pilotSkill : ', без evade навык пилота не считается'} − уже ${a.evadeSpent})`;
    const sc = c == null ? null : skillCard(c);
    const face = c == null ? '' : sc ? `<img class="skimg" src="${img('skill_' + sc.id)}" alt="${sc.name}">` : '№' + c;
    return `<div class="slot${c == null ? ' empty' : ''}${can ? ' can' : ''}${sc ? ' real' : ''}" ${can ? `data-skill="${i}"` : ''} title="${sc ? `${sc.name}: ${sc.text}\n` : ''}${tip}"><span class="cost">${cost ?? 'X'}</span>${face}</div>`;
  }).join('');
  const star = (p) => `<span class="p${p}" title="опыт игрока ${p}; карт навыков: ${s.hands?.[p]?.length ?? 0}">И${p} ★ ${s.stars?.[p] ?? 0}${s.hands?.[p]?.length ? ` 🃏${s.hands[p].length}` : ''}</span>`;
  $('st1').innerHTML = star(s.players[0]); $('st2').innerHTML = star(s.players[1]);
}
export function panel() {
  const s = st(), a = s.activation, p = s.pending, m = a && s.mechs[a.mechId];
  let h = (ui.flashMsg ? `<div class="box flash">✖ ${esc(ui.flashMsg)}</div>` : '') + '<div class="box">';
  renderSkills(s);
  $('roundbar').innerHTML = `▽ <b>Раунд ${s.round}</b> · класс <b>${className(s.turn.rank)}</b> · ходит <span class="p${s.turn.player}">игрок ${s.turn.player}</span>${netStatus()} ▽`;
  $('side').classList.toggle('locked', !myInput());
  if (s.winner !== null) h += `<b>Игра окончена: ${s.winner ? 'победил игрок ' + s.winner : 'ничья'}</b>`;
  else if (p && ui.lastShot && p.targetId === ui.lastShot.targetId && ['OS_DECISION', 'DEFENDER_DECISION', 'TC_REROLL', 'TURN_TARGET'].includes(p.type)) h += `<span class="p${p.player}">Игрок ${p.player}</span>: ждём решения — ${{ OS_DECISION: 'Omni Shield', DEFENDER_DECISION: 'принять урон или катапульта', TC_REROLL: 'переброс TC', TURN_TARGET: 'разворот цели' }[p.type]} (в окне выстрела).`;
  else if (p && p.type === 'MINE_CHOICE') h += `<span class="p${p.player}">Игрок ${p.player}</span> (хозяин мины): мина детонирует под ${name(p.targetId)}. Выбери один из двух кубов:<br>${p.faces.map((f, i) => `<button data-mine="${i}" style="display:inline-flex;align-items:center;gap:6px;margin:4px 4px 0 0"><img src="${img(MINE_FACE_IMG[MINE_FACES[f]])}" style="width:38px;height:38px" alt=""> ${MINE_FACE_TXT[MINE_FACES[f]]}</button>`).join('')}`;
  else if (p && p.type === 'TC_REROLL') h += `<span class="p${p.player}">Игрок ${p.player}</span>: TC — кубы урона по ${name(p.targetId)}. Перебросить один?<br>${p.faces.map((f, i) => `<button data-tc="reroll:${i}">↻ ${mini(DMG_IMG[DAMAGE_DIE[f]], '', 'pi')} ${FACE[DAMAGE_DIE[f]]}</button>`).join('')}<br><button data-tc="keep">Оставить как есть</button>`;
  else if (p && p.type === 'TURN_TARGET') {
    h += `<span class="p${p.player}">Игрок ${p.player}</span>: можно повернуть ${name(p.targetId)} (до ${p.turns} × 60°).<br>` + (ui.lastShot ? '<small>Варианты — в окне выстрела.</small>' : turnButtons(p));
  }
  else if (p && p.type === 'OS_DECISION') h += `<span class="p${p.player}">Игрок ${p.player}</span>: по ${name(p.targetId)} будет бросок брони (урон ${p.hit.damage}). Активировать <b>Omni Shield</b>: +1 ${ARMI} и +1 ${mini(TOK.overheat, 'overheat', 'pi')}?<br><button data-tc="use">🛡 Активировать OS</button><button data-tc="skip">Не активировать</button>`;
  else if (p) h += `<span class="p${p.player}">Игрок ${p.player}</span>: ${name(p.targetId)} получает ${p.dice} куб. урона.<br><button data-do="take">Принять урон</button><button data-do="eject">Катапультироваться</button>`;
  else if (!a && ui.chosenMech && canStart(s.mechs[ui.chosenMech])) {
    const hand = pilotsInHand(s, s.turn.player);
    h += `<b>${name(ui.chosenMech)}</b>: выбери пилота — карточки на токене меха: клик по карточке — активация с броском пилотирования, красная кнопка ⏻ под карточкой — экстренное отключение.${hand.length ? '' : ' Пилотов в руке нет.'}<br><small>Клик по другому подсвеченному меху — выбрать его; клик мимо — отмена.</small>`;
  }
  else if (!a) h += 'Кликни по подсвеченному меху, чтобы выбрать его для активации.';
  else {
    h += `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span><b>${name(m.id)}</b> (скорость ${esc(m.speed)})</span><span>${ui.g.canUndo() ? '<button data-do="undo" style="margin:0 4px 0 0">↶ Отменить</button>' : ''}${a.phase === 'PLAY' && !a.attack ? '<button data-do="end" style="margin:0">✔ Закончить активацию</button>' : ''}</span></div>`;
    if (a.phase === 'ROLL') h += mustShutdown(m) ? '<br><b>Перегрев:</b> нужно экстренное отключение — красная кнопка на токене меха.' : '<br>Кнопки на токене меха: <span style="color:#2fa84f"><b>зелёная</b></span> — бросок пилотирования, <span style="color:#d63838"><b>красная</b></span> — экстренное отключение.';
    if (a.phase === 'DISCARD') h += `<br>Сбросьте кубов: <b>${a.mustDiscard}</b> (выбери и нажми)<button data-do="discard" ${ui.sel.size === a.mustDiscard ? '' : 'disabled'}>Сбросить</button>`;
    if (a.pool.length) h += '<div>' + a.pool.map(chip).join('') + '</div>';
    if (a.phase === 'PLAY' && a.attack) {      // fire correction window (the dice themselves are in the middle of the field)
      const A = a.attack;
      const per = A.shots.map((sh, i) => { const w = WEAPONS[wtype(m, sh.wid)]; return { i, w, left: correctionsLeft(s, a, m, targetOf(s, A.targetId), w) }; });
      h += `<div><b>Корректировка огня</b>${a.ccUsed ? ' (CC использован)' : ''}. Корректировка стоит те же кубы, что и активация оружия. Клик 🔄 над кубом оружия — переброс. Если нужного цвета нет, CC заменит один куб: сначала выбери его в пуле.<br>
        ${!RULES.ignoreEvadeCorrection ? '' : per.map((x) => `<button data-do="ignore:${x.i}" ${x.left ? '' : 'disabled'}>Игнор evade: ${esc(wname(wtype(m, A.shots[x.i].wid)))} (осталось ${x.left}; ${x.w.pips.map((c) => mini(c, c, 'pi')).join('')})</button>`).join('')}<button data-do="resolve">✔ Завершить выстрел (урон ${(() => { const v = volleyDamage(s, a); return v.dmg + v.unb; })()})</button></div>`;
    } else if (a.phase === 'PLAY') {
      const nm = [...ui.sel].filter((id) => a.pool.find((x) => x.id === id && x.color === 'move')).length;
      const ab = CLASSES[m.cls].abilities, jjLeft = (m.equipment.jumpjets ?? 0) - a.jumpsUsed;
      const kinds = Object.entries(CONVERSIONS).filter(([, c]) => (!c.limit || (ab[c.limit] ?? 0) > (a.conv[c.limit] ?? 0)) && (!c.equipment || (m.equipment[c.equipment] && !a.tcUsed)));
      const convTip = [...ui.sel].some((id) => a.pool.find((x) => x.id === id)?.origin === 'converted') ? 'куб, полученный заменой, менять дальше нельзя' : '(выбери кубы; можно сразу несколько)';
      h += `<div>Замены: ${kinds.map(([k, c]) => `<button data-conv="${k}" class="${ui.conv === k ? 'on' : ''}" title="${convTip}" ${convUseful(k, c) ? '' : 'disabled'}>${CONV_LABEL[k]}${c.limit ? ' (' + ((ab[c.limit] ?? 0) - (a.conv[c.limit] ?? 0)) + ')' : ''}</button>`).join('')}`;
      if (ui.conv) h += '<br>в: ' + (CONVERSIONS[ui.conv].to ?? COLORS).map((c) => colorBtn(c, `data-to="${c}" ${ok({ type: 'CONVERT', kind: ui.conv, pipIds: [...ui.sel], to: c }) ? '' : 'disabled'}`)).join('');
      h += `</div><div>Действий движения: <b>${actionsAvailable(m, a)}</b> · move-кубов в запасе ${a.movePips}<br><button data-do="commit" ${moveCommit(m, a).gain ? '' : 'disabled'} title="все полезные кубы move станут действиями движения; лишний куб, не дающий ДД, не тратится">Получить ${moveCommit(m, a).gain} ДД</button>
        ${m.equipment.masc ? `<button data-do="masc" ${!a.masc && firstMove() ? '' : 'disabled'} title="заберёт первый свободный куб move: он даст 2 ДД и 1 тепло; один раз за активацию">+2 ДД за move: MASC (+1🌡)${a.masc ? ' ✔' : ''}</button>` : ''}
        <button data-do="vev" ${ok({ type: 'VIRTUAL_EVADE' }) ? '' : 'disabled'}>${mini(TOK.virtual, 'virtual evade', 'pi')} (${2 + (m.anchor > 0 ? 1 : 0)} ДД)</button>
        
        ${(m.equipment.jumpjets ?? 0) > 0 ? `<br><button data-do="jumpmode" class="${ui.jumpMode ? 'on' : ''}" ${jjLeft > 0 && jumpPip() ? '' : 'disabled'} title="${jjLeft > 0 ? 'нужен куб ⇧ (можно получить заменой)' : 'прыжковые двигатели уже использованы'}">⇧ Прыжок (двигателей: ${Math.max(0, jjLeft)})</button>${ui.jumpMode ? ' <small>выбери соседний голубой гекс или свой (прыжок на месте) · 2🌡, +1 virtual evade</small>' : ''}` : ''}</div>
        ${m.equipment.ga ? `<div><button data-do="gamode" class="${ui.gaMode ? 'on' : ''}" ${a.gaUsed || !systemsOn(m) ? 'disabled' : ''} title="радиус любой: каждый мех в радиусе (и сам) получает ${'anchor'}, источник бросает по энергетическому кубу за единицу радиуса — 1–3 тепла с куба">⚓ ${ui.gaMode ? 'Выключить GA' : 'Включить GA'}${a.gaUsed ? ' ✔' : ''}</button>${ui.gaMode ? `<br><small>наведи на гекс: расстояние до него = радиус; клик — активировать</small>` : ''}</div>` : ''}
        <div>Оружие:<br>${m.weapons.map((w) => `<button data-w="${w.id}" class="${ui.armed.includes(w.id) ? 'on' : ''}" ${a.fired.includes(w.id) || (!ui.armed.includes(w.id) && !canPay(m, a, w.id)) ? 'disabled' : ''} title="${canPay(m, a, w.id) ? '' : 'не хватает кубов пилотирования'}">${a.fired.includes(w.id) ? '✔ ' : ''}${esc(wname(w.type))} ${costIcons(WEAPONS[w.type])}</button>`).join('')}${(m.equipment.minelayer ?? 0) > 0 ? `<button data-minemode="place" class="${ui.mineMode === 'place' ? 'on' : ''}" ${a.minesPlaced >= m.equipment.minelayer || (!minePipsPlace() && ui.mineMode !== 'place') ? 'disabled' : ''} title="ставит мину на соседний свободный гекс">${a.minesPlaced >= m.equipment.minelayer ? '✔ ' : ''}Миноукладчик ${costIcons({ pips: ['laser', 'missile'] })}</button>` : ''}${ui.mineMode === 'place' ? '<br><small>выбери соседний свободный гекс для мины (зелёный пунктир)</small>' : ''}${ui.mineSel ? '<br><small>мина выбрана: кликни соседний гекс (зелёный пунктир); каждый шаг — кубы laser / ballistic / missile, скорость 1. Клик по значку ✓ на мине — снять выбор.</small>' : ui.legal.mineSel.size ? '<br><small>свои мины, которые можно сдвинуть, обведены жёлтым — кликни по значку ✥ на мине (если мех не может шагнуть в её гекс, подойдёт клик по всему гексу)</small>' : ''}
        ${m.equipment.tc ? `<br><small>TC ${a.tcUsed ? 'использован' : 'готов: подойдёт куб любого цвета для одной атаки'}</small>` : ''}</div>
        <div>Таран:<br>
          <button data-ram="move" class="${ui.ramMode === 'move' ? 'on' : ''}" ${a.ramUsed ? 'disabled' : ''}>Таран (${2 + ui.ramExtra + (m.anchor > 0 ? 1 : 0)} ДД)</button>
          ${(m.equipment.jumpjets ?? 0) > 0 ? `<button data-ram="jump" class="${ui.ramMode === 'jump' ? 'on' : ''}" ${a.ramUsed || a.pool.filter((p) => !p.spent && p.color === 'jumpjet').length < 2 + ui.ramExtra ? 'disabled' : ''}>Таран с JJ (${2 + ui.ramExtra} ⇧)</button>` : ''}
          доп.: <button data-ramx="-1" ${ui.ramExtra > 0 ? '' : 'disabled'}>−</button> <b>${ui.ramExtra}</b> <button data-ramx="1" ${ui.ramExtra < 4 ? '' : 'disabled'}>+</button>
          ${ui.ramMode ? '<br><small>выбери соседнего врага (оранжевая рамка)</small>' : ''}</div>
        `;
    }
  }
  $('panel').innerHTML = h + `</div>${ui.g.canUndo() && !(a && !p && s.winner === null) ? '<div><button data-do="undo">↶ Отменить</button></div>' : ''}`;
}
