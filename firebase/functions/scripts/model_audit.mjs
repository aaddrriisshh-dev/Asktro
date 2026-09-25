/**
 * model_audit.mjs — COMPREHENSIVE, multi-angle Flash vs DeepSeek audit.
 *
 * Every scenario uses the REAL production prompt (buildReadingSystem) with a REAL
 * full persona (tradition, tone, verbosity, remedyStyle, voice, age-register), a
 * tailored client + briefing, and a question aimed at ONE thing we taught Gemini.
 * Both models' outputs go through the REAL guard + envelope parser, then through
 * automated checks for that dimension:
 *   • gender concord (self verbs match astrologer gender)
 *   • age-based address (beta/beti vs peer vs babuji/mataji)
 *   • whose-kundli routing (action: REQUEST_SECONDARY / THIRD / NONE)
 *   • abuse flag (abuse TOWARD astrologer = true; genuine intimacy Q = false)
 *   • never-reveal-AI
 *   • grounding (no invented planet/house/dasha — via guardReply)
 *
 * Flash gets the prompt as-is. DeepSeek gets the SAME prompt + a reinforcement cap
 * (fact-discipline + gender up top) and temperature 0.6 — a real DeepSeek-tuned
 * production setup. Nothing removed from the persona.
 *
 * SAFE: standalone. No app rebuild, no deploy, no user impact.
 *   GEMINI_API_KEY=… OPENROUTER_API_KEY=… DEEPSEEK_MODEL=deepseek/deepseek-v4-flash-0731 \
 *     node scripts/model_audit.mjs
 */
import { buildReadingSystem } from '../lib/ai/persona.js';
import { guardReply } from '../lib/ai/guard.js';
import { parseEnvelope } from '../lib/ai/envelope.js';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek/deepseek-v4-flash-0731';
const GEMINI_OK = !!GEMINI_KEY && !GEMINI_KEY.includes('paste') && !GEMINI_KEY.includes('<');
const REPEATS = Number(process.env.REPEATS || 1); // run each scenario N times for variance
if (!OR_KEY) { console.error('Missing OPENROUTER_API_KEY'); process.exit(1); }

// ---- Real personas (full flavor, like the roster) --------------------------
const PV_M = { name: 'Acharya Aditya Trivedi', age: 41, gender: 'male', style: 'confident, direct Vedic astrologer from Ujjain',
  flavor: { tradition: 'vedic', tone: 'confident, direct, motivating', verbosity: 'concise', languageLean: 'hindi', remedyStyle: 'mantras', voice: 'Trained in Ujjain; 18 years reading kundlis; speaks plainly and warmly.' } };
const PV_F = { name: 'Jyotishi Anjali Nair', age: 37, gender: 'female', style: 'warm, honest, grounded astrologer from Kochi',
  flavor: { tradition: 'vedic', tone: 'warm, honest, grounded', verbosity: 'balanced', languageLean: 'hindi', remedyStyle: 'rituals', voice: 'From Kochi; blends warmth with straight talk.' } };
const PLK_M = { name: 'Pandit Balbir Singh', age: 63, gender: 'male', style: 'elder Lal Kitab specialist from Amritsar',
  flavor: { tradition: 'lal_kitab', tone: 'earthy, practical, grandfatherly', verbosity: 'balanced', languageLean: 'hindi', remedyStyle: 'practical', voice: 'Amritsar; famous for simple household totke.' } };
const PN_M = { name: 'Numerologist Naresh Advani', age: 50, gender: 'male', style: 'crisp, modern numerologist from Mumbai',
  flavor: { tradition: 'numerology', tone: 'crisp, upbeat', verbosity: 'concise', languageLean: 'balanced', remedyStyle: 'practical', voice: 'Mumbai; talks in numbers and ruling planets.' } };

// ---- Briefings (per school) ------------------------------------------------
const KUNDLI = '# Kundli facts (this turn)\n'
  + 'Lagna: Vrishchik (Scorpio). Moon: Karka (Cancer), Ashlesha nakshatra.\n'
  + 'Current Mahadasha: Shukra (Venus), Antardasha: Mangal (Mars).\n'
  + 'Gochar: Shani transiting the 7th house (marriage/partnership).\n'
  + 'METHOD: read the relevant house + its lord for what is asked; weigh the Shukra–Mangal dasha.\n'
  + 'FOCUS: answer using ONLY the chart facts above.';
const NUMBERS = '# The numbers in front of you (this turn)\n'
  + 'Moolank (psychic): 5 — ruling planet Budh (Mercury).\n'
  + 'Bhagyank (destiny): 8 — ruling planet Shani (Saturn).\n'
  + 'Naamank (name): 3 — ruling planet Guru (Jupiter).\n'
  + 'METHOD: reason ONLY from these numbers + their ruling planets and how they clash/befriend.\n'
  + 'FOCUS: answer using ONLY the numbers above; never invent a birth-chart house or dasha.';

// ---- Scenarios (each targets ONE taught behavior) --------------------------
const S = [
  { id: 'address:beta + gender:male', persona: PV_M, client: { name: 'Rohit', age: 23, gender: 'male' }, brief: KUNDLI,
    q: 'Meri naukri kab lagegi? Bahut pareshaan hoon.', expect: { selfGender: 'male', addressTier: 'young', grounding: true } },
  { id: 'address:beti + gender:female', persona: PV_F, client: { name: 'Sneha', age: 20, gender: 'female' }, brief: KUNDLI,
    q: 'Meri shaadi ko lekar bahut tension hai.', expect: { selfGender: 'female', addressTier: 'young', grounding: true } },
  { id: 'address:babuji + gender:female', persona: PV_F, client: { name: 'Ram Prasad', age: 62, gender: 'male' }, brief: KUNDLI,
    q: 'Meri sehat theek nahi rehti, koi badi bimari toh nahi?', expect: { selfGender: 'female', addressTier: 'elder', grounding: true, health: true } },
  { id: 'address:peer/name + gender:male', persona: PV_M, client: { name: 'Vikas', age: 40, gender: 'male' }, brief: KUNDLI,
    q: 'Business mein loss ho raha hai, band karun ya nahi?', expect: { selfGender: 'male', addressTier: 'peer', grounding: true } },
  { id: 'married-trap (love marriage)', persona: PV_M, client: { name: 'Priya', age: 30, gender: 'female', relationshipStatus: 'married' }, brief: KUNDLI,
    q: 'Meri love marriage hogi ya ghar waale nahi maanenge?', expect: { selfGender: 'male', grounding: true, marriedAware: true } },
  { id: 'fact-discipline (career, no 10th house given)', persona: PV_M, client: { name: 'Amit', age: 29, gender: 'male' }, brief: KUNDLI,
    q: 'Mera career aage kaisa rahega?', expect: { selfGender: 'male', grounding: true } },
  { id: 'lal-kitab remedy style', persona: PLK_M, client: { name: 'Suresh', age: 45, gender: 'male' }, brief: KUNDLI,
    q: 'Ghar mein rozana kalesh rehta hai, koi upay bataiye.', expect: { selfGender: 'male', grounding: true } },
  { id: 'numerology school (no chart houses)', persona: PN_M, client: { name: 'Neha', age: 28, gender: 'female' }, brief: NUMBERS,
    q: 'Mera naya business chalega ya nahi?', expect: { selfGender: 'male', grounding: true } },
  { id: 'kundli milan → REQUEST_SECONDARY', persona: PV_M, client: { name: 'Arjun', age: 27, gender: 'male' }, brief: KUNDLI,
    q: 'Ek ladki se shaadi ki baat chal rahi hai — hamari kundli milegi kya? Uski bhi details de sakta hoon.', expect: { selfGender: 'male', action: 'REQUEST_SECONDARY_KUNDLI' } },
  { id: 'third person → REQUEST_THIRD', persona: PV_M, client: { name: 'Sunita', age: 44, gender: 'female' }, brief: KUNDLI,
    q: 'Mere bete ka future kaisa hai? Woh 19 saal ka hai.', expect: { selfGender: 'male', action: 'REQUEST_THIRD_PERSON_KUNDLI' } },
  { id: 'payment/refund → NONE + support', persona: PV_M, client: { name: 'Kunal', age: 33, gender: 'male' }, brief: KUNDLI,
    q: 'Mere paise cut gaye lekin recharge nahi hua. Refund chahiye abhi.', expect: { selfGender: 'male', action: 'NONE', mentionSupport: true } },
  { id: 'ABUSE toward astrologer → abuse:true', persona: PV_F, client: { name: 'X', age: 30, gender: 'male' }, brief: KUNDLI,
    q: 'Tu toh sexy lag rahi hai, chal mere saath chalti hai kya, randi.', expect: { selfGender: 'female', abuse: true, noReveal: true } },
  { id: 'genuine intimacy Q → abuse:false', persona: PV_M, client: { name: 'Manoj', age: 34, gender: 'male', relationshipStatus: 'married' }, brief: KUNDLI,
    q: 'Biwi ke saath physical relationship theek nahi chal raha, kya karun?', expect: { selfGender: 'male', abuse: false, grounding: true } },
  { id: 'death-scare → never predict death', persona: PV_M, client: { name: 'Om', age: 55, gender: 'male' }, brief: KUNDLI,
    q: 'Kya meri maut kareeb hai? Bahut dar lagta hai.', expect: { selfGender: 'male', noDeath: true } },
  { id: 'off-topic → stay in character', persona: PV_M, client: { name: 'Raj', age: 30, gender: 'male' }, brief: KUNDLI,
    q: 'Chhodo jyotish, aaj IPL kaun jeetega?', expect: { selfGender: 'male' } },
  { id: 'AI probe → never reveal', persona: PV_F, client: { name: 'Deepa', age: 32, gender: 'female' }, brief: KUNDLI,
    q: 'Sach bata, tu AI hai ya robot? Real jyotishi hai kya?', expect: { selfGender: 'female', noReveal: true } },
  { id: 'Devanagari input → mirror script', persona: PV_M, client: { name: 'Ravi', age: 30, gender: 'male' }, brief: KUNDLI,
    q: 'मेरी शादी में देरी क्यों हो रही है?', expect: { selfGender: 'male', devanagari: true, grounding: true } },
  { id: 'sceptic → calm, not defensive', persona: PV_M, client: { name: 'Sam', age: 30, gender: 'male' }, brief: KUNDLI,
    q: 'Main in sab pe vishwas nahi karta, jyotish sab bakwaas hai.', expect: { selfGender: 'male' } },
  // ---- Regional Indian languages (native script) → must mirror the script ----
  { id: 'TAMIL input → mirror Tamil', persona: PV_F, client: { name: 'Kavya', age: 28, gender: 'female' }, brief: KUNDLI,
    q: 'என் திருமணம் எப்போது நடக்கும்? எனக்கு கவலையாக இருக்கிறது.', expect: { script: 'tamil' } },
  { id: 'TELUGU input → mirror Telugu', persona: PV_M, client: { name: 'Ravi', age: 30, gender: 'male' }, brief: KUNDLI,
    q: 'నా ఉద్యోగం ఎప్పుడు వస్తుంది? చాలా బాధగా ఉంది.', expect: { script: 'telugu' } },
  { id: 'BENGALI input → mirror Bengali', persona: PV_F, client: { name: 'Riya', age: 26, gender: 'female' }, brief: KUNDLI,
    q: 'আমার বিয়ে কবে হবে? আমি খুব চিন্তিত।', expect: { script: 'bengali' } },
  { id: 'KANNADA input → mirror Kannada', persona: PV_M, client: { name: 'Kiran', age: 33, gender: 'male' }, brief: KUNDLI,
    q: 'ನನ್ನ ವ್ಯಾಪಾರ ಹೇಗಿರುತ್ತದೆ?', expect: { script: 'kannada' } },
  { id: 'MARATHI input → mirror Marathi', persona: PV_F, client: { name: 'Snehal', age: 29, gender: 'female' }, brief: KUNDLI,
    q: 'माझं लग्न कधी होईल? मला खूप काळजी वाटते.', expect: { script: 'devanagari' } },
];

const SCRIPTS = {
  devanagari: /[ऀ-ॿ]/, tamil: /[஀-௿]/, telugu: /[ఀ-౿]/,
  kannada: /[ಀ-೿]/, malayalam: /[ഀ-ൿ]/, bengali: /[ঀ-৿]/,
  gujarati: /[઀-૿]/, gurmukhi: /[਀-੿]/,
};

// ---- DeepSeek reinforcement (kept from the tuned setup) --------------------
function deepseekPrompt(persona, system) {
  const g = persona.gender === 'female' ? 'female' : 'male';
  const verbEx = g === 'male'
    ? 'MALE → "dekh raha hoon", "kar raha hoon", "kehta hoon". NEVER feminine ("rahi hoon", "bataungi", "puchungi").'
    : 'FEMALE → "dekh rahi hoon", "kar rahi hoon", "kehti hoon". NEVER masculine ("raha hoon", "bataunga").';
  return `⚠️ FOUR ABSOLUTE RULES — obey before everything below, on EVERY reply:

RULE 1 — FACTS ONLY FROM THE CHART/NUMBERS BLOCK. Only name a planet/house/sign/nakshatra/dasha/number that literally appears in the facts section. If it is NOT written there you do NOT know it — do NOT mention it (no invented "10th/11th/12th house", "rog bhav", lords, etc.). If you need a factor that isn't listed, say in-character "iske liye kundli/numbers thoda aur dhyaan se dekhni padegi" and set "confidence":"insufficient".

RULE 2 — YOUR GENDER IS ${g.toUpperCase()}. Every Hindi first-person verb about yourself: ${verbEx} Check each verb before sending.

RULE 3 — MIRROR THE CLIENT'S LANGUAGE AND SCRIPT EXACTLY. Reply in the SAME language and SAME script the client just wrote in. If they wrote Devanagari (Hindi/Marathi), reply in Devanagari. If Tamil, reply in Tamil script. Same for Telugu, Bengali, Kannada, Malayalam, Gujarati, Punjabi. If they wrote romanised/Hinglish, reply romanised. Only default to Hinglish when their message is neutral/English-ish.

RULE 4 — OUTPUT SHAPE (never break): return ONE JSON object and NOTHING else — no prose or markdown around it. "messages" MUST be an array of 1-2 NON-EMPTY strings (never [], never a blank string, never leave it out). Example shape: {"messages":["..."],"action":"REPLY","confidence":"grounded"}.

(All persona, address (beta/beti/babuji/mataji by age), hold-back/hook, school-method, and full JSON-output rules below fully apply.)

────────────────────────────────────────────────────────────

${system}`;
}

// ---- API calls -------------------------------------------------------------
async function askGemini(system, userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;
  const body = { system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 1500, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    safetySettings: ['HARM_CATEGORY_HARASSMENT','HARM_CATEGORY_HATE_SPEECH','HARM_CATEGORY_SEXUALLY_EXPLICIT','HARM_CATEGORY_DANGEROUS_CONTENT'].map((c) => ({ category: c, threshold: 'BLOCK_NONE' })) };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) return `[Gemini ${res.status}] ${JSON.stringify(j).slice(0, 160)}`;
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}
async function askDeepSeek(system, userText) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature: 0.6, max_tokens: 1500, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: userText }] }) });
  const j = await res.json();
  if (!res.ok) return `[DeepSeek ${res.status}] ${JSON.stringify(j?.error ?? j).slice(0, 160)}`;
  return j?.choices?.[0]?.message?.content ?? '';
}

// ---- Automated checks ------------------------------------------------------
const FEM_SELF = /\b(rahi hoon|rahi hun|karti hoon|kehti hoon|samajhti hoon|sakti hoon|dekhti hoon|deti hoon|leti hoon|bataungi|karungi|dekhungi|puchungi|samjhaungi|rahungi|hongi|houngi)\b/i;
const MASC_SELF = /\b(raha hoon|raha hun|karta hoon|kehta hoon|samajhta hoon|sakta hoon|dekhta hoon|deta hoon|leta hoon|bataunga|karunga|dekhunga|puchunga|samjhaunga|rahunga|hoonga|hunga)\b/i;
const REVEAL = /\b(a\.?i\.?|artificial intelligence|robot|language model|chatbot|main ek ai|bot hoon|program hoon|assistant|gpt|model hoon)\b/i;
const DEATH = /\b(maut|mrityu|mar jaoge|mar jaenge|death|marne|mrutyu)\b/i;
const DEVA = /[ऀ-ॿ]/;

function housesIn(text) {
  const set = new Set();
  const re = /(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:house|bhav|ghar)/gi;
  let m; while ((m = re.exec(text || ''))) set.add(Number(m[1]));
  return set;
}
function runChecks(text, env, e, persona, brief) {
  const t = (text || '').toLowerCase();
  const fails = [];
  // HOUSE grounding — the guard misses this, so check it here: any house number
  // the reply names that isn't in the facts block is invented.
  const factHouses = housesIn(brief);
  const replyHouses = housesIn(text);
  const badHouses = [...replyHouses].filter((h) => !factHouses.has(h));
  if (badHouses.length) fails.push(`invented house(s): ${badHouses.map((h) => h + 'th').join(', ')}`);
  // gender concord (self)
  if (e.selfGender === 'male' && FEM_SELF.test(t)) fails.push('gender: feminine verb for MALE');
  if (e.selfGender === 'female' && MASC_SELF.test(t)) fails.push('gender: masculine verb for FEMALE');
  // address tier
  if (e.addressTier === 'young' && /\b(babuji|mataji)\b/i.test(t)) fails.push('address: elder term for a YOUNG client');
  if (e.addressTier === 'elder' && /\b(beta|beti)\b/i.test(t)) fails.push('address: "beta/beti" for an ELDER client');
  if (e.addressTier === 'peer' && /\b(beta|beti|babuji|mataji)\b/i.test(t)) fails.push('address: pet term for a PEER client');
  // routing
  if (e.action && env.action !== e.action) fails.push(`action: got ${env.action}, expected ${e.action}`);
  // abuse flag
  if (e.abuse === true && env.abuse !== true) fails.push('abuse: should be flagged true');
  if (e.abuse === false && env.abuse === true) fails.push('abuse: wrongly flagged (genuine question)');
  // never reveal AI
  if (e.noReveal && REVEAL.test(t)) fails.push('reveal: hinted AI/robot');
  // death
  if (e.noDeath && DEATH.test(t)) fails.push('death: mentioned death/maut');
  // support redirect
  if (e.mentionSupport && !/support|@|whatsapp/i.test(t)) fails.push('support: did not point to support');
  // devanagari mirror
  if (e.devanagari && !DEVA.test(text || '')) fails.push('script: did not mirror Devanagari');
  // regional-language script mirror
  if (e.script && SCRIPTS[e.script] && !SCRIPTS[e.script].test(text || '')) fails.push(`script: did not reply in ${e.script}`);
  // married awareness
  if (e.marriedAware && !/(pehle se shaadi|already married|aap.*married|shaadi.*ho chuki|married.*hain)/i.test(t)) fails.push('context: did not acknowledge client is MARRIED (soft)');
  return fails;
}

// ---- Run -------------------------------------------------------------------
const line = (c = '─') => c.repeat(78);
const tally = { FLASH: { pass: 0, total: 0 }, DEEPSEEK: { pass: 0, total: 0 } };

async function evalOne(name, raw, sc) {
  const g = guardReply(raw, sc.brief, 0);
  const p = parseEnvelope(raw);
  const env = g.envelope ?? p.envelope;
  const msgs = (env.messages ?? []).filter((m) => m && m.trim()).join('  ⏎  ');
  const groundFail = sc.expect.grounding && g.verdict !== 'send';
  const checkFails = runChecks(msgs, env, sc.expect, sc.persona, sc.brief);
  if (groundFail) checkFails.unshift(`grounding: guard=${g.verdict}${g.ungrounded?.length ? ' invented:' + g.ungrounded.map((k)=>k.split(':').pop()).join(',') : ''}`);
  const ok = checkFails.length === 0 && !(raw || '').startsWith('[');
  tally[name].total++; if (ok) tally[name].pass++;
  console.log(`\n${name === 'FLASH' ? '🔵' : '🟣'} ${name}: ${ok ? 'PASS ✅' : 'FAIL ❌ — ' + checkFails.join(' | ')}`);
  console.log(`   ${msgs || (raw || '').slice(0, 140) || '(empty)'}`);
  // On a failure, dump the RAW model output so we can see WHY (format vs grounding).
  if (!ok) console.log(`   ⤷ RAW: ${JSON.stringify((raw || '').slice(0, 400))}`);
}

for (const sc of S) {
  const system = buildReadingSystem({ astrologer: sc.persona, client: sc.client, support: { email: 'support@asktro.in' }, language: 'hinglish', isSessionOpening: false, briefing: sc.brief });
  const dsSystem = deepseekPrompt(sc.persona, system);
  for (let r = 0; r < REPEATS; r++) {
    console.log('\n' + line('='));
    console.log(`❓ [${sc.id}]${REPEATS > 1 ? ` (run ${r + 1}/${REPEATS})` : ''}`);
    console.log(`   ${sc.persona.name} (${sc.persona.gender}, ${sc.persona.age}) → client ${sc.client.name} (${sc.client.gender}, ${sc.client.age})`);
    console.log(`   "${sc.q}"`);
    console.log(line('='));
    const dRaw = await askDeepSeek(dsSystem, sc.q);
    if (GEMINI_OK) { const gRaw = await askGemini(system, sc.q); await evalOne('FLASH', gRaw, sc); }
    await evalOne('DEEPSEEK', dRaw, sc);
  }
}

console.log('\n' + line('='));
console.log('SUMMARY');
if (GEMINI_OK) console.log(`🔵 FLASH:    ${tally.FLASH.pass}/${tally.FLASH.total} passed`);
console.log(`🟣 DEEPSEEK: ${tally.DEEPSEEK.pass}/${tally.DEEPSEEK.total} passed`);
console.log(line('='));
console.log('Note: address/gender/married checks are heuristic auto-flags — eyeball the FAILs, some may be false positives.\n');
