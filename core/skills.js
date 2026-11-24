// Skill carousel (preparation): a deck of numbered cards and a cost track. Cards are plain numbers for now; buying comes later.
// Track position i (0 = top) has cost SKILLS.costs[i]; null = "X" (cannot be bought). The track is shared by both players.
export const SKILLS = { total: 23, track: 10, costs: [2, 3, 4, 5, 6, 7, 8, 9, 10, null] };   // ASSUMPTION: costs rise by 1 from 2, the 10th card is X

// Real skill cards (one of each in the deck for now); the other card numbers are still blank placeholders.
// EXTRA B / L / M / R: a "converted" pilot die of that colour (cannot be converted again); EXTRA E: +1 virtual evade.
export const SKILL_CARDS = {
  1: { id: 'extra_b', name: 'EXTRA B', pip: 'ballistic', text: 'куб пилотирования ballistic (как полученный заменой)' },
  2: { id: 'extra_l', name: 'EXTRA L', pip: 'laser', text: 'куб пилотирования laser (как полученный заменой)' },
  3: { id: 'extra_m', name: 'EXTRA M', pip: 'move', text: 'куб пилотирования move (как полученный заменой)' },
  4: { id: 'extra_r', name: 'EXTRA R', pip: 'missile', text: 'куб пилотирования missile (как полученный заменой)' },
  5: { id: 'extra_e', name: 'EXTRA E', virtual: 1, text: '+1 virtual evade меху' },
};
export const skillCard = (n) => SKILL_CARDS[n] ?? null;
const shuffle = (rng, a) => { for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Start of the battle: shuffle the deck, deal 10 cards to the track.
export function initSkills(rng) {
  const deck = shuffle(rng, Array.from({ length: SKILLS.total }, (_, i) => i + 1));
  return { deck, track: deck.splice(0, SKILLS.track), discard: [] };
}

// Start of a round (from round 2 on): the card on the topmost occupied position leaves the track for the discard pile; then the track closes up and refills.
export function skillsRoundStart(s, rng, events) {
  const k = s.skills; if (!k) return;
  const i = k.track.findIndex((c) => c != null);
  if (i < 0) return;
  const card = k.track[i]; k.track[i] = null; k.discard.push(card);
  events.push({ type: 'skill_discarded', card, pos: i });
  skillsRefill(s, rng, events);                 // the track shifts up and the free bottom position is dealt a new card
}

// End of an activation: cards move UP into the empty positions, then new cards are dealt to the freed bottom positions.
// An empty deck is rebuilt from the discard pile (shuffled).
export function skillsRefill(s, rng, events) {
  const k = s.skills; if (!k) return;
  const cards = k.track.filter((c) => c != null), shifted = cards.length < SKILLS.track && k.track.some((c, i) => c == null && k.track.slice(i).some((x) => x != null));
  const dealt = [];
  while (cards.length < SKILLS.track) {
    if (!k.deck.length) {
      if (!k.discard.length) break;
      k.deck = shuffle(rng, k.discard.splice(0)); events.push({ type: 'skills_reshuffled', size: k.deck.length });
    }
    const c = k.deck.pop(); cards.push(c); dealt.push(c);
  }
  k.track = [...cards, ...Array(SKILLS.track - cards.length).fill(null)];
  if (shifted || dealt.length) events.push({ type: 'skills_refilled', shifted, dealt });
}
