// The battle log.
import { CLASSES } from '../core/data/classes.js';
import { ENERGY_DIE, BALLISTIC_DIE, MISSILE_DIE } from '../core/data/dice.js';
import { $, esc, img, mini } from './dom.js';
import { ARMOR_IMG, DMG_IMG, FACE, MINE_FACE_IMG, MINE_FACE_TXT, TOK, WIMG, XP_RU, className, wname, wtype } from './labels.js';
import { WEATHER } from '../core/weather.js';
import { skillCard } from '../core/skills.js';
import { name, st } from './ui.js';
import { targetOf } from '../core/state.js';
import { ARMI } from './panel.js';

export function log(html) { const d = document.createElement('div'); d.innerHTML = html; $('log').prepend(d); }

export const fmtDie = { energy: (i) => ENERGY_DIE[i] + '🌡', ballistic: (i) => { const f = BALLISTIC_DIE[i]; return f.dmg + (f.missMid ? '**' : f.missLong ? '***' : ''); },
  missile: (i) => { const f = MISSILE_DIE[i]; return f.dmg + (f.srm ? 'ˢ' : ''); } };
export const weaponMinis = (rolls) => Object.entries(rolls).flatMap(([k, v]) => v.map((i) => mini(WIMG[k](i), fmtDie[k](i)))).join('');
// «игрок N» in the colour of that player
const pl = (p, word = 'игрок') => `<span class="p${p}">${word} ${p}</span>`;
export function logEvent(e) {
  const s = st();
  const n = (id) => { const o = targetOf(s, id)?.owner; return o ? `<span class="p${o}">${name(id)}</span>` : name(id); };   // mech names in the colour of their player
  const t = {
    activation_started: () => `▶ ${n(e.mechId)} активируется`,
    pilot_assigned: () => `👤 в ${n(e.mechId)} садится пилот ${esc(e.name)} (навык ${e.skill})`,
    pilot_fate: () => `👤 пилот ${esc(e.name)}${e.random ? ' (случайный из руки — мех ещё не активировался)' : ''} ${e.fate === 'dead' ? '<b>погиб</b> вместе с мехом' : 'выбыл из боя — <b>в резерве</b>'} (${n(e.mechId)})`,
    pilot_roll: () => `🎲 ${e.dice.map((d) => mini(d.color + (d.evade ? '_e' : ''), d.color)).join('')}${e.mustDiscard ? ` (сбросить ${e.mustDiscard})` : ''}`,
    moved: () => `${n(e.mechId)} шаг (цена ${e.cost})`, turned: () => `${n(e.mechId)} поворот`, jumped: () => `⇧ ${n(e.mechId)} ${e.inPlace ? 'прыжок на месте' : 'прыжок'}`,
    attack: () => `💥 ${n(e.attackerId)} → ${n(e.targetId)} [${esc(wname(wtype(s.mechs[e.attackerId], e.weapon)))}] дист ${e.dist} (${e.band}) ${weaponMinis(e.faces)} ${e.miss ? 'ПРОМАХ' : 'урон ' + e.damage + (e.unblockable ? '+' + e.unblockable : '')}`,
    attack_rolled: () => `🎲 ${n(e.attackerId)}: ${e.shots.map((x) => `[${esc(wname(wtype(s.mechs[e.attackerId], x.weapon)))}] ${weaponMinis(x.rolls)}`).join(' ')} — можно корректировать`, rerolled: () => `↻ переброс → ${weaponMinis(e.rolls)}`,
    ignored_evade: () => `◇ игнор evade (всего ${e.total})`, masc: () => `${n(e.mechId)}: MASC — 2 ДД, +1 тепло`, mass_activation: () => `${n(e.mechId)}: массовая активация (${e.color}) — орудий ${e.weapons.length}${e.extraHeat ? `, штраф +${e.extraHeat} тепла` : ''}`, tc_used: () => `TC: смена типа действия атаки`,
    cc_used: () => `CC (${n(e.ccMechId)}): куб заменён для корректировки${e.extraHeat ? ', +1 тепло' : ''}`, tc_reroll: () => `TC: переброс куба урона №${e.index + 1}`,
    armor: () => { const c = CLASSES[s.mechs[e.targetId].cls].armor;
      return e.faces.length ? `🛡 ${n(e.targetId)} (${e.rear ? 'тыл' : 'фронт'}) ${e.faces.map((f, k) => mini(ARMOR_IMG(f), '', e.rolls[k] < c[f].v ? 'mini dim' : 'mini')).join('')} поглощено ${e.absorbed}${e.bonusArmor ? ` (в т.ч. бонус ${e.bonusArmor})` : ''}, прошло ${e.through}`
        : `🛡 ${n(e.targetId)}: бонус брони ${e.bonusArmor}, прошло ${e.through}`; },
    decision_required: () => e.kind === 'os' ? `⚠ ${pl(e.player, 'игрок')}: Omni Shield — активировать до броска брони?` : e.kind === 'turn_target' ? `⚠ ${pl(e.player, 'игрок')}: поворот цели (до ${e.turns} × 60°)` : e.kind === 'tc_reroll' ? `⚠ ${pl(e.player, 'игрок')}: TC — переброс куба урона?` : `⚠ ${pl(e.player, 'игрок')}: катапульта или принять ${e.dice} куб. урона`,
    damage_die: () => `${mini(DMG_IMG[e.face], FACE[e.face])} ${FACE[e.face]}`, destroyed: () => `☠ ${n(e.mechId)} уничтожен`, ejected: () => `🪂 ${n(e.mechId)} катапультировался`,
    disabled: () => `✖ ${n(e.mechId)} выведен из строя`, detonation_hit: () => `🔥 детонация → ${n(e.targetId)}: ${weaponMinis({ missile: e.faces ?? [] })} урон ${e.damage}`,
    cover_cut: () => `🧱 укрытие ${e.cover} на линии: ракеты залпа теряют −${e.cut} урона`,
    evade_cut: () => `🌀 evade цели (${e.sub.toUpperCase()}): ${mini('tok_evade', 'evade', 'pi')}${e.tokens}${e.ignored ? `, проигнорировано ${e.ignored}` : ''} → −${e.cut} урона ракет залпа`,
    ams: () => `🛰 AMS цели (${e.sub.toUpperCase()}): ${weaponMinis({ ballistic: e.faces })} −${e.cut} урона ракет`,
    target_turned: () => e.steps ? `↻ ${n(e.mechId)} повёрнут: ${e.flip ? '180°' : e.steps * 60 + '°'}${e.unblockable ? `, +${e.unblockable} неблокируемого урона` : ''}` : `${n(e.mechId)} не повёрнут`,
    star: () => `★ ${pl(e.player, 'игрок')} получает звезду: <b>${XP_RU[e.kind]}</b> (${n(e.mechId)}), всего ${e.total}`,
    skill_effect: () => `🃏 ${n(e.mechId)}: ${e.color ? `+ куб пилотирования ${mini(e.color, e.color, "pi")} (как от замены)` : `+${e.virtual} ${mini('tok_virtual_evade', 'virtual evade', 'pi')}`}`,
    skill_bought: () => `🃏 ${pl(e.player, 'игрок')} (${n(e.mechId)}) покупает навык ${skillCard(e.card)?.name ?? '№' + e.card} за ${e.cost} evade (свободно ${e.evadeLeft}; жетоны меха остаются)`,
    mine_placed: () => `${n(e.mechId)} ставит мину`, mine_moved: () => `${n(e.mechId)} двигает мину`,
    forest_burns: () => `🔥 лес (${e.hex.q},${e.hex.r}) загорелся — ${{ energy: 'энергетический куб 2/3 тепла', flamer: 'огнемёт', mine: 'мина: overheat', explosion: 'взрыв меха' }[e.why] ?? e.why}`,
    mine_removed: () => `мина ${pl(e.owner, 'игрока')} уничтожена (${{ fire: 'сгорела в огне', shot: 'по ней попали' }[e.why] ?? e.why})`,
    mine_detonation: () => `💥 мина ${pl(e.owner, 'игрока')} детонирует под ${n(e.targetId)}: кубы ${e.faces.map((f) => `<img class="pi" src="${img(MINE_FACE_IMG[f])}" alt="${f}">`).join(' ')}`,
    mine_effect: () => `мина → ${n(e.targetId)}: <img class="pi" src="${img(MINE_FACE_IMG[e.face])}" alt=""> ${MINE_FACE_TXT[e.face]}`,
    anchor_token: () => `${n(e.mechId)} получает ${mini(TOK.anchor, 'anchor', 'pi')} (мина), всего ${e.n}`,
    skills_expired: () => `🃏 навыки ${pl(e.player, 'игрока')} на одну активацию: ${e.cards.map((c) => '№' + c).join(', ')} уходят в сброс`,
    skill_discarded: () => `🃏 навык №${e.card} уходит в сброс`, skills_refilled: () => `🃏 трек навыков: ${e.shifted ? 'карты сдвинуты вверх' : ''}${e.dealt.length ? (e.shifted ? ', ' : '') + 'сдано ' + e.dealt.map((c) => '№' + c).join(', ') : ''}`, skills_reshuffled: () => `🃏 колода пуста: сброс перемешан в новую колоду (${e.size})`,
    heat_control: () => `🌡 ${n(e.mechId)}: нагрев ${e.generated} при ёмкости ${e.capacity}; жетонов overheat ${e.tokensAdded ? '+' + e.tokensAdded : '+0'}, остыло ${e.cooled ?? 0}; было ${e.before ?? '?'} → стало ${e.overheat}${e.overflow ? ', ПЕРЕГРЕВ (урон ' + e.overflow + ')' : ''}`,
    overheat_token: () => `🌡 ${n(e.mechId)} получает ${mini('tok_overheat', 'overheat', 'pi')}${e.n > 1 ? ' ×' + e.n : ''} (${{ start_in_fire: 'активация в огне', enter_fire: 'вход в огонь', flamer: 'огнемёт', ga: 'GA', os: 'OS', mine: 'мина', fire_appeared: 'под ним загорелся лес' }[e.why] ?? 'вход в огонь'})`,
    ga_used: () => `⚓ ${n(e.mechId)}: GA, радиус ${e.radius} — ${mini('tok_anchor', 'anchor', 'pi')} получают: ${e.affected.map(n).join(', ')}${e.faces ? `; тепло ${e.faces.map((f) => mini(WIMG.energy(f), 'энергетический куб', 'pi')).join('')} = +${e.heat}` : ''}`, os_used: () => `🛡 ${n(e.mechId)}: Omni Shield — +1 ${ARMI}`,
    blind: () => `${n(e.mechId)} получает ${mini('tok_blind', 'blind', 'pi')}${e.added > 1 ? ' ×' + e.added : ''} (${e.why === 'mine' ? 'мина' : e.why === 'weather' ? 'пылевая буря' : 'детонация'}), всего ${e.n}`, blind_lost: () => `${n(e.mechId)} теряет ${mini('tok_blind', 'blind', 'pi')} (осталось ${e.left})`,
    building_hit: () => `🏢 здание (${e.hex.q},${e.hex.r}): урон ${e.damage}${e.destroyed ? ` → разрушено, теперь ${e.becomes === 'fire' ? 'огонь' : 'камни'}` : `, осталось ${e.left}`}`,
    ram: () => `🐏 ${n(e.attackerId)} таранит ${n(e.targetId)}${e.via === 'jump' ? ' (JJ)' : ''}: урон ${e.damage}${e.extra ? ` (доп. ${e.extra})` : ''}`,
    weather: () => `☁ погода раунда ${e.round}: <b>${esc(WEATHER[e.weather].name)}</b>${e.same ? ' (не меняется)' : ''}`, weather_reshuffled: () => '☁ колода погоды перемешана из сброса',
    round_started: () => `═══ раунд ${e.round} ═══`, class_started: () => `— класс ${className(e.rank)} —`,
    game_over: () => `🏁 ${e.winner ? 'победил ' + pl(e.winner) : 'ничья'}`, emergency_shutdown: () => `${n(e.mechId)}: экстренное отключение`,
  }[e.type];
  if (t) log(t());
}
