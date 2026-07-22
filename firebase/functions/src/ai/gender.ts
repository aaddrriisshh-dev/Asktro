/**
 * Deterministic safety net for Hindi first-person gender agreement.
 *
 * LLMs slip on Hindi verb-gender concord ("dekh raha hoon" vs "dekh rahi hoon"),
 * even with a strong prompt rule. This forces the astrologer's OWN first-person
 * verbs — those ending in "…hoon" (Latin) or "…हूँ/हूं" (Devanagari) — to her
 * gender, in both scripts.
 *
 * Safety: it ONLY rewrites first-person "…hoon/हूँ" forms, so verbs about the
 * CLIENT ("aap dekhti hain", "aap karte ho") are never touched — those don't end
 * in the first-person auxiliary. Pure + deterministic → unit-testable.
 */
export function conjugateGender(text: string, gender?: 'male' | 'female'): string {
  if (!gender || !text) return text;
  const hoon = '(\\s+h(?:oon|un|oo|u)\\b)'; // Latin "hoon" variants → capture group $2
  const dev = '(\\s+ह\\u0942)'; // Devanagari "हू…" (हूँ / हूं) → capture group $2
  let t = text;
  if (gender === 'male') {
    // feminine → masculine
    t = t.replace(new RegExp('\\brahi' + hoon, 'gi'), 'raha$1');
    t = t.replace(new RegExp('\\b([a-z]+?)ti' + hoon, 'gi'), '$1ta$2');
    t = t.replace(new RegExp('([\\u0900-\\u097F]+?)\\u0940' + dev, 'g'), '$1ा$2');
    // First-person FUTURE (Latin): "…ungi" → "…unga" (karungi→karunga,
    // khulwaungi→khulwaunga). Only first-person singular future takes -ungi/-unga,
    // and this runs on the astrologer's own output, so it's her verb → safe.
    t = t.replace(/\b([a-z]+?)ungi\b/gi, '$1unga');
  } else {
    // masculine → feminine
    t = t.replace(new RegExp('\\braha' + hoon, 'gi'), 'rahi$1');
    t = t.replace(new RegExp('\\b([a-z]+?)ta' + hoon, 'gi'), '$1ti$2');
    t = t.replace(new RegExp('([\\u0900-\\u097F]+?)\\u093E' + dev, 'g'), '$1ी$2');
    t = t.replace(/\b([a-z]+?)unga\b/gi, '$1ungi');
  }
  return t;
}
