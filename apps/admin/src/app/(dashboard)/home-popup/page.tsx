'use client';

import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { ImageUpload } from '@/components/ImageUpload';
import { WelcomeSheetPreview } from '@/components/WelcomeSheetPreview';
import {
  BG_THEMES,
  BgThemeId,
  BreakupRow,
  PARTICLE_OPTIONS,
  ParticleStyle,
  PLAN_CREDIT,
  PLAN_OPTIONS,
  bgTheme,
  computeWelcomeTotals,
  inputToPaise,
  paiseToInput,
  rupees,
} from '@/lib/welcomePopup';

type Audience = 'all' | 'paid' | 'unpaid';
type DisplayMode = 'small' | 'half' | 'full';

interface PopupDoc {
  active: boolean;
  audience: Audience;
  displayMode: DisplayMode;
  theme: string; // '' = plain centre card, no theme
  title: string;
  body: string;
  ctaLabel: string;
  deeplink: string;
  code: string;
  image: string;
  imageStyle: 'banner' | 'portrait';
  imageFill: boolean;
  // Only used by the 'welcome_reward' theme (the designed ₹-gift banner). Stored
  // in paise to match the app; empty/absent → the app's hardcoded defaults.
  offerGetPaise: number; // "Get ₹X" headline number.
  rechargeBasePaise: number; // pre-GST base of the recharge button.
  rechargePlanId: string; // recharge plan the button opens (= what the server credits).
  // Welcome-reward Studio keys — MUST match POPUP_FIELD_CONTRACT.md exactly.
  // The app renders the two-tone headline from these words when `title` is blank.
  titleWord1: string;
  titleWord2: string;
  gstRatePct: number;
  showBreakup: boolean;
  totalOverridePaise: number | null;
  breakupRows: BreakupRow[];
  bgTheme: BgThemeId;
  particleStyle: ParticleStyle;
  character: string; // 'pandit' bundled art ('' also = pandit); custom art via `image`.
}

const DEFAULTS: PopupDoc = {
  active: false,
  audience: 'unpaid',
  displayMode: 'half',
  theme: 'welcome_reward',
  title: '',
  body: '',
  ctaLabel: 'Grab this offer',
  deeplink: '',
  code: '',
  image: '',
  imageStyle: 'banner',
  imageFill: false,
  offerGetPaise: 7700,
  rechargeBasePaise: 2500,
  rechargePlanId: 'promo_welcome',
  titleWord1: 'Triple',
  titleWord2: 'Dhamaka',
  gstRatePct: 18,
  showBreakup: true,
  totalOverridePaise: null,
  breakupRows: [],
  bgTheme: 'lavender',
  particleStyle: 'mixed',
  character: 'pandit',
};

const AUD_LABEL: Record<Audience, string> = {
  all: 'Everyone',
  unpaid: 'Only unpaid',
  paid: 'Only paid',
};
const STYLE_LABEL: Record<DisplayMode, string> = {
  small: 'Centre card',
  half: 'Bottom sheet',
  full: 'Full takeover',
};

/** Ready-made welcome-offer starting points (prototype gallery). Picking one
 *  fills the fields with a fresh draft you then tweak & save. */
interface StudioPreset {
  id: string;
  name: string;
  word1: string;
  word2: string;
  getPaise: number;
  basePaise: number;
  plan: string;
  body: string;
  bg: BgThemeId;
  fx: ParticleStyle;
  aud: Audience;
}
const STUDIO_PRESETS: StudioPreset[] = [
  { id: 'triple', name: 'Triple Dhamaka', word1: 'Triple', word2: 'Dhamaka', getPaise: 7700, basePaise: 2500, plan: 'promo_welcome', body: 'Grab this one-time offer', bg: 'lavender', fx: 'mixed', aud: 'unpaid' },
  { id: 'double', name: 'Double Dhamaka', word1: 'Double', word2: 'Dhamaka', getPaise: 10000, basePaise: 5000, plan: 'promo_double', body: 'Twice the blessings, once only', bg: 'aurora', fx: 'coins', aud: 'unpaid' },
  { id: 'cosmic', name: 'Cosmic Blessing', word1: 'Cosmic', word2: 'Blessing', getPaise: 5100, basePaise: 0, plan: 'promo_welcome', body: 'The stars aligned for you', bg: 'midnight', fx: 'stars', aud: 'all' },
  { id: 'guru', name: 'Guru Kripa', word1: 'Guru', word2: 'Kripa', getPaise: 10800, basePaise: 9900, plan: 'plan_99', body: 'A blessing from your guru', bg: 'emerald', fx: 'stars', aud: 'paid' },
];

function toBreakupRows(v: unknown): BreakupRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ label: String(r.label ?? ''), amountPaise: Math.round(Number(r.amountPaise) || 0) }));
}

/** Map a saved `popups` row to the strongly-typed PopupDoc used by the form,
 *  the live preview and the app-slot mirror. */
function rowToPopup(r: Row): PopupDoc {
  const override = r.totalOverridePaise;
  return {
    active: r.active === true,
    audience: (r.audience as Audience) ?? 'all',
    displayMode: (r.displayMode as DisplayMode) ?? 'small',
    theme: (r.theme as string) ?? '',
    title: (r.title as string) ?? '',
    body: (r.body as string) ?? '',
    ctaLabel: (r.ctaLabel as string) ?? 'Grab this offer',
    deeplink: (r.deeplink as string) ?? '',
    code: (r.code as string) ?? '',
    image: (r.image as string) ?? '',
    imageStyle: (r.imageStyle as 'banner' | 'portrait') ?? 'banner',
    imageFill: r.imageFill === true,
    offerGetPaise: (r.offerGetPaise as number) ?? 7700,
    rechargeBasePaise: (r.rechargeBasePaise as number) ?? 2500,
    rechargePlanId: (r.rechargePlanId as string) ?? 'promo_welcome',
    titleWord1: (r.titleWord1 as string) ?? 'Triple',
    titleWord2: (r.titleWord2 as string) ?? 'Dhamaka',
    gstRatePct: typeof r.gstRatePct === 'number' ? r.gstRatePct : 18,
    showBreakup: r.showBreakup !== false,
    totalOverridePaise: typeof override === 'number' ? override : null,
    breakupRows: toBreakupRows(r.breakupRows),
    bgTheme: (r.bgTheme as BgThemeId) ?? 'lavender',
    particleStyle: (r.particleStyle as ParticleStyle) ?? 'mixed',
    character: (r.character as string) || 'pandit',
  };
}

/** The complete field set written to Firestore (both the saved doc and the live
 *  mirror). This page only ever authors the welcome_reward pop-up, so `theme` is
 *  forced to 'welcome_reward', `title` is forced blank (the app renders the
 *  two-tone headline from titleWord1/titleWord2), and the style is half/full
 *  only (welcome has no centre-card option). */
function toDocData(f: PopupDoc) {
  return {
    audience: f.audience,
    displayMode: f.displayMode === 'full' ? 'full' : 'half',
    theme: 'welcome_reward',
    title: '',
    body: f.body.trim(),
    ctaLabel: f.ctaLabel.trim() || 'Grab this offer',
    deeplink: f.deeplink.trim(),
    code: f.code.trim(),
    image: f.image,
    imageStyle: f.imageStyle,
    imageFill: f.imageFill,
    offerGetPaise: f.offerGetPaise,
    rechargeBasePaise: f.rechargeBasePaise,
    rechargePlanId: f.rechargePlanId.trim() || 'promo_welcome',
    // Welcome-reward Studio keys (safe defaults reproduce the current look).
    titleWord1: f.titleWord1.trim(),
    titleWord2: f.titleWord2.trim(),
    gstRatePct: f.gstRatePct,
    showBreakup: f.showBreakup,
    totalOverridePaise: f.totalOverridePaise,
    breakupRows: f.breakupRows.map((r) => ({ label: r.label.trim(), amountPaise: Math.round(r.amountPaise) })),
    bgTheme: f.bgTheme,
    particleStyle: f.particleStyle,
    character: f.character || 'pandit',
  };
}

/** Home Pop-up Studio → portal-managed pop-ups that greet people on app open.
 *  Each pop-up is a doc in the `popups` collection (create / edit / delete /
 *  preview). Exactly ONE can be "live"; the live one is mirrored into
 *  `homeSections/popup`, which the app already reads — so the app is untouched.
 *  Picking the "Welcome Reward" style opens the full Studio (faithful phone
 *  preview + billing-wired editor); every other style keeps the classic editor. */
export default function HomePopupPage() {
  const { rows, loading } = useCollection('popups');
  const [form, setForm] = useState<PopupDoc>(DEFAULTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Row | null>(null);
  const [pvView, setPvView] = useState<'offer' | 'reward'>('offer');
  const migrated = useRef(false);

  // One-time migration: if the saved list is empty but a legacy single pop-up
  // exists at homeSections/popup (with content), pull it into the list so it
  // shows up with View/Edit/Delete and there's a single source of truth.
  useEffect(() => {
    if (loading || migrated.current || rows.length > 0) return;
    migrated.current = true;
    (async () => {
      const snap = await getDoc(doc(db, 'homeSections', 'popup'));
      const d = snap.data() as Partial<PopupDoc> | undefined;
      if (d && (d.title ?? '').trim()) {
        await addDoc(collection(db, 'popups'), {
          ...DEFAULTS, ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
    })().catch(() => { /* best-effort migration */ });
  }, [loading, rows.length]);

  const set = <K extends keyof PopupDoc>(k: K, v: PopupDoc[K]) => setForm((f) => ({ ...f, [k]: v }));

  function resetForm() {
    setEditingId(null);
    setForm(DEFAULTS);
  }

  function startEdit(p: Row) {
    setEditingId(p.id);
    // This page only authors welcome_reward — coerce any legacy row's theme.
    setForm({ ...rowToPopup(p), theme: 'welcome_reward' });
    setPvView('offer');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Load a gallery starter as a fresh welcome_reward draft. */
  function applyPreset(pr: StudioPreset) {
    setEditingId(null);
    setForm({
      ...DEFAULTS,
      theme: 'welcome_reward',
      displayMode: 'half',
      audience: pr.aud,
      titleWord1: pr.word1,
      titleWord2: pr.word2,
      body: pr.body,
      offerGetPaise: pr.getPaise,
      rechargeBasePaise: pr.basePaise,
      rechargePlanId: pr.plan,
      bgTheme: pr.bg,
      particleStyle: pr.fx,
    });
    setPvView('offer');
  }

  /** Start a blank welcome_reward draft. */
  function newWelcome() {
    setEditingId(null);
    setForm({
      ...DEFAULTS,
      theme: 'welcome_reward',
      displayMode: 'half',
      audience: 'unpaid',
      titleWord1: 'Your',
      titleWord2: 'Offer',
      body: 'A gift for you',
      offerGetPaise: 5000,
      rechargeBasePaise: 2500,
      bgTheme: 'nebula',
    });
    setPvView('offer');
  }

  // Mirror the live pop-up into homeSections/popup (what the app reads). Passing
  // null clears it (active:false) so nothing shows. The app is never changed.
  async function syncLive(p: PopupDoc | null) {
    const data = p ? { active: true, ...toDocData(p) } : { ...DEFAULTS };
    await setDoc(doc(db, 'homeSections', 'popup'), { ...data, updatedAt: serverTimestamp() });
  }

  const save = async () => {
    // The welcome_reward banner is self-designed (headline from titleWord1/2,
    // its own art), so it can always be saved with a blank title/image.
    setSaving(true);
    try {
      const data = toDocData(form);
      if (editingId) {
        const wasLive = rows.find((r) => r.id === editingId)?.active === true;
        await updateDoc(doc(db, 'popups', editingId), { ...data, updatedAt: serverTimestamp() });
        if (wasLive) await syncLive({ ...form, active: true });
      } else {
        await addDoc(collection(db, 'popups'), {
          ...data, active: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setSaving(false); }
  };

  // Go live / take down — exactly one pop-up can be live at a time.
  async function toggleLive(p: Row) {
    setSaving(true);
    try {
      if (p.active === true) {
        await updateDoc(doc(db, 'popups', p.id), { active: false, updatedAt: serverTimestamp() });
        await syncLive(null);
      } else {
        await Promise.all(
          rows.filter((r) => r.active && r.id !== p.id)
            .map((r) => updateDoc(doc(db, 'popups', r.id), { active: false, updatedAt: serverTimestamp() })),
        );
        await updateDoc(doc(db, 'popups', p.id), { active: true, updatedAt: serverTimestamp() });
        await syncLive(rowToPopup(p));
      }
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setSaving(false); }
  }

  async function remove(p: Row) {
    if (!confirm('Delete this pop-up permanently?')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'popups', p.id));
      if (p.active === true) await syncLive(null); // it was live — clear the app slot
      if (editingId === p.id) resetForm();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setSaving(false); }
  }

  const list = [...rows].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  // Live billing figures for the welcome studio strip / preview.
  const totals = computeWelcomeTotals({
    rechargeBasePaise: form.rechargeBasePaise,
    gstRatePct: form.gstRatePct,
    breakupRows: form.breakupRows,
    totalOverridePaise: form.totalOverridePaise,
  });
  const planCredit = PLAN_CREDIT[form.rechargePlanId];
  const editingRowLive = editingId ? rows.find((r) => r.id === editingId)?.active === true : false;

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Home Pop-up Studio</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Design the pop-up that greets people on app open — live preview, wired to billing. Build as many
        as you like; the one you set <b>Live</b> is the one that shows (only one at a time). Changes reach
        the app instantly — no rebuild.
      </p>

      {/* ============================ WELCOME REWARD STUDIO ============================ */}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,300px) minmax(0,1fr)', gap: 18, marginTop: 16, alignItems: 'start' }}>
          {/* PREVIEW */}
          <div style={{ position: 'sticky', top: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="af-label" style={{ margin: 0 }}>Live preview</span>
                <div style={{ display: 'inline-flex', gap: 4, background: '#f2eefb', borderRadius: 10, padding: 3 }}>
                  <button type="button" className={`aview-tab${pvView === 'offer' ? ' on' : ''}`} style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setPvView('offer')}>Offer</button>
                  <button type="button" className={`aview-tab${pvView === 'reward' ? ' on' : ''}`} style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setPvView('reward')}>“No thanks” reward</button>
                </div>
              </div>
              <WelcomeSheetPreview
                word1={form.titleWord1}
                word2={form.titleWord2}
                body={form.body}
                offerGetPaise={form.offerGetPaise}
                rechargeBasePaise={form.rechargeBasePaise}
                gstRatePct={form.gstRatePct}
                breakupRows={form.breakupRows}
                showBreakup={form.showBreakup}
                totalOverridePaise={form.totalOverridePaise}
                bgTheme={form.bgTheme}
                particleStyle={form.particleStyle}
                image={form.image}
                displayMode={form.displayMode === 'full' ? 'full' : 'half'}
                view={pvView}
                rewardCreditPaise={planCredit ?? form.offerGetPaise}
              />
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10, textAlign: 'center' }}>
                Tap “Total Payment” in the sheet to see the price split.
              </p>
            </div>
          </div>

          {/* EDITOR */}
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Templates */}
            <div className="card" style={{ padding: 16 }}>
              <SecHead badge="✦" title="Templates" hint="Pick one to start, then tweak & save" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10, marginTop: 12 }}>
                {STUDIO_PRESETS.map((pr) => {
                  const th = bgTheme(pr.bg);
                  return (
                    <button type="button" key={pr.id} className="wtpl" onClick={() => applyPreset(pr)}
                      style={{ border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: '#fff', textAlign: 'left', padding: 0 }}>
                      <div style={{ height: 118, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3, padding: '8px 6px 8px', background: `linear-gradient(180deg, ${th.stops[0]}, ${th.stops[2]})` }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/promo-art/welcome.webp" alt="" style={{ position: 'absolute', top: 6, height: 60, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 5px 7px rgba(20,10,40,.28))' }} />
                        <div style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 700, lineHeight: 0.95, zIndex: 1, textShadow: '0 1px 4px rgba(0,0,0,.1)' }}>
                          <span style={{ color: th.dark ? '#F5F0FF' : '#1C1633' }}>{pr.word1}</span>{' '}
                          <span style={{ color: '#C88617' }}>{pr.word2}</span>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#5A3F12', background: 'linear-gradient(120deg,#F7DE88,#E7BE46)', padding: '2px 8px', borderRadius: 99, zIndex: 1 }}>Get {rupees(pr.getPaise)}</span>
                      </div>
                      <div style={{ padding: '7px 9px', borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, display: 'block', color: 'var(--navy)' }}>{pr.name}</span>
                        <span className="muted" style={{ fontSize: 10 }}>{th.name}</span>
                      </div>
                    </button>
                  );
                })}
                <button type="button" className="wtpl" onClick={newWelcome}
                  style={{ display: 'grid', placeItems: 'center', minHeight: 160, border: '1.5px dashed var(--primary)', borderRadius: 14, background: '#fff', color: 'var(--primary)', fontWeight: 800, fontSize: 13, cursor: 'pointer', gap: 4 }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>＋</span>New template
                </button>
              </div>
            </div>

            {/* Headline */}
            <div className="card" style={{ padding: 16 }}>
              <SecHead badge="A" title="Headline & words" />
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                  <Field label="Headline — first word (dark)">
                    <input className="input" value={form.titleWord1} onChange={(e) => set('titleWord1', e.target.value)} />
                  </Field>
                  <Field label="Headline — accent word (gold)">
                    <input className="input" value={form.titleWord2} onChange={(e) => set('titleWord2', e.target.value)} />
                  </Field>
                </div>
                <Field label="Offer line (under the character)">
                  <input className="input" value={form.body} placeholder="Grab this one-time offer" onChange={(e) => set('body', e.target.value)} />
                </Field>
                <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
                  The subtitle “Get ₹X in your wallet” fills in automatically from the gift amount below.
                </p>
              </div>
            </div>

            {/* Offer & billing */}
            <div className="card" style={{ padding: 16 }}>
              <SecHead badge="₹" title="Offer & billing" hint="the numbers the engine reads" />
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                  <Field label="Gift shown to user (₹, “Get ₹X”)">
                    <input className="input" type="number" min={0} value={paiseToInput(form.offerGetPaise)}
                      onChange={(e) => set('offerGetPaise', inputToPaise(e.target.value))} />
                  </Field>
                  <Field label="Recharge base (₹, before GST)">
                    <input className="input" type="number" min={0} value={paiseToInput(form.rechargeBasePaise)}
                      onChange={(e) => set('rechargeBasePaise', inputToPaise(e.target.value))} />
                  </Field>
                </div>
                <Field label="Recharge plan the button opens">
                  <select className="input" value={PLAN_OPTIONS.some((o) => o.id === form.rechargePlanId) ? form.rechargePlanId : 'custom'}
                    onChange={(e) => set('rechargePlanId', e.target.value === 'custom' ? '' : e.target.value)}>
                    {PLAN_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </Field>
                {!PLAN_OPTIONS.some((o) => o.id === form.rechargePlanId && o.id !== 'custom') && (
                  <Field label="Custom plan ID">
                    <input className="input" value={form.rechargePlanId} placeholder="e.g. promo_diwali"
                      onChange={(e) => set('rechargePlanId', e.target.value)} />
                  </Field>
                )}

                {/* billing strip */}
                <div style={{ background: 'linear-gradient(120deg,#f3eefc,#faf8ff)', border: '1px solid var(--border)', borderRadius: 14, padding: 13 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <BillStep k="Charged now" v={totals.totalPaise > 0 ? rupees(totals.totalPaise) : 'Free'}
                      sub={totals.totalPaise > 0 ? `${rupees(form.rechargeBasePaise)} base + ${form.gstRatePct}% GST${form.breakupRows.length ? ' + extras' : ''}` : 'no payment step'} />
                    <BillStep k="Opens plan" v={form.rechargePlanId || '—'} sub="server = source of truth" vColor="var(--primary)" />
                    <BillStep k="Wallet credit" v={planCredit == null ? 'set by plan' : rupees(planCredit)} sub={planCredit == null ? 'custom — set on the plan' : 'set by the plan'} vColor="var(--gold-deep)" />
                  </div>
                  <p style={{ margin: '11px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
                    <b style={{ color: 'var(--warning)' }}>How it wires:</b> the <b>charged amount</b> comes from your base + GST here; the
                    <b> actual credit</b> is whatever the chosen <b>plan</b> grants on the server. Keep the Grand Total equal to what the
                    plan charges, or the pop-up promises one number and the wallet shows another.
                  </p>
                </div>
              </div>
            </div>

            {/* Total Payment breakdown */}
            <div className="card" style={{ padding: 16 }}>
              <SecHead badge="≡" title="Total Payment breakdown" hint="the ⓘ price split" />
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px', border: '1px solid var(--border)', borderRadius: 13 }}>
                  <label className="switch">
                    <input type="checkbox" checked={form.showBreakup} onChange={(e) => set('showBreakup', e.target.checked)} />
                    <span className="track" />
                  </label>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>Show the “Total Payment” breakdown</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>The tappable ⓘ under the buttons that reveals the price split.</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                  <Field label="GST rate (%)">
                    <input className="input" type="number" min={0} step={0.5} value={form.gstRatePct}
                      onChange={(e) => set('gstRatePct', Math.max(0, parseFloat(e.target.value) || 0))} />
                  </Field>
                  <Field label="Grand total (what’s charged)">
                    <input className="input" type="number" min={0}
                      disabled={form.totalOverridePaise == null}
                      value={form.totalOverridePaise != null ? paiseToInput(form.totalOverridePaise) : paiseToInput(totals.autoPaise)}
                      onChange={(e) => set('totalOverridePaise', inputToPaise(e.target.value))} />
                    <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, marginTop: 4 }}>
                      <input type="checkbox" checked={form.totalOverridePaise != null}
                        onChange={(e) => set('totalOverridePaise', e.target.checked ? totals.autoPaise : null)} />
                      Set the total manually
                    </label>
                  </Field>
                </div>
                <div>
                  <span className="af-label" style={{ margin: '0 0 6px', display: 'block' }}>Extra lines (optional)</span>
                  {form.breakupRows.length === 0 ? (
                    <span className="muted" style={{ fontSize: 11.5 }}>No extra lines — just Total Amount + GST. Add one for a discount or fee.</span>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {form.breakupRows.map((r, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 36px', gap: 7, alignItems: 'center' }}>
                          <input className="input" value={r.label} placeholder="Label (e.g. Discount)"
                            onChange={(e) => set('breakupRows', form.breakupRows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                          <input className="input" type="number" step={0.5} value={paiseToInput(r.amountPaise)}
                            onChange={(e) => set('breakupRows', form.breakupRows.map((x, j) => j === i ? { ...x, amountPaise: inputToPaise(e.target.value) } : x))} />
                          <button type="button" className="btn sm danger" title="Remove" style={{ padding: '7px 0' }}
                            onClick={() => set('breakupRows', form.breakupRows.filter((_, j) => j !== i))}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="btn sm secondary" style={{ marginTop: 8 }}
                    onClick={() => set('breakupRows', [...form.breakupRows, { label: 'Discount', amountPaise: 0 }])}>
                    ＋ Add a line (Discount, Fee…)
                  </button>
                </div>
                <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
                  <b style={{ color: 'var(--warning)' }}>Keep it honest:</b> this split is only what the customer sees. Make sure the
                  <b> Grand Total</b> equals what the recharge plan actually bills — the ⓘ never changes the real amount charged.
                </p>
              </div>
            </div>

            {/* Character */}
            <div className="card" style={{ padding: 16 }}>
              <SecHead badge="☺" title="Character" hint="default pandit ji, or upload your own art" />
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className={`pickchip${!form.image.trim() ? ' on' : ''}`} onClick={() => set('image', '')}>Default (pandit ji)</button>
                  <span className={`pickchip${form.image.trim() ? ' on' : ''}`} style={{ cursor: 'default' }}>Custom upload</span>
                </div>
                <ImageUpload folder="banner_images" value={form.image} onChange={(url) => set('image', url)} shape="portrait" label="Upload character art" />
                <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
                  The app renders the bundled pandit ji, or an uploaded image if you add one (a transparent PNG/WebP of a
                  character — e.g. a girl astrologer — works best). It can’t show other built-in characters.
                </p>
              </div>
            </div>

            {/* Background & sky */}
            <div className="card" style={{ padding: 16 }}>
              <SecHead badge="◐" title="Background & sky" hint="celestial presets" />
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <Field label="Background theme">
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {BG_THEMES.map((t) => (
                      <button type="button" key={t.id} className={`pickchip${form.bgTheme === t.id ? ' on' : ''}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={() => set('bgTheme', t.id)}>
                        <span style={{ width: 15, height: 15, borderRadius: 5, background: t.dot, flex: 'none' }} />{t.name}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Falling particles">
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {PARTICLE_OPTIONS.map((o) => (
                      <button type="button" key={o.id} className={`pickchip${form.particleStyle === o.id ? ' on' : ''}`}
                        onClick={() => set('particleStyle', o.id)}>{o.label}</button>
                    ))}
                  </div>
                </Field>
              </div>
            </div>

            {/* Targeting */}
            <div className="card" style={{ padding: 16 }}>
              <SecHead badge="◎" title="Who sees it & when" />
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <Field label="Audience">
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {(['unpaid', 'all', 'paid'] as Audience[]).map((a) => (
                      <button type="button" key={a} className={`pickchip${form.audience === a ? ' on' : ''}`} onClick={() => set('audience', a)}>
                        {a === 'unpaid' ? 'Only unpaid' : a === 'paid' ? 'Only paid' : 'Everyone'}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Display style">
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button type="button" className={`pickchip${form.displayMode !== 'full' ? ' on' : ''}`} onClick={() => set('displayMode', 'half')}>Bottom sheet (app default)</button>
                    <button type="button" className={`pickchip${form.displayMode === 'full' ? ' on' : ''}`} onClick={() => set('displayMode', 'full')}>Full takeover</button>
                  </div>
                </Field>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 13 }}>
                  <label className="switch">
                    <input type="checkbox" checked={editingRowLive} disabled={!editingId || saving}
                      onChange={() => { const r = rows.find((x) => x.id === editingId); if (r) toggleLive(r); }} />
                    <span className="track" />
                  </label>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>Set this pop-up Live</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {editingId ? 'Only one can be live at a time. Changes reach the app instantly.' : 'Save it first, then flip this on (or “Go live” from the list below).'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Save */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editingId ? '✓ Save changes' : '＋ Add pop-up'}
              </button>
              {editingId && <button className="btn secondary" onClick={resetForm} disabled={saving}>Cancel</button>}
              <span className="muted" style={{ fontSize: 12 }}>Saved pop-ups appear in the list below — set one Live to show it.</span>
            </div>
          </div>
      </div>
      {/* /studio grid */}

      {/* Saved pop-ups — view, edit, delete, go live */}
      <div className="card" style={{ marginTop: 22 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>Saved pop-ups</h3>
        {loading ? <p className="muted">Loading…</p> : list.length === 0 ? (
          <p className="muted">No pop-ups yet — build one above and click “Add pop-up”.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Pop-up</th><th>Who sees it</th><th>Style</th><th>Live</th><th></th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Pop-up">{(p.theme as string) === 'welcome_reward' ? <WelcomeRowCell p={p} /> : <b>{(p.title as string) || '(no title)'}</b>}</td>
                    <td data-label="Who sees it"><span className="badge purple">{AUD_LABEL[(p.audience as Audience) ?? 'all']}</span></td>
                    <td data-label="Style" className="muted" style={{ fontSize: 13 }}>{STYLE_LABEL[(p.displayMode as DisplayMode) ?? 'small']}</td>
                    <td data-label="Live">
                      <button className={`btn sm ${p.active ? '' : 'secondary'}`} disabled={saving} onClick={() => toggleLive(p)}>
                        {p.active ? '● Live' : 'Go live'}
                      </button>
                    </td>
                    <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm secondary" title="Preview" onClick={() => { setPreview(p); setPvView('offer'); }} style={{ marginRight: 6 }}>👁 View</button>
                      <button className="btn sm secondary" title="Edit" onClick={() => startEdit(p)} style={{ marginRight: 6 }}>✎ Edit</button>
                      <button className="btn sm danger" disabled={saving} onClick={() => remove(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {preview && (
        <div className="pv-modal" onClick={() => setPreview(null)}>
          <button type="button" className="pv-modal__close" onClick={() => setPreview(null)}>×</button>
          <div className="pv-modal__inner" style={{ width: 'min(420px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            <PreviewWelcome p={preview} view={pvView} onView={setPvView} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

function SecHead({ badge, title, hint }: { badge: string; title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--accent)', color: 'var(--primary)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flex: 'none' }}>{badge}</span>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', color: 'var(--navy)' }}>{title}</h3>
      {hint && <span className="muted" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600 }}>{hint}</span>}
    </div>
  );
}

function BillStep({ k, v, sub, vColor }: { k: string; v: string; sub: string; vColor?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120, background: '#fff', border: '1px solid var(--border)', borderRadius: 11, padding: '9px 11px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>{k}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, color: vColor ?? 'var(--navy)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <small style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{sub}</small>
    </div>
  );
}

/** A compact two-tone name + character + Get ₹X cell for welcome rows in the table. */
function WelcomeRowCell({ p }: { p: Row }) {
  const th = bgTheme((p.bgTheme as BgThemeId) ?? 'lavender');
  const w1 = (p.titleWord1 as string) || 'Triple';
  const w2 = (p.titleWord2 as string) || 'Dhamaka';
  const get = (p.offerGetPaise as number) ?? 7700;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center', overflow: 'hidden', background: `linear-gradient(180deg, ${th.stops[0]}, ${th.stops[2]})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={(p.image as string)?.trim() || '/promo-art/welcome.webp'} alt="" style={{ height: 34, width: 'auto', objectFit: 'contain' }} />
      </span>
      <span>
        <b style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>{w1} <span style={{ color: 'var(--gold-deep)' }}>{w2}</span></b>
        <span className="muted" style={{ display: 'block', fontSize: 11 }}>Welcome reward · Get {rupees(get)}</span>
      </span>
    </div>
  );
}

/** The welcome sheet preview inside the View modal, with its Offer / reward toggle. */
function PreviewWelcome({ p, view, onView }: { p: Row; view: 'offer' | 'reward'; onView: (v: 'offer' | 'reward') => void }) {
  const rows = toBreakupRows(p.breakupRows);
  const plan = (p.rechargePlanId as string) || 'promo_welcome';
  const credit = PLAN_CREDIT[plan];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', gap: 4, background: '#f2eefb', borderRadius: 10, padding: 3 }}>
          <button type="button" className={`aview-tab${view === 'offer' ? ' on' : ''}`} style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => onView('offer')}>Offer</button>
          <button type="button" className={`aview-tab${view === 'reward' ? ' on' : ''}`} style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => onView('reward')}>“No thanks” reward</button>
        </div>
      </div>
      <WelcomeSheetPreview
        word1={(p.titleWord1 as string) || 'Triple'}
        word2={(p.titleWord2 as string) || 'Dhamaka'}
        body={(p.body as string) || 'Grab this one-time offer'}
        offerGetPaise={(p.offerGetPaise as number) ?? 7700}
        rechargeBasePaise={(p.rechargeBasePaise as number) ?? 2500}
        gstRatePct={typeof p.gstRatePct === 'number' ? p.gstRatePct : 18}
        breakupRows={rows}
        showBreakup={p.showBreakup !== false}
        totalOverridePaise={typeof p.totalOverridePaise === 'number' ? p.totalOverridePaise : null}
        bgTheme={(p.bgTheme as BgThemeId) ?? 'lavender'}
        particleStyle={(p.particleStyle as ParticleStyle) ?? 'mixed'}
        image={(p.image as string) || ''}
        displayMode={(p.displayMode as string) === 'full' ? 'full' : 'half'}
        view={view}
        rewardCreditPaise={credit ?? ((p.offerGetPaise as number) ?? 7700)}
      />
    </div>
  );
}
