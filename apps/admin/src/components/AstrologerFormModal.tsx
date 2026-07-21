'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { callFn, Row } from '@/lib/hooks';
import { ImageUpload } from '@/components/ImageUpload';

const EXPERTISE = ['Vedic Astrology', 'Numerology', 'Tarot', 'Vastu Shastra', 'KP Astrology',
  'Nadi Astrology', 'Palmistry', 'Face Reading', 'Prashna', 'Muhurtha'];
const LANGUAGES = ['Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Punjabi', 'Gujarati', 'Malayalam'];

// Controlled specialization tags — universal to AI + human, used for discovery.
const SPECIALIZATIONS = ['love', 'marriage', 'career', 'money', 'health', 'education', 'spirituality', 'remedies'];
// Persona (AI) option lists. Only Vedic/KP/Lal Kitab have an authentic method
// today; the others read classically until each gets its own grounded calc.
const TRADITIONS: [string, string][] = [
  ['vedic', 'Vedic (Parashari)'], ['kp', 'KP'], ['lal_kitab', 'Lal Kitab'],
  ['nadi', 'Nadi (classical for now)'], ['numerology', 'Numerology (classical for now)'],
  ['tarot', 'Tarot (classical for now)'], ['vastu', 'Vastu (classical for now)'],
];
const VERBOSITIES: [string, string][] = [['concise', 'Concise'], ['balanced', 'Balanced'], ['expansive', 'Expansive']];
const LANGUAGE_LEANS: [string, string][] = [['', 'Auto (mirror client)'], ['hindi', 'Hindi-heavy'], ['balanced', 'Balanced'], ['english', 'English-friendly']];
const REMEDY_STYLES: [string, string][] = [['', 'Default (per school)'], ['gemstones', 'Gemstones'], ['mantras', 'Mantras'], ['rituals', 'Rituals'], ['practical', 'Practical'], ['minimal', 'Minimal (rarely)']];

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`pickchip${on ? ' on' : ''}`}>{label}</button>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const rupees = (paise: unknown) => (typeof paise === 'number' ? String(paise / 100) : '');

/**
 * One form for both creating and editing an astrologer. In `edit` mode every
 * profile field is editable (email stays fixed — it's the login) and changes
 * go through `updateAstrologer`; in `create` mode it calls `createAstrologer`.
 * The Rising Star toggle lives here so it's available in both flows.
 */
export function AstrologerFormModal({
  mode, isSuper, astrologer, onClose, onSaved,
}: {
  mode: 'create' | 'edit';
  isSuper: boolean;
  astrologer?: Row;
  onClose: () => void;
  onSaved?: (patch: Record<string, unknown>) => void;
}) {
  const a = astrologer ?? ({} as Row);
  const [f, setF] = useState({
    name: str(a.name),
    phone: str(a.phone),
    email: str(a.email),
    experience: a.experience != null ? String(a.experience) : '',
    // Per-type rates in ₹. Each defaults to the astrologer's existing per-type
    // value, else their legacy single rate — so older records pre-fill sensibly.
    chatRate: rupees(a.chatRatePaise ?? a.ratePerMinutePaise),
    voiceRate: rupees(a.voiceRatePaise ?? a.ratePerMinutePaise),
    videoRate: rupees(a.videoRatePaise ?? a.ratePerMinutePaise),
    // The form shows the ASTROLOGER'S share %. We store the platform cut
    // (commissionPercent = 100 − share), so the billing engine is unchanged.
    astrologerShare: a.commissionPercent != null ? String(100 - Number(a.commissionPercent)) : '',
    about: str(a.about),
    profilePhoto: str(a.profilePhoto),
    password: '',
    // Persona identity (drives the AI astrologer's age-based address terms +
    // gendered phrasing). Optional; only meaningful for AI personas.
    age: a.age != null ? String(a.age) : '',
    gender: str(a.gender),
  });
  const [expertise, setExpertise] = useState<string[]>(arr(a.expertise));
  const [languages, setLanguages] = useState<string[]>(arr(a.languages));
  const [specializations, setSpecializations] = useState<string[]>(arr(a.specializations));
  const [customExp, setCustomExp] = useState('');
  const [isAI, setIsAI] = useState(a.isAI === true);
  const [risingStar, setRisingStar] = useState(a.risingStar === true);
  const [busy, setBusy] = useState(false);

  // Persona flavour (AI). Pre-fills from the stored `persona` object in edit mode.
  const pa = (a.persona && typeof a.persona === 'object' ? a.persona : {}) as Record<string, unknown>;
  const preg = (pa.register && typeof pa.register === 'object' ? pa.register : {}) as Record<string, unknown>;
  const [p, setP] = useState({
    tradition: str(pa.tradition) || 'vedic',
    tone: str(pa.tone),
    verbosity: str(pa.verbosity) || 'balanced',
    languageLean: str(pa.languageLean),
    remedyStyle: str(pa.remedyStyle),
    voice: str(pa.voice),
    regYoung: str(preg.young),
    regMid: str(preg.mid),
    regSenior: str(preg.senior),
  });
  const setPk = (k: string, v: string) => setP((s) => ({ ...s, [k]: v }));

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (list: string[], setList: (x: string[]) => void, v: string) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    if (!f.name.trim()) return alert('Name is required.');
    if (mode === 'create' && !f.email.trim()) return alert('Name and email are required.');
    if (mode === 'create' && f.password.trim() && f.password.trim().length < 6) {
      return alert('Password must be at least 6 characters (or leave it blank to auto-generate one).');
    }
    setBusy(true);
    try {
      const paise = (v: string) => (v ? Math.round(Number(v) * 100) : undefined);
      const chatRate = paise(f.chatRate);
      const voiceRate = paise(f.voiceRate);
      const videoRate = paise(f.videoRate);
      // Keep the legacy single rate in sync (used as the fallback for anything
      // that reads the old field, e.g. AI personas) = the chat rate.
      const rate = chatRate;
      // Input is the astrologer's share; store the platform cut (100 − share).
      const comm = f.astrologerShare ? 100 - Number(f.astrologerShare) : undefined;
      // Persona flavour object (only meaningful for AI personas; the server
      // sanitizes + whitelists every value). Blank fields are dropped server-side.
      const personaPayload = {
        tradition: p.tradition || undefined,
        tone: p.tone.trim() || undefined,
        verbosity: p.verbosity || undefined,
        languageLean: p.languageLean || undefined,
        remedyStyle: p.remedyStyle || undefined,
        voice: p.voice.trim() || undefined,
        register: {
          young: p.regYoung.trim() || undefined,
          mid: p.regMid.trim() || undefined,
          senior: p.regSenior.trim() || undefined,
        },
      };
      if (mode === 'create') {
        const chosen = f.password.trim();
        const res = await callFn<{ tempPassword?: string | null }>('createAstrologer', {
          name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined,
          experience: Number(f.experience) || 0,
          ratePerMinutePaise: rate, chatRatePaise: chatRate, voiceRatePaise: voiceRate, videoRatePaise: videoRate,
          commissionPercent: comm,
          about: f.about.trim(), profilePhoto: f.profilePhoto.trim() || undefined,
          expertise, languages, specializations, isAI, risingStar,
          ...(isAI ? { persona: personaPayload } : {}),
          ...(f.age ? { age: Number(f.age) } : {}),
          ...(f.gender ? { gender: f.gender } : {}),
          ...(chosen ? { password: chosen } : {}),
        });
        const where = isSuper ? 'approved and live.' : 'created and is pending a Super Admin’s approval.';
        // Show whatever password will actually work: the one you set, or the
        // auto-generated temp password the function returned.
        const pwd = chosen || res?.tempPassword;
        alert(`Astrologer ${where}` + (pwd ? `\n\nLogin: ${f.email.trim()}\nPassword: ${pwd}` : ''));
      } else {
        const patch: Record<string, unknown> = {
          astrologerId: a.id,
          name: f.name.trim(),
          phone: f.phone.trim() || null,
          about: f.about.trim(),
          experience: Number(f.experience) || 0,
          expertise, languages, specializations, isAI, risingStar,
          ...(isAI ? { persona: personaPayload } : {}),
          ...(f.age ? { age: Number(f.age) } : {}),
          ...(f.gender ? { gender: f.gender } : {}),
          ...(rate != null ? { ratePerMinutePaise: rate } : {}),
          ...(chatRate != null ? { chatRatePaise: chatRate } : {}),
          ...(voiceRate != null ? { voiceRatePaise: voiceRate } : {}),
          ...(videoRate != null ? { videoRatePaise: videoRate } : {}),
          ...(comm != null ? { commissionPercent: comm } : {}),
          ...(f.profilePhoto.trim() ? { profilePhoto: f.profilePhoto.trim() } : {}),
        };
        await callFn('updateAstrologer', patch);
        onSaved?.(patch);
      }
      onClose();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return createPortal(
    <div className="tktmodal-root" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="tktmodal c-gold" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="tktmodal-head">
          <div>
            <h3>{mode === 'create' ? '✦ Add New Astrologer' : '✎ Edit Astrologer'}</h3>
            <p>{mode === 'create'
              ? (isSuper ? 'Goes live immediately.' : 'Will wait for Super Admin approval.')
              : 'Update any profile detail. Email (login) can’t be changed here.'}</p>
          </div>
          <button className="tktmodal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="tktmodal-body">
          <div className="af" style={{ marginBottom: 14 }}>
            <span>Photo</span>
            <ImageUpload folder="astrologer_photos" value={f.profilePhoto} onChange={(url) => set('profilePhoto', url)} />
          </div>
          <div className="astro-form">
            <label className="af"><span>Name *</span><input className="input" placeholder="Pt. Rajesh Sharma" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
            <label className="af"><span>Phone</span><input className="input" placeholder="+91 98765 43210" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className="af"><span>Email {mode === 'create' ? '* (login)' : '(login — fixed)'}</span>
              <input className="input" placeholder="astro@example.com" value={f.email}
                disabled={mode === 'edit'} onChange={(e) => set('email', e.target.value)} />
            </label>
            <label className="af"><span>Experience (years)</span><input className="input" placeholder="10" value={f.experience} onChange={(e) => set('experience', e.target.value)} /></label>
            <label className="af"><span>Age (for AI persona)</span><input className="input" type="number" placeholder="28" value={f.age} onChange={(e) => set('age', e.target.value)} /></label>
            <label className="af"><span>Gender (for AI persona)</span>
              <select className="input" value={f.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
            {/* Rates & commission are money inputs — only a Super Admin can set
                them (the server strips them otherwise). Non-super onboards the
                profile; a Super sets pricing at approval. */}
            {isSuper && <>
              <label className="af"><span>Chat rate (₹/min){mode === 'create' ? ' *' : ''}</span><input className="input" placeholder="25" value={f.chatRate} onChange={(e) => set('chatRate', e.target.value)} /></label>
              <label className="af"><span>Voice rate (₹/min)</span><input className="input" placeholder="29" value={f.voiceRate} onChange={(e) => set('voiceRate', e.target.value)} /></label>
              <label className="af"><span>Video rate (₹/min)</span><input className="input" placeholder="45" value={f.videoRate} onChange={(e) => set('videoRate', e.target.value)} /></label>
              <label className="af"><span>Astrologer share (%){mode === 'create' ? ' *' : ''}</span><input className="input" placeholder="65" value={f.astrologerShare} onChange={(e) => set('astrologerShare', e.target.value)} /></label>
            </>}
          </div>
          {!isSuper && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Rates, commission and AI status are set by a Super Admin at approval.
            </p>
          )}

          {mode === 'create' && (
            <label className="af" style={{ marginTop: 12 }}>
              <span>Password (login) — leave blank to auto-generate</span>
              <input className="input" type="text" placeholder="Set a password (min 6 chars), or leave blank"
                value={f.password} onChange={(e) => set('password', e.target.value)} />
            </label>
          )}

          <label className="af" style={{ marginTop: 12 }}><span>Bio</span>
            <textarea className="input" rows={3} placeholder="Experienced Vedic astrologer with deep knowledge of…" value={f.about} onChange={(e) => set('about', e.target.value)} />
          </label>

          <p className="af-label">Expertise</p>
          <div className="pickrow">
            {EXPERTISE.map((x) => <Chip key={x} label={x} on={expertise.includes(x)} onClick={() => toggle(expertise, setExpertise, x)} />)}
            {expertise.filter((x) => !EXPERTISE.includes(x)).map((x) => <Chip key={x} label={x} on onClick={() => toggle(expertise, setExpertise, x)} />)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="input" placeholder="Add custom expertise…" value={customExp} onChange={(e) => setCustomExp(e.target.value)} />
            <button className="btn sm secondary" onClick={() => { const v = customExp.trim(); if (v) { toggle(expertise, setExpertise, v); setCustomExp(''); } }}>Add</button>
          </div>

          <p className="af-label">Languages</p>
          <div className="pickrow">
            {LANGUAGES.map((x) => <Chip key={x} label={x} on={languages.includes(x)} onClick={() => toggle(languages, setLanguages, x)} />)}
          </div>

          {/* Specializations — a controlled list shared by AI + human, used for
              home-screen discovery ("Love", "Career"…). Separate from free-text
              Expertise (which stays for display). */}
          <p className="af-label">Specializations (for discovery)</p>
          <div className="pickrow">
            {SPECIALIZATIONS.map((x) => (
              <Chip key={x} label={x[0].toUpperCase() + x.slice(1)} on={specializations.includes(x)}
                onClick={() => toggle(specializations, setSpecializations, x)} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {isSuper && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={isAI} onChange={(e) => setIsAI(e.target.checked)} /> AI astrologer (adds a subtle “AI” tag in the app)
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={risingStar} onChange={(e) => setRisingStar(e.target.checked)} /> ★ Rising Star (features them in the app’s Rising Stars rail)
            </label>
          </div>

          {/* AI PERSONA — only for AI astrologers. Every knob has a safe default;
              leaving them alone gives a classical Vedic voice. This is what makes
              each AI astrologer a distinct, believable practitioner. */}
          {isAI && (
            <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--line)', borderRadius: 10, background: 'rgba(184,134,11,0.04)' }}>
              <p className="af-label" style={{ marginTop: 0 }}>🪔 AI Persona</p>
              <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>
                Shapes how this AI astrologer reads &amp; speaks. Vedic, KP &amp; Lal Kitab use their authentic
                method; the others read classically for now. All defaults are sensible — set only what you want.
              </p>
              <div className="astro-form">
                <label className="af"><span>School / tradition</span>
                  <select className="input" value={p.tradition} onChange={(e) => setPk('tradition', e.target.value)}>
                    {TRADITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="af"><span>Message length</span>
                  <select className="input" value={p.verbosity} onChange={(e) => setPk('verbosity', e.target.value)}>
                    {VERBOSITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="af"><span>Language lean</span>
                  <select className="input" value={p.languageLean} onChange={(e) => setPk('languageLean', e.target.value)}>
                    {LANGUAGE_LEANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="af"><span>Remedy style</span>
                  <select className="input" value={p.remedyStyle} onChange={(e) => setPk('remedyStyle', e.target.value)}>
                    {REMEDY_STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              <label className="af" style={{ marginTop: 10 }}><span>Manner / tone (short)</span>
                <input className="input" placeholder="warm and motherly · blunt and precise · gentle young guide"
                  value={p.tone} onChange={(e) => setPk('tone', e.target.value)} />
              </label>
              <label className="af" style={{ marginTop: 10 }}><span>Voice / backstory (free text)</span>
                <textarea className="input" rows={2} placeholder="Trained in Kashi; 30 years reading in Varanasi; likes to open with a proverb…"
                  value={p.voice} onChange={(e) => setPk('voice', e.target.value)} />
              </label>
              <p className="af-label">Tone by client age (optional — blank uses a sensible default)</p>
              <label className="af"><span>Young client (&lt;35)</span>
                <input className="input" placeholder="lighter, warmer, encouraging" value={p.regYoung} onChange={(e) => setPk('regYoung', e.target.value)} />
              </label>
              <label className="af" style={{ marginTop: 8 }}><span>Mid-life (35–49)</span>
                <input className="input" placeholder="balanced, practical, grounded" value={p.regMid} onChange={(e) => setPk('regMid', e.target.value)} />
              </label>
              <label className="af" style={{ marginTop: 8 }}><span>Senior (50+)</span>
                <input className="input" placeholder="slower, respectful, traditional" value={p.regSenior} onChange={(e) => setPk('regSenior', e.target.value)} />
              </label>
            </div>
          )}
        </div>
        <div className="tktmodal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : mode === 'create' ? 'Add Astrologer' : 'Save Changes'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
