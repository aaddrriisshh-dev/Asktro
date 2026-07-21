/**
 * Unit tests for the persona/specialization sanitizers — the server-side gate
 * that keeps a crafted admin payload from injecting junk into the AI prompt or
 * the discovery filter. Pure functions, no emulator.
 */
import { sanitizePersona, sanitizeSpecializations } from './personaFields';

describe('sanitizeSpecializations', () => {
  it('keeps only whitelisted tags, dedupes, and drops junk', () => {
    expect(sanitizeSpecializations(['love', 'career', 'love', 'hacking', 42, null]))
      .toEqual(['love', 'career']);
  });
  it('returns [] for an empty/all-invalid array (an explicit clear)', () => {
    expect(sanitizeSpecializations([])).toEqual([]);
    expect(sanitizeSpecializations(['nope'])).toEqual([]);
  });
  it('returns undefined when the field was not an array (not provided)', () => {
    expect(sanitizeSpecializations(undefined)).toBeUndefined();
    expect(sanitizeSpecializations('love')).toBeUndefined();
  });
});

describe('sanitizePersona', () => {
  it('keeps valid enum + text values', () => {
    const out = sanitizePersona({
      tradition: 'lal_kitab', tone: 'warm and motherly', verbosity: 'concise',
      languageLean: 'hindi', remedyStyle: 'practical', voice: 'reads in Varanasi',
      register: { young: 'lighter', senior: 'slower and traditional' },
    });
    expect(out).toEqual({
      tradition: 'lal_kitab', tone: 'warm and motherly', verbosity: 'concise',
      languageLean: 'hindi', remedyStyle: 'practical', voice: 'reads in Varanasi',
      register: { young: 'lighter', senior: 'slower and traditional' },
    });
  });

  it('drops unknown enum values but keeps the valid siblings', () => {
    const out = sanitizePersona({ tradition: 'astrology-tv', verbosity: 'balanced', remedyStyle: 'crystals' })!;
    expect(out.tradition).toBeUndefined();
    expect(out.remedyStyle).toBeUndefined();
    expect(out.verbosity).toBe('balanced');
  });

  it('caps overlong free text and trims empties', () => {
    const out = sanitizePersona({ tone: '   ', voice: 'x'.repeat(2000) })!;
    expect(out.tone).toBeUndefined(); // blank dropped
    expect((out.voice as string).length).toBe(700); // capped
  });

  it('returns undefined when nothing valid is present', () => {
    expect(sanitizePersona({})).toBeUndefined();
    expect(sanitizePersona({ tradition: 'nope', register: { young: '  ' } })).toBeUndefined();
    expect(sanitizePersona(null)).toBeUndefined();
    expect(sanitizePersona('vedic')).toBeUndefined();
  });

  it('accepts every real tradition (incl. the not-yet-authentic ones stored for later)', () => {
    for (const t of ['vedic', 'kp', 'lal_kitab', 'nadi', 'numerology', 'tarot', 'vastu']) {
      expect(sanitizePersona({ tradition: t })).toEqual({ tradition: t });
    }
  });
});
