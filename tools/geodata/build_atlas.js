// Build a sharded, offline India place atlas from the GeoNames IN dump.
// Input:  tools/geodata/IN.txt.gz (GeoNames India, tab-separated)
// Output: apps/customer/assets/geo/<2-letter-key>.txt   (name\tADMIN1\tlat\tlng)
//         apps/customer/assets/geo/_meta.json
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const path = require('path');

const ROOT = require('path').resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'tools/geodata/IN.txt.gz');
const OUT = path.join(ROOT, 'apps/customer/assets/geo');

// GeoNames India admin1 code -> state/UT name (derived from the dump's capitals
// + standard GeoNames codes). '00','04','??' etc. -> unknown (blank state).
const STATES = {
  '01':'Andaman & Nicobar','02':'Andhra Pradesh','03':'Assam','05':'Chandigarh',
  '06':'Dadra & Nagar Haveli','07':'Delhi','09':'Gujarat','10':'Haryana',
  '11':'Himachal Pradesh','12':'Jammu & Kashmir','13':'Kerala','14':'Lakshadweep',
  '16':'Maharashtra','17':'Manipur','18':'Meghalaya','19':'Karnataka',
  '20':'Nagaland','21':'Odisha','22':'Puducherry','23':'Punjab','24':'Rajasthan',
  '25':'Tamil Nadu','26':'Tripura','28':'West Bengal','29':'Sikkim',
  '30':'Arunachal Pradesh','31':'Mizoram','33':'Goa','34':'Bihar',
  '35':'Madhya Pradesh','36':'Uttar Pradesh','37':'Chhattisgarh','38':'Jharkhand',
  '39':'Uttarakhand','40':'Telangana','41':'Ladakh','52':'Daman & Diu',
};

const EXCLUDE = new Set(['PPLQ','PPLH']); // abandoned / historical
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const shards = new Map();   // key -> array of {name, a1, lat, lng, pop}
const seen = new Set();
let rows = 0, kept = 0, dropDup = 0, dropExcl = 0, dropOther = 0;

const rl = readline.createInterface({ input: fs.createReadStream(SRC).pipe(zlib.createGunzip()) });
rl.on('line', (line) => {
  rows++;
  const f = line.split('\t');
  if (f[6] !== 'P') { dropOther++; return; }
  if (EXCLUDE.has(f[7])) { dropExcl++; return; }
  const ascii = (f[2] && f[2].trim()) ? f[2].trim() : (f[1] || '').trim();
  if (!ascii) { dropOther++; return; }
  const key = norm(ascii);
  if (key.length < 2) { dropOther++; return; }
  const lat = parseFloat(f[4]), lng = parseFloat(f[5]);
  if (!isFinite(lat) || !isFinite(lng)) { dropOther++; return; }
  const a1 = f[10] || '';
  const pop = parseInt(f[14] || '0', 10) || 0;
  // Dedup only TRUE duplicates (same name + state + ~1km) — keeps distinct
  // same-named villages that are genuinely different places.
  const dk = `${key}|${a1}|${lat.toFixed(2)}|${lng.toFixed(2)}`;
  if (seen.has(dk)) { dropDup++; return; }
  seen.add(dk);
  const sk = key.slice(0, 2);
  if (!shards.has(sk)) shards.set(sk, []);
  shards.get(sk).push({ name: ascii, a1, lat: lat.toFixed(4), lng: lng.toFixed(4), pop });
  kept++;
});
rl.on('close', () => {
  let bytes = 0, files = 0, biggest = { k: '', n: 0 };
  const stateCount = {};
  for (const [sk, list] of shards) {
    list.sort((a, b) => b.pop - a.pop); // best-known places first
    const body = list.map((e) => `${e.name}\t${e.a1}\t${e.lat}\t${e.lng}`).join('\n');
    fs.writeFileSync(path.join(OUT, `${sk}.txt`), body);
    bytes += Buffer.byteLength(body); files++;
    if (list.length > biggest.n) biggest = { k: sk, n: list.length };
    for (const e of list) stateCount[e.a1] = (stateCount[e.a1] || 0) + 1;
  }
  fs.writeFileSync(path.join(OUT, '_meta.json'), JSON.stringify({
    source: 'GeoNames IN', built: new Date().toISOString(), places: kept, shards: files,
  }, null, 2));
  console.log('rows read:', rows);
  console.log('places kept:', kept);
  console.log('dropped — dup:', dropDup, '| abandoned/historical:', dropExcl, '| other/no-coord:', dropOther);
  console.log('shard files:', files, '| total asset bytes:', (bytes/1048576).toFixed(1), 'MB');
  console.log('biggest shard:', biggest.k, '=', biggest.n, 'places');
  const named = Object.entries(stateCount).filter(([k]) => STATES[k]).reduce((s, [,v]) => s+v, 0);
  console.log('places with a known state:', named, `(${(100*named/kept).toFixed(1)}%)`);
});
