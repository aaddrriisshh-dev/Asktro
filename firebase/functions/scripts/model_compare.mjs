/**
 * model_compare.mjs — OFFLINE quality test: Gemini Flash vs DeepSeek.
 *
 * Sends the SAME real astrologer system prompt (buildReadingSystem) + the same
 * sample questions to both models and prints the answers side by side, so we can
 * judge DeepSeek's Hindi/Vedic quality before changing anything in the app.
 *
 * SAFE: standalone script. Does NOT touch the live app, the deployed functions,
 * Firestore, or any user. It only calls the two AI APIs and prints text.
 * No app rebuild, no deploy.
 *
 * Run from firebase/functions:
 *   1) npm run build            # compiles TS → lib/ (so we can import the real prompt)
 *   2) GEMINI_API_KEY=xxx OPENROUTER_API_KEY=yyy node scripts/model_compare.mjs
 *
 * Keys:
 *   GEMINI_API_KEY     — your existing Gemini key (from AI Studio).
 *   OPENROUTER_API_KEY — free key from https://openrouter.ai/keys (DeepSeek free tier).
 * Optional overrides:
 *   GEMINI_MODEL   (default gemini-flash-latest)
 *   DEEPSEEK_MODEL (default deepseek/deepseek-chat-v3-0324:free)
 */
import { buildReadingSystem } from '../lib/ai/persona.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek/deepseek-chat-v3-0324:free';

if (!GEMINI_KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }
if (!OR_KEY) { console.error('Missing OPENROUTER_API_KEY (get a free one at https://openrouter.ai/keys)'); process.exit(1); }

// A realistic mid-session context (vedic persona, a sample client + chart facts),
// so both models read the exact same grounding your live app produces.
const ctx = {
  astrologer: {
    name: 'Acharya Aditya Trivedi',
    age: 41,
    gender: 'male',
    style: 'confident, direct, motivating Vedic astrologer from Ujjain',
    flavor: { tradition: 'vedic', tone: 'confident, direct, motivating', verbosity: 'concise', languageLean: 'hindi' },
  },
  client: { name: 'Rahul', age: 29, gender: 'male', relationshipStatus: 'married' },
  support: { email: 'support@asktro.in' },
  language: 'hinglish',
  isSessionOpening: false,
  briefing:
    '# Kundli facts (this turn)\n' +
    'Lagna: Vrishchik (Scorpio). Moon: Karka (Cancer), Ashlesha nakshatra.\n' +
    'Current Mahadasha: Shukra (Venus), Antardasha: Mangal (Mars).\n' +
    'Gochar: Shani transiting the 7th house (marriage/partnership).\n' +
    'METHOD: read the 7th house + its lord for the marriage question; weigh the Shukra–Mangal tension.\n' +
    'FOCUS: the client asks about repeated conflict with his wife.',
};

const system = buildReadingSystem(ctx);

const QUESTIONS = [
  'Sir meri biwi se roz jhagda hota hai, hamara rishta chalega ya nahi?',
  'Meri job kab tak lagegi? Bahut pareshaan hoon.',
  'Mujhe apne business mein loss ho raha hai, kya karun?',
];

async function askGemini(question) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: question }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 400 },
    safetySettings: ['HARM_CATEGORY_HARASSMENT','HARM_CATEGORY_HATE_SPEECH','HARM_CATEGORY_SEXUALLY_EXPLICIT','HARM_CATEGORY_DANGEROUS_CONTENT']
      .map((category) => ({ category, threshold: 'BLOCK_NONE' })),
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) return `[Gemini error ${res.status}] ${JSON.stringify(j).slice(0, 300)}`;
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '[empty]';
}

async function askDeepSeek(question) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.9,
      max_tokens: 400,
      messages: [{ role: 'system', content: system }, { role: 'user', content: question }],
    }),
  });
  const j = await res.json();
  if (!res.ok) return `[DeepSeek error ${res.status}] ${JSON.stringify(j).slice(0, 300)}`;
  return j?.choices?.[0]?.message?.content ?? '[empty]';
}

// If a model followed the JSON output-contract, pull the human text out of it so
// the printout stays readable; otherwise print raw.
function pretty(text) {
  try {
    const o = JSON.parse(text);
    if (Array.isArray(o?.messages)) return o.messages.join('\n');
    if (typeof o?.reply === 'string') return o.reply;
    if (typeof o?.text === 'string') return o.text;
  } catch { /* not JSON — print raw */ }
  return text;
}

const line = (c = '─') => c.repeat(72);

for (const q of QUESTIONS) {
  console.log('\n' + line('='));
  console.log('❓ ' + q);
  console.log(line('='));
  const [g, d] = await Promise.all([askGemini(q), askDeepSeek(q)]);
  console.log(`\n🔵 FLASH (${GEMINI_MODEL}):\n${pretty(g)}\n`);
  console.log(line());
  console.log(`\n🟣 DEEPSEEK (${DEEPSEEK_MODEL}):\n${pretty(d)}\n`);
}
console.log('\nDone. Judge Hindi fluency, warmth, astrological specificity, and whether it holds the paid answer back.\n');
