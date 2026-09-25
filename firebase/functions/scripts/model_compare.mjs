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
// Flash side is optional: if the Gemini key is missing or still the placeholder,
// we just skip it and run DeepSeek-only (free).
const GEMINI_OK = !!GEMINI_KEY && !GEMINI_KEY.includes('paste') && !GEMINI_KEY.includes('<');

// Try DeepSeek's still-FREE OpenRouter variants in order; use the first that works
// (no top-up needed). An explicit DEEPSEEK_MODEL env overrides the list. The
// chat-v3 ":free" slug was retired but is kept last as a fallback.
const DEEPSEEK_CANDIDATES = process.env.DEEPSEEK_MODEL
  ? [process.env.DEEPSEEK_MODEL]
  : [
      'deepseek/deepseek-r1-0528:free',
      'deepseek/deepseek-r1:free',
      'deepseek/deepseek-chat-v3-0324:free',
    ];

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
    'METHOD: read the relevant house + its lord for whatever the client asks; weigh the Shukra–Mangal dasha.\n' +
    'FOCUS: answer the client’s current question using ONLY the chart facts above.',
};

const system = buildReadingSystem(ctx);

const QUESTIONS = [
  'Sir meri biwi se roz jhagda hota hai, hamara rishta chalega ya nahi?',   // marriage conflict
  'Mera 2 saal ka rishta abhi toota hai, kya woh wapas aayegi?',            // breakup
  'Meri love marriage hogi ya ghar waale nahi maanenge?',                   // love marriage
  'Meri shaadi mein itni problem hai, kahin divorce toh nahi ho jayega?',   // divorce fear
  'Private job chhoot gayi, nayi naukri kab lagegi? Bahut pareshaan hoon.', // job
  'Kya mujhe sarkari naukri milegi? UPSC ki taiyari kar raha hoon.',        // government job
  'Business mein lagataar loss ho raha hai, band kar doon ya continue?',    // business
];

async function askGemini(question) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: question }] }],
    // Flash is a "thinking" model — give it headroom and turn thinking OFF so the
    // full reply comes through (otherwise reasoning eats the token budget and the
    // visible answer is truncated).
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    safetySettings: ['HARM_CATEGORY_HARASSMENT','HARM_CATEGORY_HATE_SPEECH','HARM_CATEGORY_SEXUALLY_EXPLICIT','HARM_CATEGORY_DANGEROUS_CONTENT']
      .map((category) => ({ category, threshold: 'BLOCK_NONE' })),
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) return `[Gemini error ${res.status}] ${JSON.stringify(j).slice(0, 300)}`;
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '[empty]';
}

let DEEPSEEK_MODEL = null; // locked to the first candidate that actually answers

async function askDeepSeekWith(model, question) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 400,
      messages: [{ role: 'system', content: system }, { role: 'user', content: question }],
    }),
  });
  const j = await res.json();
  return { ok: res.ok, status: res.status, body: j };
}

async function askDeepSeek(question) {
  // Once a working free model is found, reuse it for the rest of the questions.
  const toTry = DEEPSEEK_MODEL ? [DEEPSEEK_MODEL] : DEEPSEEK_CANDIDATES;
  let lastErr = '';
  for (const model of toTry) {
    const r = await askDeepSeekWith(model, question);
    if (r.ok) { DEEPSEEK_MODEL = model; return r.body?.choices?.[0]?.message?.content ?? '[empty]'; }
    lastErr = `[${model}] ${r.status}: ${JSON.stringify(r.body?.error ?? r.body).slice(0, 160)}`;
    if (r.status !== 404) return `[DeepSeek error] ${lastErr}`; // real error (credit/auth) — stop
  }
  return `[No free DeepSeek variant worked. Last: ${lastErr}]\n` +
    `→ Either add ~$5 credit at openrouter.ai/credits and run with ` +
    `DEEPSEEK_MODEL=deepseek/deepseek-chat-v3-0324, or paste the prompt into chat.deepseek.com (free).`;
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

if (!GEMINI_OK) console.log('\n(Flash skipped — no valid GEMINI_API_KEY. Running DeepSeek only.)');

for (const q of QUESTIONS) {
  console.log('\n' + line('='));
  console.log('❓ ' + q);
  console.log(line('='));
  const d = await askDeepSeek(q);
  if (GEMINI_OK) {
    const g = await askGemini(q);
    console.log(`\n🔵 FLASH (${GEMINI_MODEL}):\n${pretty(g)}\n`);
    console.log(line());
  }
  console.log(`\n🟣 DEEPSEEK (${DEEPSEEK_MODEL ?? 'n/a'}):\n${pretty(d)}\n`);
}
console.log('\nDone. Judge Hindi fluency, warmth, astrological specificity, and whether it holds the paid answer back.\n');
