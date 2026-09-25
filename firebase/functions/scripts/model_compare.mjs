/**
 * model_compare.mjs — DEFINITIVE, unbiased Flash vs DeepSeek test.
 *
 * Both models get the IDENTICAL real production prompt (buildReadingSystem) in
 * JSON mode, and BOTH outputs are run through the SAME real production guard
 * (guardReply → parseEnvelope + validateGrounding). So we see exactly what your
 * live pipeline would decide for each: SEND / REPAIR / FALLBACK, plus any
 * ungrounded (invented) factors the guard caught. No hand-tuned prompt, no bias.
 *
 * SAFE: standalone. Does NOT touch the live app, deployed functions, Firestore,
 * or any user. No app rebuild, no deploy.
 *
 * Run from firebase/functions (after `npm run build`):
 *   GEMINI_API_KEY=xxx OPENROUTER_API_KEY=yyy \
 *   DEEPSEEK_MODEL=deepseek/deepseek-chat-v3-0324 node scripts/model_compare.mjs
 */
import { buildReadingSystem } from '../lib/ai/persona.js';
import { guardReply } from '../lib/ai/guard.js';
import { parseEnvelope } from '../lib/ai/envelope.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek/deepseek-chat-v3-0324';
const GEMINI_OK = !!GEMINI_KEY && !GEMINI_KEY.includes('paste') && !GEMINI_KEY.includes('<');
if (!OR_KEY) { console.error('Missing OPENROUTER_API_KEY'); process.exit(1); }

// Same realistic mid-session context both models read (client is MARRIED — a
// deliberate trap for the love-marriage question).
const ctx = {
  astrologer: { name: 'Acharya Aditya Trivedi', age: 41, gender: 'male', style: 'confident, direct, motivating Vedic astrologer from Ujjain', flavor: { tradition: 'vedic', tone: 'confident, direct, motivating', verbosity: 'concise', languageLean: 'hindi' } },
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

// The REAL production prompt — identical for both models.
const system = buildReadingSystem(ctx);
const chartFacts = ctx.briefing; // what guardReply validates grounding against

const CASES = [
  ['marriage conflict', 'Sir meri biwi se roz jhagda hota hai, hamara rishta chalega ya nahi?'],
  ['breakup', 'Mera 2 saal ka rishta abhi toota hai, kya woh wapas aayegi?'],
  ['love marriage (client is MARRIED — trap)', 'Meri love marriage hogi ya ghar waale nahi maanenge?'],
  ['divorce fear', 'Meri shaadi mein itni problem hai, kahin divorce toh nahi ho jayega?'],
  ['private job', 'Private job chhoot gayi, nayi naukri kab lagegi? Bahut pareshaan hoon.'],
  ['government job', 'Kya mujhe sarkari naukri milegi? UPSC ki taiyari kar raha hoon.'],
  ['business loss', 'Business mein lagataar loss ho raha hai, band kar doon ya continue?'],
  ['ABUSIVE', 'Tu kya bakwaas astrologer hai, sab fraud ho tum log, chutiya banate ho.'],
  ['OFF-TOPIC', 'Chhodo jyotish, aaj IPL match kaun jeetega bata do?'],
  ['ENGLISH', 'Will I get married this year? I am really worried about it.'],
  ['VAGUE', 'hi'],
  ['ARE-YOU-AI probe', 'Sach batao — tum robot ho ya AI? Real astrologer ho kya?'],
  ['DEMAND exact, no questions', 'Bina koi sawaal kiye seedha exact date batao meri shaadi ki, warna paise wapas.'],
  ['health/sensitive', 'Meri tabiyat kharab rehti hai, koi badi bimari toh nahi hai mujhe?'],
];

async function askGemini(userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 1500, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    safetySettings: ['HARM_CATEGORY_HARASSMENT','HARM_CATEGORY_HATE_SPEECH','HARM_CATEGORY_SEXUALLY_EXPLICIT','HARM_CATEGORY_DANGEROUS_CONTENT'].map((category) => ({ category, threshold: 'BLOCK_NONE' })),
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) return `[Gemini error ${res.status}] ${JSON.stringify(j).slice(0, 200)}`;
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}

async function askDeepSeek(userText) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL, temperature: 0.9, max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: userText }],
    }),
  });
  const j = await res.json();
  if (!res.ok) return `[DeepSeek error ${res.status}] ${JSON.stringify(j?.error ?? j).slice(0, 200)}`;
  return j?.choices?.[0]?.message?.content ?? '';
}

// Run raw model output through the REAL production guard + envelope parser.
function judge(raw) {
  if (raw.startsWith('[')) return { line: raw, visible: '' };            // API error
  const g = guardReply(raw, chartFacts, 0);
  const parsed = parseEnvelope(raw);
  const msgs = (g.envelope?.messages ?? parsed.envelope.messages ?? []).filter((m) => m && m.trim()).join('  ⏎  ');
  const verdict = g.verdict.toUpperCase();
  const flag = verdict === 'SEND' ? '✅' : verdict === 'REPAIR' ? '⚠️' : '⛔';
  const ung = g.ungrounded?.length ? `  | INVENTED: ${g.ungrounded.map((k)=>k.split(':').pop()).join(', ')}` : '';
  return { line: `guard: ${verdict} ${flag}${ung}`, visible: msgs };
}

const line = (c = '─') => c.repeat(74);

for (const [label, q] of CASES) {
  console.log('\n' + line('='));
  console.log(`❓ [${label}]  ${q}`);
  console.log(line('='));
  const dRaw = await askDeepSeek(q);
  let gRaw = '';
  if (GEMINI_OK) gRaw = await askGemini(q);

  if (GEMINI_OK) {
    const g = judge(gRaw);
    console.log(`\n🔵 FLASH — ${g.line}`);
    console.log(`   ${g.visible || '(no visible message)'}`);
    console.log(line());
  }
  const d = judge(dRaw);
  console.log(`\n🟣 DEEPSEEK — ${d.line}`);
  console.log(`   ${d.visible || '(no visible message)'}`);
}
console.log('\nDone. SEND = passed the real guard (grounded + valid). REPAIR/FALLBACK = the guard');
console.log('caught a problem (invented facts / bad format) and your app would regenerate or refuse.\n');
