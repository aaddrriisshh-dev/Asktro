/**
 * Pure sanitizers for the astrologer PERSONA flavour + specialization tags.
 *
 * Persona flavour (school, tone, verbosity, …) and the controlled specialization
 * tags are CONTENT (not money), so any admin may set them — but every value is
 * whitelisted here, server-side, so a crafted payload can never inject junk into
 * the AI prompt or the discovery filter. No I/O and no admin-SDK imports, so this
 * unit-tests in isolation. The persona shape mirrors PersonaFlavor in
 * ai/persona.ts (and the reader/validator in ai/replyEngine.ts).
 */
export const SPECIALIZATIONS = [
  'love', 'marriage', 'career', 'money', 'health', 'education', 'spirituality', 'remedies',
] as const;
const TRADITIONS = ['vedic', 'kp', 'lal_kitab', 'nadi', 'numerology', 'tarot', 'vastu'];
const VERBOSITIES = ['concise', 'balanced', 'expansive'];
const LANGUAGE_LEANS = ['hindi', 'balanced', 'english'];
const REMEDY_STYLES = ['gemstones', 'mantras', 'rituals', 'practical', 'minimal'];

const inSet = (v: unknown, set: readonly string[]): string | undefined =>
  typeof v === 'string' && set.includes(v) ? v : undefined;
const capText = (v: unknown, n: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined;

/** Controlled specialization tags (love/career/…) — universal to AI + human, used
 *  for discovery. Returns a deduped whitelist ([] to explicitly clear), or
 *  undefined when the field wasn't provided (an array). */
export function sanitizeSpecializations(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return Array.from(new Set(
    v.filter((s): s is string => typeof s === 'string' && (SPECIALIZATIONS as readonly string[]).includes(s)),
  ));
}

/** Whitelist the persona flavour object. Unknown enum values / overlong text are
 *  dropped. Returns undefined when nothing valid is set. */
export function sanitizePersona(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const tradition = inSet(p.tradition, TRADITIONS); if (tradition) out.tradition = tradition;
  const tone = capText(p.tone, 140); if (tone) out.tone = tone;
  const verbosity = inSet(p.verbosity, VERBOSITIES); if (verbosity) out.verbosity = verbosity;
  const languageLean = inSet(p.languageLean, LANGUAGE_LEANS); if (languageLean) out.languageLean = languageLean;
  const remedyStyle = inSet(p.remedyStyle, REMEDY_STYLES); if (remedyStyle) out.remedyStyle = remedyStyle;
  const voice = capText(p.voice, 700); if (voice) out.voice = voice;
  if (p.register && typeof p.register === 'object') {
    const r = p.register as Record<string, unknown>;
    const reg: Record<string, string> = {};
    for (const band of ['young', 'mid', 'senior']) {
      const t = capText(r[band], 400); if (t) reg[band] = t;
    }
    if (Object.keys(reg).length) out.register = reg;
  }
  return Object.keys(out).length ? out : undefined;
}
