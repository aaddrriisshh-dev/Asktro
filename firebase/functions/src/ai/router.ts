/**
 * Intent Router — Layer 1 of the slice assembler.
 *
 * Maps a user's (messy, Hinglish) message to { themes, subIntent, person } which
 * drives the Selector. Two paths:
 *  - HEURISTIC (deterministic, zero-cost, unit-tested): Hinglish + English keyword
 *    matching. Handles the common cases instantly and is the always-safe fallback.
 *  - LLM (router-tier Gemini Flash-Lite): for nuance the keywords miss. Returns the
 *    same structured shape; we validate it and fall back to the heuristic on any
 *    doubt.
 *
 * Cheap by design: most turns resolve on the heuristic; the LLM is only the
 * tie-breaker. classifyIntent() composes both.
 */
import { Theme, SubIntent } from './recipes';
import { llmGenerate, LlmTier } from './provider';

export interface Intent {
  themes: Theme[];
  subIntent: SubIntent;
  person: 'self' | 'partner' | 'child' | 'other';
  /** Confidence of the heuristic (0..1); the caller may prefer the LLM when low. */
  heuristicConfidence: number;
}

// Hinglish + English theme keywords. Order matters only for readability; all are
// scanned. Roman-Hindi variants included because users type in Latin script.
const THEME_KEYWORDS: Array<{ theme: Theme; words: RegExp }> = [
  { theme: 'marriage', words: /\b(marriage|married|marry|shaadi|shadi|vivah|biwi|wife|husband|pati|patni|spouse|rishta|sagai|engagement|divorce|talaq)\b/i },
  { theme: 'love', words: /\b(love|pyaar|pyar|prem|girlfriend|boyfriend|gf|bf|relationship|breakup|crush|ishq|mohabbat)\b/i },
  { theme: 'children', words: /\b(child|children|baby|bacha|bacche|santaan|santan|pregnan|conceive|beta|beti|kids|aulad)\b/i },
  { theme: 'career', words: /\b(career|job|naukri|nokri|kaam|business|vyapar|vyavsay|promotion|salary|work|office|profession|interview|startup)\b/i },
  { theme: 'wealth', words: /\b(money|paisa|paise|dhan|wealth|rich|ameer|income|loan|karza|debt|property|invest|savings|financ)\b/i },
  { theme: 'health', words: /\b(health|sehat|bimari|beemari|disease|illness|sick|bimar|operation|surgery|tension|depress|anxiety|mann)\b/i },
  { theme: 'education', words: /\b(study|studies|padhai|education|exam|degree|college|university|admission|competitive|upsc|neet)\b/i },
  { theme: 'family', words: /\b(family|parivar|ghar|mother|maa|father|papa|pita|sibling|bhai|behen|parents)\b/i },
  { theme: 'spiritual', words: /\b(spiritual|moksh|moksha|god|bhagwan|puja|pooja|mantra|meditat|dharma|guru|temple|bhakti)\b/i },
];

const SUBINTENT_KEYWORDS: Array<{ sub: SubIntent; words: RegExp }> = [
  { sub: 'timing', words: /\b(when|kab|kitne saal|kis saal|date|time|umar|age|by when|kb)\b/i },
  { sub: 'remedy', words: /\b(remedy|upay|upaay|totka|solution|kya karu|kya karoon|what should i do|nivaran|pooja|gemstone|ratna)\b/i },
  { sub: 'current_state', words: /\b(why|kyun|kyu|abhi|right now|currently|aaj kal|nowadays|these days|ho raha|problem chal)\b/i },
  { sub: 'yes_no', words: /\b(will i|kya main|hoga kya|hoga ya nahi|possible|chance|ho payega|milega kya)\b/i },
  { sub: 'promise', words: /\b(kaisa|kaisi|how will|how is|good|accha|acchi|future|scope|batao|bataye|tell me about)\b/i },
];

const PERSON_KEYWORDS: Array<{ person: Intent['person']; words: RegExp }> = [
  { person: 'partner', words: /\b(my wife|my husband|biwi|patni|pati|partner|spouse|girlfriend|boyfriend)\b/i },
  { person: 'child', words: /\b(my son|my daughter|mera beta|meri beti|my child|bacche ke)\b/i },
];

/** Deterministic classification from keywords. Always returns a usable Intent. */
export function classifyIntentHeuristic(message: string): Intent {
  const msg = message || '';
  const themes: Theme[] = [];
  for (const { theme, words } of THEME_KEYWORDS) {
    if (words.test(msg)) themes.push(theme);
  }
  let subIntent: SubIntent = 'general';
  for (const { sub, words } of SUBINTENT_KEYWORDS) {
    if (words.test(msg)) {
      subIntent = sub;
      break; // first (highest-priority) match wins
    }
  }
  let person: Intent['person'] = 'self';
  for (const { person: p, words } of PERSON_KEYWORDS) {
    if (words.test(msg)) {
      person = p;
      break;
    }
  }

  // Confidence: high when we matched a theme AND a specific sub-intent; lower when
  // we had to default. Drives whether the caller escalates to the LLM.
  const themeHit = themes.length > 0;
  const subHit = subIntent !== 'general';
  const heuristicConfidence = themeHit && subHit ? 0.9 : themeHit ? 0.65 : 0.2;

  return {
    themes: themes.length ? themes : ['general'],
    subIntent,
    person,
    heuristicConfidence,
  };
}

const ROUTER_SYSTEM = `You are an intent classifier for a Vedic astrology chat. Read the user's message (often Hinglish) and output ONLY JSON:
{"themes":["marriage|love|children|career|wealth|health|education|family|spiritual|general", ...],"subIntent":"promise|timing|current_state|remedy|yes_no|general","person":"self|partner|child|other"}
Rules: themes = what life areas the question is about (1-2 max). subIntent: "timing"=when/kab, "promise"=will it happen/how good, "current_state"=why is it like this now, "remedy"=what to do, "yes_no"=direct yes/no. person = whose life the question is about. No prose, only the JSON object.`;

/**
 * Classify with the LLM router tier, validated and merged with the heuristic.
 * Falls back entirely to the heuristic on any failure or low-quality output —
 * the pipeline must never stall on classification.
 */
export async function classifyIntent(
  message: string,
  apiKey: string,
  opts?: { configModels?: Partial<Record<LlmTier, string>>; alwaysLlm?: boolean },
): Promise<Intent> {
  const heuristic = classifyIntentHeuristic(message);
  // Skip the LLM when the heuristic is already confident (cost control).
  if (!opts?.alwaysLlm && heuristic.heuristicConfidence >= 0.9) return heuristic;

  const raw = await llmGenerate(
    { tier: 'router', system: ROUTER_SYSTEM, userText: message, json: true },
    apiKey,
    opts?.configModels,
  );
  const parsed = parseIntent(raw);
  return parsed ?? heuristic;
}

/** Validate the LLM's JSON into an Intent, or null if unusable. */
export function parseIntent(raw: string | null): Intent | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const validThemes: Theme[] = [
    'marriage', 'love', 'children', 'career', 'wealth', 'health', 'education', 'family', 'spiritual', 'general',
  ];
  const validSubs: SubIntent[] = ['promise', 'timing', 'current_state', 'remedy', 'yes_no', 'general'];
  const themes = Array.isArray(obj.themes)
    ? (obj.themes.filter((t): t is Theme => validThemes.includes(t as Theme)) as Theme[])
    : [];
  const subIntent = validSubs.includes(obj.subIntent as SubIntent) ? (obj.subIntent as SubIntent) : 'general';
  const person = (['self', 'partner', 'child', 'other'] as const).includes(obj.person as Intent['person'])
    ? (obj.person as Intent['person'])
    : 'self';
  if (!themes.length) return null;
  return { themes, subIntent, person, heuristicConfidence: 1 };
}
