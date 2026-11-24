// Weather. A deck of 23 cards is shuffled at the start of the game; at the start of every round one card is drawn and becomes
// the weather of the round. "No change" keeps the weather of the previous round (normal in round 1). Replaced weather cards
// and played "no change" cards go to the discard, which is shuffled into a new deck when the deck runs out.
export const WEATHER = {
  normal:    { name: 'Нормальная', count: 10 },
  heatstorm: { name: 'Тепловой шторм', count: 2, heat: 2 },                  // +2 heat in every activation
  fog:       { name: 'Туман', count: 2, heat: -1, fire: 1 },                 // −1 heat in every activation; every attack goes through fire
  storm:     { name: 'Гроза', count: 2, virtual: 1 },                       // every mech has one more virtual evade
  dust:      { name: 'Пылевая буря', count: 2, blind: 2, fire: 1 },         // every mech gets 2 blind tokens; every attack goes through fire
  same:      { name: 'Погода не меняется', count: 5 },
};
const shuffle = (rng, a) => { for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function initWeather(rng) {
  const deck = Object.entries(WEATHER).flatMap(([id, w]) => Array(w.count).fill(id));
  return { deck: shuffle(rng, deck), discard: [], current: 'normal', card: null };   // card = the weather card lying in play
}
export const weatherOf = (s) => WEATHER[s.weather?.current ?? 'normal'];

// start of a round: draw, apply round-start effects (dust storm: 2 blind tokens to every active mech)
export function weatherRoundStart(s, rng, events) {
  const W = s.weather; if (!W) return;
  if (W.fixed) { applyRoundEffects(s, events); return; }                      // scenarios / tests with a fixed weather
  if (!W.deck.length) { W.deck = shuffle(rng, W.discard); W.discard = []; events.push({ type: 'weather_reshuffled' }); }
  const drawn = W.deck.pop();
  if (drawn === 'same') { W.discard.push(drawn); events.push({ type: 'weather', weather: W.current, same: true, round: s.round }); }
  else { if (W.card) W.discard.push(W.card); W.card = drawn; W.current = drawn; events.push({ type: 'weather', weather: drawn, same: false, round: s.round }); }
  applyRoundEffects(s, events);
}
function applyRoundEffects(s, events) {
  const w = weatherOf(s);
  for (const m of Object.values(s.mechs)) m.weatherVirtual = w.virtual ?? 0;           // read by evadeOf
  if (w.blind) for (const m of Object.values(s.mechs)) if (m.status === 'active') { m.blind = (m.blind ?? 0) + w.blind; events.push({ type: 'blind', mechId: m.id, n: m.blind, added: w.blind, why: 'weather' }); }
}
