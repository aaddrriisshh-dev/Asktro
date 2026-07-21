/**
 * Tarot grounding — the authentic method for a `tradition: 'tarot'` persona. A
 * real tarot reader draws cards and reads THOSE; so we deterministically "draw" a
 * three-card spread (Major Arcana) from the question, and hand the reader the
 * exact cards + orientations to interpret. Deterministic per (session, question)
 * so a regeneration/repair reads the SAME cards — the spread never reshuffles
 * mid-answer. No birth chart is needed (tarot reads the question, not the kundli).
 *
 * Pure + deterministic (no I/O, no Math.random) → unit-testable.
 */

/** The 22 Major Arcana, with a short upright + reversed meaning each. */
interface Card { name: string; up: string; rev: string; }
const MAJORS: Card[] = [
  { name: 'The Fool', up: 'new beginnings, a leap of faith, freedom', rev: 'recklessness, hesitation, a poorly-timed risk' },
  { name: 'The Magician', up: 'skill, willpower, making it happen', rev: 'scattered energy, untapped talent, manipulation' },
  { name: 'The High Priestess', up: 'intuition, patience, a hidden truth', rev: 'ignored instinct, secrets, confusion' },
  { name: 'The Empress', up: 'abundance, nurturing, growth, home', rev: 'blocked creativity, over-giving, neglect' },
  { name: 'The Emperor', up: 'structure, authority, stability, control', rev: 'rigidity, domination, loss of control' },
  { name: 'The Hierophant', up: 'tradition, guidance, marriage, learning', rev: 'breaking convention, a personal path' },
  { name: 'The Lovers', up: 'love, a meaningful choice, harmony', rev: 'disharmony, a difficult choice, imbalance' },
  { name: 'The Chariot', up: 'drive, victory through will, momentum', rev: 'stalled effort, lost direction, no control' },
  { name: 'Strength', up: 'inner strength, patience, gentle courage', rev: 'self-doubt, low energy, raw impulse' },
  { name: 'The Hermit', up: 'reflection, solitude, seeking answers', rev: 'isolation, avoidance, delay' },
  { name: 'Wheel of Fortune', up: 'a turning point, luck, change of cycle', rev: 'a downturn, resistance to change' },
  { name: 'Justice', up: 'fairness, truth, a just outcome, karma', rev: 'unfairness, avoidance of accountability' },
  { name: 'The Hanged Man', up: 'pause, surrender, a new perspective', rev: 'stalling, needless sacrifice, resistance' },
  { name: 'Death', up: 'an ending that makes way for the new', rev: 'clinging to the past, fear of change' },
  { name: 'Temperance', up: 'balance, patience, moderation, healing', rev: 'excess, imbalance, impatience' },
  { name: 'The Devil', up: 'attachment, temptation, feeling trapped', rev: 'breaking free, releasing a hold' },
  { name: 'The Tower', up: 'sudden upheaval, a needed shake-up', rev: 'fear of change, delaying the inevitable' },
  { name: 'The Star', up: 'hope, healing, renewed faith', rev: 'discouragement, lost faith, needing rest' },
  { name: 'The Moon', up: 'uncertainty, illusion, listen to instinct', rev: 'clarity returning, fear fading' },
  { name: 'The Sun', up: 'joy, success, warmth, clarity', rev: 'a temporary cloud, delayed happiness' },
  { name: 'Judgement', up: 'a reckoning, renewal, a clear call', rev: 'self-doubt, ignoring the call' },
  { name: 'The World', up: 'completion, fulfilment, a cycle done well', rev: 'an unfinished chapter, near but not yet' },
];

const POSITIONS = ['Situation (the present)', 'Challenge / what to work with', 'Where it is heading'];

/** FNV-1a string hash → 32-bit unsigned. Stable, no I/O. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface DrawnCard { position: string; name: string; reversed: boolean; meaning: string; }

/** Deterministically draw a 3-card spread from a seed key + the question. */
export function drawSpread(seedKey: string, question: string): DrawnCard[] {
  let state = hash(`${seedKey}|${question}`) || 1;
  const next = () => { // xorshift32 PRNG
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state >>> 0;
  };
  const idx = [...MAJORS.keys()];
  // Fisher–Yates using the PRNG; take the first three.
  for (let i = idx.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return [0, 1, 2].map((k) => {
    const card = MAJORS[idx[k]];
    const reversed = next() % 100 < 32; // ~32% reversed
    return { position: POSITIONS[k], name: card.name, reversed, meaning: reversed ? card.rev : card.up };
  });
}

/** The facts block a tarot persona reads THIS turn — the exact cards they drew. */
export function buildTarotBriefing(seedKey: string, question: string): string {
  const spread = drawSpread(seedKey, question || 'a general reading');
  const lines = spread.map((c) => `- ${c.position}: ${c.name} (${c.reversed ? 'reversed' : 'upright'}) — ${c.meaning}`);
  return [
    'THE CARDS YOU DREW for this question (a three-card spread):',
    ...lines,
    'METHOD: read THESE three cards as one story — the present, what to work with, ' +
    'and where it leads. Name the cards you drew and weave them together warmly; do ' +
    'not invent cards you did not draw, and never read a birth chart, houses, or dashas.',
  ].join('\n');
}
