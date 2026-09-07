'use client';

import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { ImageUpload } from '@/components/ImageUpload';
import { PromoPreview } from '@/components/PromoPreview';
import { DeepLinkSelect } from '@/components/DeepLinkSelect';
import { PROMO_THEMES } from '@/lib/promoThemes';

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
}

const DEFAULTS: PopupDoc = {
  active: false,
  audience: 'all',
  displayMode: 'small',
  theme: '',
  title: '',
  body: '',
  ctaLabel: 'Grab this offer',
  deeplink: '',
  code: '',
  image: '',
  imageStyle: 'banner',
  imageFill: false,
};

/** The current ₹77 welcome offer expressed as a reusable pop-up preset, so it
 *  can be re-used / tweaked from here instead of being hard-coded in the app. */
const WELCOME_77_PRESET: Partial<PopupDoc> = {
  audience: 'unpaid',
  displayMode: 'full',
  theme: 'golden',
  title: 'Triple Dhamaka',
  body: 'Get ₹77 in your wallet — grab this one-time welcome offer and start your first reading.',
  ctaLabel: 'Recharge ₹29.5',
  deeplink: '/recharge?plan=promo_welcome',
  code: '',
  image: '',
  imageStyle: 'banner',
  imageFill: false,
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

/** Map a saved `popups` row to the strongly-typed PopupDoc used by the form,
 *  the live preview and the app-slot mirror. */
function rowToPopup(r: Row): PopupDoc {
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
  };
}

/** Home Pop-up Banner → portal-managed pop-ups that greet people on app open.
 *  Each pop-up is a doc in the `popups` collection (create / edit / delete /
 *  preview). Exactly ONE can be "live"; the live one is mirrored into
 *  `homeSections/popup`, which the app already reads — so the app is untouched. */
export default function HomePopupPage() {
  const { rows, loading } = useCollection('popups');
  const [form, setForm] = useState<PopupDoc>(DEFAULTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Row | null>(null);
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
    setForm(rowToPopup(p));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Mirror the live pop-up into homeSections/popup (what the app reads). Passing
  // null clears it (active:false) so nothing shows. The app is never changed.
  async function syncLive(p: PopupDoc | null) {
    const data = p
      ? {
          active: true, audience: p.audience, displayMode: p.displayMode, theme: p.theme,
          title: p.title.trim(), body: p.body.trim(), ctaLabel: p.ctaLabel.trim() || 'Grab this offer',
          deeplink: p.deeplink.trim(), code: p.code.trim(), image: p.image, imageStyle: p.imageStyle,
          imageFill: p.imageFill,
        }
      : { ...DEFAULTS };
    await setDoc(doc(db, 'homeSections', 'popup'), { ...data, updatedAt: serverTimestamp() });
  }

  const save = async () => {
    if (!form.title.trim() && !form.image.trim()) return alert('Add a title or an image first.');
    setSaving(true);
    try {
      const data = {
        audience: form.audience, displayMode: form.displayMode, theme: form.theme,
        title: form.title.trim(), body: form.body.trim(),
        ctaLabel: form.ctaLabel.trim() || 'Grab this offer', deeplink: form.deeplink.trim(),
        code: form.code.trim(), image: form.image, imageStyle: form.imageStyle, imageFill: form.imageFill,
      };
      if (editingId) {
        const wasLive = rows.find((r) => r.id === editingId)?.active === true;
        await updateDoc(doc(db, 'popups', editingId), { ...data, updatedAt: serverTimestamp() });
        // Keep the live slot in step with edits to the pop-up that's currently live.
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

  const audiences: [Audience, string][] = [
    ['all', 'Everyone'],
    ['unpaid', 'Only unpaid (never recharged)'],
    ['paid', 'Only paid (has recharged)'],
  ];

  const list = [...rows].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Home Pop-up Banner</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Pop-ups that greet people when they open the app. Build as many as you like below; the one you set
        <b> Live</b> is the one that shows (only one at a time). Changes go live instantly — no rebuild.
      </p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,0.82fr) minmax(0,1.18fr)', gap: 18, marginTop: 16, alignItems: 'start' }}>
        {/* LEFT — live preview of exactly what the pop-up will look like in the app */}
        <PromoPreview kind={form.code.trim() ? 'coupon' : 'push'} theme={form.theme}
          title={form.title} body={form.body} image={form.image} imageStyle={form.imageStyle}
          displayMode={form.displayMode} ctaText={form.ctaLabel} code={form.code} imageFill={form.imageFill} />

        {/* RIGHT — everything you edit */}
        <div>
          <div className="card" style={{ padding: 16, display: 'grid', gap: 14 }}>
            <p className="af-label" style={{ margin: 0, fontWeight: 700 }}>
              {editingId ? '✎ Editing pop-up' : 'Create a pop-up'}
            </p>
            <Field label="Who sees it">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {audiences.map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    className={`btn sm ${form.audience === v ? '' : 'secondary'}`}
                    onClick={() => set('audience', v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Style">
                <select className="input" value={form.displayMode} onChange={(e) => set('displayMode', e.target.value as DisplayMode)}>
                  <option value="small">Centre card (compact)</option>
                  <option value="half">Bottom sheet (half)</option>
                  <option value="full">Full takeover</option>
                </select>
              </Field>
              <Field label="Theme (colour look)">
                <select className="input" value={form.theme} onChange={(e) => set('theme', e.target.value)}>
                  <option value="">Plain (no theme)</option>
                  {PROMO_THEMES.map((t) => (
                    <option key={t.id} value={t.id}>{t.medal} {t.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            {form.displayMode !== 'small' && !form.theme && (
              <span className="muted" style={{ fontSize: 11.5, color: 'var(--error)' }}>
                Half &amp; full styles need a theme — pick one, or the app falls back to the compact centre card.
              </span>
            )}

            <Field label="Title">
              <input className="input" value={form.title} placeholder="A gift for you" onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Message">
              <textarea
                className="input"
                style={{ minHeight: 60, resize: 'vertical' }}
                value={form.body}
                placeholder="Recharge today and get extra wallet credit."
                onChange={(e) => set('body', e.target.value)}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Button label">
                <input className="input" value={form.ctaLabel} placeholder="Grab this offer" onChange={(e) => set('ctaLabel', e.target.value)} />
              </Field>
              <Field label="Coupon code pill (optional)">
                <input className="input" value={form.code} placeholder="WELCOME50" onChange={(e) => set('code', e.target.value)} />
              </Field>
            </div>

            <Field label="Button opens — pick a destination">
              <DeepLinkSelect value={form.deeplink} onChange={(v) => set('deeplink', v)} />
            </Field>

            <Field label="Image (optional)">
              <ImageUpload
                folder="banner_images"
                value={form.image}
                onChange={(url) => set('image', url)}
                shape={form.imageStyle === 'portrait' ? 'portrait' : 'wide'}
                label="Upload image"
              />
            </Field>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" name="imgstyle" checked={form.imageStyle === 'banner'} onChange={() => set('imageStyle', 'banner')} /> Wide banner
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" name="imgstyle" checked={form.imageStyle === 'portrait'} onChange={() => set('imageStyle', 'portrait')} /> Tall portrait
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.imageFill} onChange={(e) => set('imageFill', e.target.checked)} /> Image fills the whole pop-up (fully-designed art)
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn sm secondary" onClick={() => setForm((f) => ({ ...f, ...WELCOME_77_PRESET }))}>
              ⤵ Load the ₹77 Welcome preset
            </button>
            <span className="muted" style={{ fontSize: 12 }}>Fills the fields with the current ₹77 welcome offer — tweak &amp; save.</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editingId ? '✓ Save changes' : '＋ Add pop-up'}
            </button>
            {editingId && <button className="btn secondary" onClick={resetForm} disabled={saving}>Cancel</button>}
            <span className="muted" style={{ fontSize: 12 }}>Saved pop-ups appear in the list below — set one Live to show it.</span>
          </div>
        </div>
      </div>

      {/* Saved pop-ups — view, edit, delete, go live (like the Banners page) */}
      <div className="card" style={{ marginTop: 22 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>Saved pop-ups</h3>
        {loading ? <p className="muted">Loading…</p> : list.length === 0 ? (
          <p className="muted">No pop-ups yet — build one above and click “Add pop-up”.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Title</th><th>Who sees it</th><th>Style</th><th>Live</th><th></th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Title"><b>{(p.title as string) || '(no title)'}</b></td>
                    <td data-label="Who sees it"><span className="badge purple">{AUD_LABEL[(p.audience as Audience) ?? 'all']}</span></td>
                    <td data-label="Style" className="muted" style={{ fontSize: 13 }}>{STYLE_LABEL[(p.displayMode as DisplayMode) ?? 'small']}</td>
                    <td data-label="Live">
                      <button className={`btn sm ${p.active ? '' : 'secondary'}`} disabled={saving} onClick={() => toggleLive(p)}>
                        {p.active ? '● Live' : 'Go live'}
                      </button>
                    </td>
                    <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm secondary" title="Preview" onClick={() => setPreview(p)} style={{ marginRight: 6 }}>👁 View</button>
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
            <PromoPreview kind={(preview.code as string)?.trim() ? 'coupon' : 'push'}
              theme={(preview.theme as string) || ''}
              title={(preview.title as string) || ''}
              body={(preview.body as string) || ''}
              image={(preview.image as string) || ''}
              imageStyle={((preview.imageStyle as string) || 'banner') as 'banner' | 'portrait'}
              displayMode={((preview.displayMode as string) || 'small') as 'small' | 'half' | 'full'}
              ctaText={(preview.ctaLabel as string) || undefined}
              code={(preview.code as string) || undefined}
              imageFill={preview.imageFill === true} />
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
