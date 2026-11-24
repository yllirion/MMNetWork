// Settings and battle log windows.
import { $, esc, mini } from './dom.js';
import { st, ui } from './ui.js';
import { WEATHER } from '../core/weather.js';
import { fireSw } from './tooltip.js';

// ---- corner buttons: settings window, battle log window
export function renderSettings() {
  $('settings').innerHTML = `<h4>Настройки <button id="setClose" title="Закрыть">✕</button></h4>
    <button data-do="new">Новая игра</button>${ui.net ? ' <button data-do="link" title="Скопировать ссылку на эту партию для соперника">🔗 Ссылка на партию</button>' : ''}
    <div class="sec">Ввод перемещения на карте</div>
    ${[['zones', 'Зоны'], ['petals', 'Лепестки'], ['both', 'Оба']].map(([k, l]) => `<button data-imode="${k}" class="${ui.inputMode === k ? 'on' : ''}">${l}</button>`).join('')}
    ${ui.inputMode === 'petals' ? '' : `<br><small>мёртвая зона в центре ${Math.round(ui.dead * 100)}%</small> <input type="range" id="deadSlider" min="0" max="60" step="5" value="${Math.round(ui.dead * 100)}" style="width:110px;vertical-align:middle">`}
    <div class="sec">Подсказка на карте</div>
    <small>непрозрачность фона <b id="hintVal">${ui.hintAlpha}%</b></small> <input type="range" id="hintSlider" min="20" max="100" step="5" value="${ui.hintAlpha}" style="width:110px;vertical-align:middle">
    <div class="sec">Как двигаться</div>
    <small>Клик по соседнему гексу — шаг; положение курсора в гексе выбирает бесплатный поворот (центр — без поворота). Клик по краю своего меха — поворот на месте, по центру — режим прыжка; зажатая ПКМ — прыжок (отпусти над гексом).</small>
    <div class="sec">Клавиши</div>
    <small>W — вперёд · Q/E — вперёд + поворот · S — назад · A/D — поворот на месте · Space — режим прыжка · Z — отмена</small>`;
}
// the hint popup background follows the slider (a CSS variable, so no re-render is needed)
export const applyHintAlpha = () => document.documentElement.style.setProperty('--hint-alpha', ui.hintAlpha + '%');
export function showSettings(on) { $('settings').style.display = on ? 'block' : 'none'; $('btnSet').classList.toggle('on', on); if (on) renderSettings(); }
export function showLogWin() { $('logwin').style.display = ui.showLog ? 'block' : 'none'; $('roundbar').classList.toggle('on', ui.showLog); }

// ---- weather box in the top-left corner of the map: the name and the effect as icons
const WEATHER_FX = {
  normal: () => '',
  heatstorm: () => '+2 🌡',
  fog: () => `−1 🌡 ${fireSw(1)}`,
  storm: () => mini('tok_virtual_evade', 'virtual evade', 'pi'),
  dust: () => `2 ${mini('tok_blind', 'blind', 'pi')} ${fireSw(1)}`,
};
const WEATHER_TIP = {
  normal: 'без дополнительных эффектов',
  heatstorm: '+2 тепла за каждую активацию',
  fog: '−1 тепло за каждую активацию; все атаки считаются идущими через огонь',
  storm: 'каждый мех имеет дополнительный virtual evade',
  dust: 'в начале раунда каждый мех получает 2 жетона blind; все атаки считаются идущими через огонь',
};
export function renderWeather() {
  const s = st(), id = s.weather?.current ?? 'normal', w = WEATHER[id], left = s.weather?.fixed ? '' : ` · в колоде ${s.weather.deck.length}`;
  const html = `<b>☁ ${esc(w.name)}</b> ${WEATHER_FX[id]()}`;
  const el = $('weather'); if (el.innerHTML !== html) el.innerHTML = html;
  el.title = `Погода раунда: ${w.name} — ${WEATHER_TIP[id]}${left}`;
}
