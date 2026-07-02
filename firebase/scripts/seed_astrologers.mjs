// Seeds a handful of demo astrologers into Firestore so the customer app's
// Home / Search / profile screens have real data to show. Uses the Firestore
// REST API with the project's Web API key — no service-account file needed —
// so it works while the database is in test mode (open rules).
//
//   node firebase/scripts/seed_astrologers.mjs
//
// It is idempotent: each astrologer has a fixed document id, so re-running
// overwrites rather than duplicating. Once real security rules are deployed
// (astrologer create == admin only) this script will stop working by design;
// seed before deploying rules, or run it against the emulator.

const PROJECT_ID = process.env.ASKTRO_PROJECT_ID || 'asktro-tech-provate-limited';
const API_KEY = process.env.ASKTRO_API_KEY || 'AIzaSyDTgJRhfYDXivkNOzPkSBi6ysW9osb4f0A';
const BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ---- JS value -> Firestore typed value ------------------------------------
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toValue) } };
  }
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toValue(val);
    return { mapValue: { fields } };
  }
  throw new Error(`Unsupported value: ${v}`);
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}

// A float that Firestore keeps as a double even when whole (e.g. rating 5.0).
class Double {
  constructor(n) { this.n = n; }
}
// override for ratings so integers stay doubles
function ratingValue(n) {
  return { doubleValue: n };
}

// ---- demo data ------------------------------------------------------------
const QUICK = ['Namaste 🙏', 'Please share your date, time & place of birth', 'How may I guide you today?'];

const ASTROLOGERS = [
  {
    id: 'seed-astro-01', name: 'Pandit Rajesh Sharma',
    photo: 'https://randomuser.me/api/portraits/men/32.jpg',
    about: 'Third-generation Vedic astrologer specialising in KP system and remedial guidance. 18 years helping people find clarity in career, marriage and health.',
    experience: 18, languages: ['Hindi', 'English'],
    expertise: ['Vedic', 'KP System', 'Career'],
    rating: 4.9, reviews: 2140, sessions: 5230, followers: 8900, resp: 30,
    online: true, featured: true,
  },
  {
    id: 'seed-astro-02', name: 'Acharya Meera Nair',
    photo: 'https://randomuser.me/api/portraits/women/44.jpg',
    about: 'Tarot reader and numerologist with an intuitive, compassionate approach. Known for accurate timing predictions on love and relationships.',
    experience: 12, languages: ['English', 'Malayalam', 'Hindi'],
    expertise: ['Tarot', 'Numerology', 'Love & Relationships'],
    rating: 4.8, reviews: 1680, sessions: 3910, followers: 6400, resp: 45,
    online: true, featured: true,
  },
  {
    id: 'seed-astro-03', name: 'Guru Anil Deshmukh',
    photo: 'https://randomuser.me/api/portraits/men/68.jpg',
    about: 'Vastu and Vedic expert. Guides on home, business premises and auspicious muhurat. Calm, practical remedies without fear or superstition.',
    experience: 22, languages: ['Marathi', 'Hindi', 'English'],
    expertise: ['Vastu', 'Vedic', 'Muhurat'],
    rating: 4.7, reviews: 990, sessions: 2450, followers: 3200, resp: 60,
    online: true, featured: false,
  },
  {
    id: 'seed-astro-04', name: 'Dr. Priya Iyer',
    photo: 'https://randomuser.me/api/portraits/women/65.jpg',
    about: 'PhD in Jyotish, blends classical numerology and palmistry. Specialises in career direction and education for students and young professionals.',
    experience: 15, languages: ['Tamil', 'English', 'Hindi'],
    expertise: ['Numerology', 'Palmistry', 'Career'],
    rating: 4.9, reviews: 2560, sessions: 6120, followers: 11200, resp: 25,
    online: true, featured: true,
  },
  {
    id: 'seed-astro-05', name: 'Sri Venkatesh Rao',
    photo: 'https://randomuser.me/api/portraits/men/52.jpg',
    about: 'Prashna and Vedic specialist from a traditional lineage. Deep expertise in horary astrology — get answers even without exact birth time.',
    experience: 27, languages: ['Telugu', 'Kannada', 'English'],
    expertise: ['Vedic', 'Prashna', 'Horary'],
    rating: 4.6, reviews: 1320, sessions: 4010, followers: 4700, resp: 90,
    online: false, featured: false,
  },
  {
    id: 'seed-astro-06', name: 'Jyotishi Kavita Singh',
    photo: 'https://randomuser.me/api/portraits/women/21.jpg',
    about: 'Warm and honest tarot and relationship counsellor. Helps you navigate love, breakups and reconciliation with practical next steps.',
    experience: 9, languages: ['Hindi', 'Punjabi', 'English'],
    expertise: ['Tarot', 'Love & Relationships'],
    rating: 4.8, reviews: 1450, sessions: 3320, followers: 5800, resp: 40,
    online: true, featured: false,
  },
  {
    id: 'seed-astro-07', name: 'Pandit Suresh Trivedi',
    photo: 'https://randomuser.me/api/portraits/men/75.jpg',
    about: 'KP and career-focused astrologer. Straightforward guidance on job change, business, and finance with clear timelines.',
    experience: 14, languages: ['Gujarati', 'Hindi', 'English'],
    expertise: ['KP System', 'Career', 'Finance'],
    rating: 4.5, reviews: 870, sessions: 2100, followers: 2600, resp: 55,
    online: true, featured: false,
  },
  {
    id: 'seed-astro-08', name: 'Maa Ananya Ghosh',
    photo: 'https://randomuser.me/api/portraits/women/90.jpg',
    about: 'Palmistry and tarot with 20 years of practice. Gentle, spiritual guidance on family, health and life purpose.',
    experience: 20, languages: ['Bengali', 'Hindi', 'English'],
    expertise: ['Palmistry', 'Tarot', 'Spiritual Healing'],
    rating: 4.9, reviews: 3010, sessions: 7040, followers: 13400, resp: 35,
    online: true, featured: true,
  },
];

function docFor(a, i) {
  // Stagger createdAt so "Newest" ordering is meaningful.
  const created = new Date(Date.now() - i * 36 * 3600 * 1000);
  return {
    name: a.name,
    profilePhoto: a.photo,
    about: a.about,
    experience: a.experience,
    languages: a.languages,
    expertise: a.expertise,
    rating: a.rating,
    totalReviews: a.reviews,
    totalConsultations: a.sessions,
    followers: a.followers,
    responseTimeSec: a.resp,
    onlineStatus: a.online,
    available: a.online,
    verified: true,
    featured: a.featured,
    accountStatus: 'approved',
    active: true,
    earnings: 0,
    quickReplies: QUICK,
    availability: {},
    createdAt: created,
  };
}

async function put(id, data) {
  // PATCH with no updateMask writes the doc to exactly these fields (upsert).
  const url = `${BASE}/astrologers/${id}?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH ${id} -> HTTP ${res.status}: ${body}`);
  }
}

async function main() {
  let ok = 0;
  for (let i = 0; i < ASTROLOGERS.length; i++) {
    const a = ASTROLOGERS[i];
    await put(a.id, docFor(a, i));
    ok++;
    console.log(`  ✓ ${a.id}  ${a.name}`);
  }
  console.log(`\nSeeded ${ok}/${ASTROLOGERS.length} astrologers into "${PROJECT_ID}".`);
}

main().catch((e) => {
  console.error('\nSeed failed:', e.message);
  process.exit(1);
});
