// Static data of the client: dice images, Russian labels, small pure helpers.
import { CLASSES } from '../core/data/classes.js';
import { WEAPON_NAMES } from '../core/data/weapons.js';
import { key, neighbor as hexNeighbor } from '../core/hex.js';
import { signedTurn } from './moveinput.js';

export const COLORS = ['laser', 'ballistic', 'missile', 'jumpjet', 'move'];
export const CONV_LABEL = { triple: '3→1', any1: '1→1', pair: '2→1', toMove: '→ move', fromMove: 'move → оружие', tc: 'TC: оружие → другое' };
export const SYM = { laser: '⚡', ballistic: '●', missile: '➤', jumpjet: '⇧', move: '➜' };
export const WIMG = { // weapon die face index → image
  energy: (i) => `w_laser_${[1, 1, 1, 1, 2, 3][i]}damage`,
  ballistic: (i) => ['w_ballistic_0damage', 'w_ballistic_1damage_00', 'w_ballistic_1damage_000', 'w_ballistic_1damage', 'w_ballistic_2damage', 'w_ballistic_3damage'][i],
  missile: (i) => ['w_missile_0damage', 'w_missile_0damage', 'w_missile_2damage_srm', 'w_missile_2damage_srm', 'w_missile_2damage', 'w_missile_3damage'][i],
};
export const ARMOR_IMG = (i) => `armor_s${i + 1}`;                               // armor die face order = [0, 0, 1*, 1**, a, b]
export const DMG_IMG = { hit: 'dmg_hit', crit_control: 'dmg_crit_control', crit_armor: 'dmg_crit_armor', crit_cooling: 'dmg_crit_cooling' };
export const TOK = { overheat: 'tok_overheat', evade: 'tok_evade', virtual: 'tok_virtual_evade', anchor: 'tok_anchor', blind: 'tok_blind' };
export const TNAME = { plain: 'Стандартный гекс', rock: 'Камни', fire: 'Огонь', water: 'Вода', deepWater: 'Глубокая вода', building: 'Здание', cliff: 'Скалы', mud: 'Грязь', forest: 'Лес' };
export const FACE = { hit: 'повреждение', crit_control: 'крит: управление', crit_armor: 'крит: броня', crit_cooling: 'крит: охлаждение' };
export const CLS_RU = { light: 'Лёгкий', medium: 'Средний', heavy: 'Тяжёлый', assault: 'Штурмовой' };
export const SYS_RU = { control: 'Система управления', armor: 'Броня', cooling: 'Охлаждение' };
export const SYS_EFFECT = { control: '−1 куб пилотирования за уровень', armor: 'помеченные грани куба брони не работают', cooling: '−1 куб пилотирования; считается как жетон overheat при проверке перегрева' };
export const SYS_IMG = { control: 'dmg_crit_control', armor: 'dmg_crit_armor', cooling: 'dmg_crit_cooling' };
export const COOLER_RU = { standard: 'Standard', compact: 'Compact', double: 'Double' };
export // ---- mines: placing (minelayer) and moving them; dice are picked automatically (selected dice first)
const MINE_FACE_IMG = { overheat: 'mine_overheat', blind: 'mine_blind', anchor: 'mine_anchor', damage3: 'mine_3damage', unblock1: 'mine_unblock', turn2: 'mine_turn' };
export const MINE_FACE_TXT = { overheat: 'жетон overheat', blind: 'жетон blind', anchor: 'жетон anchor', damage3: '3 урона (броня работает)', unblock1: '1 неблокируемый урон', turn2: 'поворот на 2 × 60°' };
export const className = (rank) => Object.keys(CLASSES).find((k) => CLASSES[k].rank === rank);
export const wtype = (m, wid) => m.weapons.find((x) => x.id === wid).type;
export const wname = (type) => WEAPON_NAMES[type] ?? type;
export const CHEAP = ['jumpjet', 'move', 'missile', 'ballistic', 'laser'];       // which dice we spend first when any die will do
export const dirName = (m, c) => { const o = signedTurn(m.facing, [0, 1, 2, 3, 4, 5].find((d) => key(hexNeighbor(m.pos, d)) === key(c))); return o === 0 ? 'шаг вперёд' : Math.abs(o) === 1 ? `шаг вперёд-${o > 0 ? 'вправо' : 'влево'} (поворот + вход)` : 'шаг назад'; };
export const turnWord = (b, g) => { const k = signedTurn(b, g); return k === 0 ? 'без поворота' : Math.abs(k) === 3 ? 'разворот 180°' : `${k > 0 ? '↷ вправо' : '↶ влево'} ${60 * Math.abs(k)}°`; };
export const TURN_LAB = { none: 'Не поворачивать', 'L:1': '↺ 60°', 'L:2': '↺ 120°', 'L:3': '↺ 180°', 'R:1': '↻ 60°', 'R:2': '↻ 120°', 'R:3': '↻ 180°', 'flip:4': '180° + 1 урон без брони', 'flip:5': '180° + 2 урона без брони' };
// skill track (preparation: numbered cards) and the star counters
export const XP_RU = { last_hit: 'LAST HIT', massive: 'MASSIVE DAMAGE', flanking: 'FLANKING', tank: 'TANK', survivor: 'SURVIVOR' };
export const CLS_LETTER = { light: 'L', medium: 'M', heavy: 'H', assault: 'A' };
export const BAND_RU = { short: 'ближняя', medium: 'средняя', long: 'дальняя', out: 'ВНЕ ДАЛЬНОСТИ' };
export const ARMOR_PART = { target: 'гекс цели', line: 'на линии', nearer: 'Атака не в ближайшего видимого врага' };
export const bandTxt = (p) => `<b style="color:${p.band === 'out' ? '#e25555' : 'inherit'}">${BAND_RU[p.band]}</b>`;
export const CLASS_EN = { light: 'Light', medium: 'Medium', heavy: 'Heavy', assault: 'Assault' };
