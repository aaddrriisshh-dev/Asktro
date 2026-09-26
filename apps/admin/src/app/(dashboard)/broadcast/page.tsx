'use client';

import { useMemo, useState } from 'react';
import { callFn, useCollection, Row } from '@/lib/hooks';
import { isRealCustomer } from '@/lib/customer';
import { ImageUpload } from '@/components/ImageUpload';
import { PromoPreview } from '@/components/PromoPreview';
import { LandingControls, DisplayMode } from '@/components/LandingControls';
import { DeepLinkSelect } from '@/components/DeepLinkSelect';
import { ThemePicker } from '@/components/ThemePicker';
import { Collapsible } from '@/components/Collapsible';
import { MobileSection } from '@/components/MobileSection';
import { PromoTheme } from '@/lib/promoThemes';

type Segment = 'all_users' | 'paid_users' | 'unpaid_users' | 'astrologers' | 'list';
const AUDIENCE: { key: Segment; label: string }[] = [
  { key: 'all_users', label: 'All Users' },
  { key: 'paid_users', label: 'Paid Users' },
  { key: 'unpaid_users', label: 'Unpaid Users' },
  { key: 'astrologers', label: 'Astrologers' },
  { key: 'list', label: 'Specific users' },
];
const PRESETS = ['#2e2b5f', '#6b4bc0', '#b8862a', '#1f7a5a', '#c0473f', '#12121a'];

function fmtWhen(ts: unknown): string {
  const secs = (ts as { seconds?: number; _seconds?: number } | null)?.seconds
    ?? (ts as { _seconds?: number } | null)?._seconds;
  if (!secs) return '—';
  return new Date(secs * 1000).toLocaleString('en-IN',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---- Specific-users picker helpers ----------------------------------------
// Bucket users by India (IST) day so "Today"/"Yesterday" match the founder's
// calendar — used to find the people active in the outage window.
const IST = 5.5 * 60 * 60 * 1000;
const DAY = 86_400_000;
const toMs = (t: unknown): number => {
  const o = t as { toMillis?: () => number; seconds?: number; _seconds?: number } | null;
  return o?.toMillis?.() ?? (o?.seconds ?? o?._seconds ?? 0) * 1000;
};
function istDayStart(ms: number): number {
  const d = new Date(ms + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST;
}
type Pick = { id: string; name: string; phone: string; email: string; paid: boolean; activity: number };

export default function BroadcastPage() {
  const { rows: sent, loading: sentLoading } = useCollection('broadcasts');
  const { rows: users } = useCollection('users');
  const { rows: presenceRows } = useCollection('presence');
  const [segment, setSegment] = useState<Segment>('all_users');
  const [f, setF] = useState({ title: '', body: '', deeplink: '', image: '' });
  const [imageStyle, setImageStyle] = useState<'banner' | 'portrait'>('banner');
  const [bg, setBg] = useState('#2e2b5f');
  const [fg, setFg] = useState('#ffffff');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('half');
  const [portraitImage, setPortraitImage] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [ctaDeeplink, setCtaDeeplink] = useState('');
  const [lTitle, setLTitle] = useState('');
  const [lBody, setLBody] = useState('');
  const [lBg, setLBg] = useState('#2e2b5f');
  const [lFg, setLFg] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [theme, setTheme] = useState('');
  // Specific-users picker state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uq, setUq] = useState('');
  const [paidOnly, setPaidOnly] = useState(false);
  // One idempotency key per compose; reused if a send is retried (timeout /
  // double-click) so the server never fans the broadcast out twice, then rotated
  // after a successful send for the next message.
  const [broadcastId, setBroadcastId] = useState(() => crypto.randomUUID());
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  // --- Specific-users picker: build, filter, and group the customer list ---
  const presence = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of presenceRows) m.set(p.id, toMs(p.lastSeen));
    return m;
  }, [presenceRows]);
  const people = useMemo<Pick[]>(() => users.filter(isRealCustomer).map((u) => ({
    id: u.id, name: (u.name as string) || '', phone: (u.phone as string) || '', email: (u.email as string) || '',
    paid: ((u.totalRecharge as number) ?? 0) > 0,
    // "activity" = last app presence, falling back to signup — so recently-active
    // users (the outage window) sort to the top and land in Today/Yesterday.
    activity: Math.max(presence.get(u.id) ?? 0, toMs(u.createdAt)),
  })).sort((a, b) => b.activity - a.activity), [users, presence]);
  const filtered = useMemo(() => {
    const q = uq.trim().toLowerCase();
    return people.filter((p) => (!paidOnly || p.paid)
      && (!q || p.name.toLowerCase().includes(q) || p.phone.includes(q) || p.email.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)));
  }, [people, uq, paidOnly]);
  const groups = useMemo(() => {
    const t0 = istDayStart(Date.now()); const y0 = t0 - DAY;
    const g: { Today: Pick[]; Yesterday: Pick[]; Older: Pick[] } = { Today: [], Yesterday: [], Older: [] };
    for (const p of filtered) (p.activity >= t0 ? g.Today : p.activity >= y0 ? g.Yesterday : g.Older).push(p);
    return g;
  }, [filtered]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addMany = (list: Pick[]) => setSelected((s) => { const n = new Set(s); for (const p of list) n.add(p.id); return n; });
  const clearSel = () => setSelected(new Set());

  function applyTheme(t: PromoTheme | null) {
    if (!t) { setTheme(''); return; }
    setTheme(t.id);
    setBg(t.base); setFg(t.tx); setLBg(t.base); setLFg(t.tx);
  }

  async function send() {
    if (!f.title.trim() || !f.body.trim()) return alert('Title and message are required.');
    if (segment === 'list' && selected.size === 0) return alert('Add at least one user below, or pick a different audience.');
    const label = segment === 'list'
      ? `${selected.size} selected user${selected.size === 1 ? '' : 's'}`
      : AUDIENCE.find((a) => a.key === segment)?.label;
    if (!confirm(`Push this notification to ${label}?`)) return;
    setBusy(true); setResult(null);
    try {
      const res = await callFn<{ delivered?: number; alreadySent?: boolean }>('sendBroadcast', {
        broadcastId,
        title: f.title.trim(), body: f.body.trim(), segment, type: 'announcement',
        ...(segment === 'list' ? { uids: [...selected] } : {}),
        deeplink: f.deeplink.trim() || undefined,
        image: f.image.trim() || undefined,
        imageStyle: f.image.trim() ? imageStyle : undefined,
        bgColor: bg, textColor: fg,
        displayMode,
        portraitImage: displayMode !== 'small' ? (portraitImage.trim() || undefined) : undefined,
        ctaText: ctaText.trim() || undefined,
        ctaDeeplink: ctaDeeplink.trim() || undefined,
        landingTitle: displayMode !== 'small' ? (lTitle.trim() || undefined) : undefined,
        landingBody: displayMode !== 'small' ? (lBody.trim() || undefined) : undefined,
        landingBgColor: displayMode !== 'small' ? lBg : undefined,
        landingTextColor: displayMode !== 'small' ? lFg : undefined,
        theme: theme || undefined,
      });
      setResult(res.alreadySent
        ? '✓ Already sent (this message was submitted before).'
        : segment === 'list'
          ? `✓ Pushed to ${res.delivered ?? selected.size} selected users.`
          : `✓ Pushed to ${res.delivered ?? 0} ${label}.`);
      setBroadcastId(crypto.randomUUID()); // fresh key for the next message
      setF({ title: '', body: '', deeplink: '', image: '' });
      setSelected(new Set());
      setTheme('');
      setPortraitImage(''); setCtaText(''); setCtaDeeplink(''); setDisplayMode('half');
      setLTitle(''); setLBody(''); setLBg('#2e2b5f'); setLFg('#ffffff');
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  /** Load a past broadcast back into the compose form so it can be tweaked and
   *  re-pushed. A fresh broadcastId is minted so the send is treated as a NEW
   *  message (never suppressed as a duplicate of the original). */
  function editBroadcast(b: Row) {
    setSegment((b.segment as Segment) ?? 'all_users');
    setF({
      title: (b.title as string) ?? '',
      body: (b.body as string) ?? '',
      deeplink: (b.deeplink as string) ?? '',
      image: (b.image as string) ?? '',
    });
    setImageStyle((b.imageStyle as 'banner' | 'portrait') ?? 'banner');
    setBg((b.bgColor as string) ?? '#2e2b5f');
    setFg((b.textColor as string) ?? '#ffffff');
    setDisplayMode((b.displayMode as DisplayMode) ?? 'half');
    setPortraitImage((b.portraitImage as string) ?? '');
    setCtaText((b.ctaText as string) ?? '');
    setCtaDeeplink((b.ctaDeeplink as string) ?? '');
    setLTitle((b.landingTitle as string) ?? '');
    setLBody((b.landingBody as string) ?? '');
    setLBg((b.landingBgColor as string) ?? '#2e2b5f');
    setLFg((b.landingTextColor as string) ?? '#ffffff');
    setTheme((b.theme as string) ?? '');
    setBroadcastId(crypto.randomUUID());
    setResult(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Re-push a past broadcast exactly as it was (built straight from the saved
   *  row, so it works without touching the compose form). A fresh broadcastId
   *  makes it a genuine new send. */
  async function resendBroadcast(b: Row) {
    const seg = (b.segment as Segment) ?? 'all_users';
    const label = AUDIENCE.find((a) => a.key === seg)?.label ?? 'All Users';
    const title = ((b.title as string) ?? '').trim();
    const body = ((b.body as string) ?? '').trim();
    if (!title || !body) return alert('This broadcast is missing a title or message.');
    if (!confirm(`Resend "${title}" to ${label}?`)) return;
    setBusy(true); setResult(null);
    try {
      const dm = (b.displayMode as string) || 'half';
      const img = ((b.image as string) ?? '').trim();
      const res = await callFn<{ delivered?: number; alreadySent?: boolean }>('sendBroadcast', {
        broadcastId: crypto.randomUUID(),
        title, body, segment: seg, type: 'announcement',
        deeplink: ((b.deeplink as string) ?? '').trim() || undefined,
        image: img || undefined,
        imageStyle: img ? ((b.imageStyle as string) || 'banner') : undefined,
        bgColor: (b.bgColor as string) || '#2e2b5f',
        textColor: (b.textColor as string) || '#ffffff',
        displayMode: dm,
        portraitImage: dm !== 'small' ? (((b.portraitImage as string) ?? '').trim() || undefined) : undefined,
        ctaText: ((b.ctaText as string) ?? '').trim() || undefined,
        ctaDeeplink: ((b.ctaDeeplink as string) ?? '').trim() || undefined,
        landingTitle: dm !== 'small' ? (((b.landingTitle as string) ?? '').trim() || undefined) : undefined,
        landingBody: dm !== 'small' ? (((b.landingBody as string) ?? '').trim() || undefined) : undefined,
        landingBgColor: dm !== 'small' ? ((b.landingBgColor as string) || '#2e2b5f') : undefined,
        landingTextColor: dm !== 'small' ? ((b.landingTextColor as string) || '#ffffff') : undefined,
        theme: (b.theme as string) || undefined,
      });
      setResult(res.alreadySent
        ? '✓ Already sent (this exact message was just submitted).'
        : `✓ Resent to ${res.delivered ?? 0} ${label}.`);
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Push Notifications</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Design it, preview the exact look, then Commit &amp; Push.</p>

      <MobileSection title="Compose notification" defaultOpen={false}>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,0.82fr) minmax(0,1.18fr)', gap: 18, marginTop: 16, alignItems: 'start' }}>
        {/* LEFT — live preview, pinned so it never overlaps the form */}
        <PromoPreview kind="push" theme={theme} title={f.title} body={f.body} image={f.image} imageStyle={imageStyle} bg={bg} fg={fg}
          displayMode={displayMode} portraitImage={portraitImage} ctaText={ctaText}
          landingTitle={lTitle} landingBody={lBody} landingBg={lBg} landingFg={lFg} />

        {/* RIGHT — everything you edit */}
        <div className="card">
          <p className="af-label" style={{ marginTop: 0 }}>Audience</p>
          <div className="pickrow">
            {AUDIENCE.map((a) => <button key={a.key} type="button" className={`pickchip${segment === a.key ? ' on' : ''}`} onClick={() => setSegment(a.key)}>{a.label}</button>)}
          </div>

          {segment === 'list' && (
            <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Search name, phone, email…" value={uq} onChange={(e) => setUq(e.target.value)} />
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} /> Paid only
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13 }}>{selected.size} selected</b>
                {filtered.length > 0 && <button type="button" className="btn sm secondary" onClick={() => addMany(filtered)}>Add all shown ({filtered.length})</button>}
                {selected.size > 0 && <button type="button" className="btn sm secondary" onClick={clearSel}>Clear</button>}
              </div>
              {selected.size > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, maxHeight: 110, overflowY: 'auto' }}>
                  {[...selected].map((id) => {
                    const p = people.find((x) => x.id === id);
                    return (
                      <span key={id} className="badge" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {p?.name || p?.phone || id.slice(0, 8)}
                        <button type="button" onClick={() => toggle(id)} aria-label="Remove" style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
                {(['Today', 'Yesterday', 'Older'] as const).map((k) => groups[k].length > 0 && (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                      <b style={{ fontSize: 13 }}>{k} · {groups[k].length}</b>
                      <button type="button" className="btn sm secondary" onClick={() => addMany(groups[k])}>Add all</button>
                    </div>
                    {groups[k].slice(0, 200).map((p) => {
                      const on = selected.has(p.id);
                      return (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.name || 'Unnamed'} {p.paid && <span className="badge green" style={{ fontSize: 10 }}>paid</span>}
                            </div>
                            <div className="muted" style={{ fontSize: 12 }}>{p.phone || p.email || p.id.slice(0, 10)}</div>
                          </div>
                          <button type="button" className={`btn sm${on ? ' secondary' : ''}`} style={{ whiteSpace: 'nowrap' }} onClick={() => toggle(p.id)}>{on ? '✓ Added' : 'Add'}</button>
                        </div>
                      );
                    })}
                    {groups[k].length > 200 && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Showing first 200 — search to narrow.</p>}
                  </div>
                ))}
                {filtered.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No users match.</p>}
              </div>
            </div>
          )}

          <label className="af" style={{ marginTop: 16 }}><span>Title</span>
            <input className="input" placeholder="✨ Your stars align today" value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="af" style={{ marginTop: 12 }}><span>Description</span>
            <textarea className="input" rows={3} placeholder="Consult a top astrologer now…" value={f.body} onChange={(e) => set('body', e.target.value)} /></label>
          <div className="af" style={{ marginTop: 12 }}><span>On tap — go to</span>
            <DeepLinkSelect key={`tap-${broadcastId}`} value={f.deeplink} onChange={(v) => set('deeplink', v)} /></div>

          {/* Pop-up button (CTA) — always available, so it works on the Small
              center-card style too, not just Half/Full. Shows on the pop-up that
              opens when a theme or image is set. */}
          <p className="af-label">Pop-up button (CTA)</p>
          <label className="af"><span>Button label</span>
            <input className="input" placeholder="View offer" value={ctaText} onChange={(e) => setCtaText(e.target.value)} /></label>
          <div className="af" style={{ marginTop: 12 }}><span>Button — go to</span>
            <DeepLinkSelect key={`cta-${broadcastId}`} value={ctaDeeplink} onChange={setCtaDeeplink} /></div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Shown on the pop-up (which opens when you set a theme or image). Empty label → “View offer”; empty link → same as “On tap”.</p>

          <p className="af-label">Theme (pick one — no design needed)</p>
          <ThemePicker value={theme} onSelect={applyTheme} />

          <p className="af-label">Image (optional — overrides the theme background)</p>
          <ImageUpload folder="notification_images" value={f.image} onChange={(url) => set('image', url)} shape="wide" />
          {f.image && (
            <div className="pickrow" style={{ marginTop: 10 }}>
              <button type="button" className={`pickchip${imageStyle === 'banner' ? ' on' : ''}`} onClick={() => setImageStyle('banner')}>As Banner</button>
              <button type="button" className={`pickchip${imageStyle === 'portrait' ? ' on' : ''}`} onClick={() => setImageStyle('portrait')}>As Portrait</button>
            </div>
          )}

          <Collapsible title="Background & text colour" summary="Optional — your theme already sets these">
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Background</span><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></div>
              <div className="color-field"><span className="muted" style={{ fontSize: 12 }}>Text</span><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></div>
              <div className="pickrow">{PRESETS.map((c) => <button key={c} type="button" onClick={() => setBg(c)} title={c} style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid var(--line)', background: c, cursor: 'pointer' }} />)}</div>
            </div>
          </Collapsible>

          <LandingControls mode={displayMode} setMode={setDisplayMode} portrait={portraitImage} setPortrait={setPortraitImage}
            cta={ctaText} setCta={setCtaText} title={lTitle} setTitle={setLTitle} body={lBody} setBody={setLBody}
            bg={lBg} setBg={setLBg} fg={lFg} setFg={setLFg} hideCta modes={['small', 'half', 'full']}
            smallLabel="Center card" smallHint="A centered pop-up card with your title, text and CTA" />

          <div style={{ marginTop: 18 }}>
            <button className="btn" disabled={busy} onClick={send}>{busy ? 'Pushing…' : '⚡ Commit & Push'}</button>
            {result && <span style={{ marginLeft: 12, color: 'var(--success)', fontWeight: 600 }}>{result}</span>}
          </div>
        </div>
      </div>
      </MobileSection>

      <MobileSection title="Recent broadcasts" defaultOpen={true}>
      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="celeste" style={{ marginTop: 0 }}>Recent broadcasts</h3>
        {sentLoading ? <p className="muted">Loading…</p> : sent.length === 0 ? <p className="muted">No broadcasts sent yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Title</th><th>Audience</th><th>Reached</th><th>Style</th><th>Sent by</th><th>When</th><th></th></tr></thead>
              <tbody>
                {[...sent]
                  .sort((a, b) => ((b.createdAt as { seconds?: number })?.seconds ?? 0) - ((a.createdAt as { seconds?: number })?.seconds ?? 0))
                  .map((b) => (
                    <tr key={b.id}>
                      <td data-label="Title"><b>{(b.title as string) || '—'}</b></td>
                      <td data-label="Audience"><span className="badge amber">{AUDIENCE.find((a) => a.key === (b.segment as Segment))?.label ?? 'All Users'}</span></td>
                      <td data-label="Reached">{(b.delivered as number) ?? 0}</td>
                      <td data-label="Style" className="muted" style={{ fontSize: 13 }}>{(b.theme as string) || 'plain'} · {(b.displayMode as string) || 'small'}</td>
                      <td data-label="Sent by" className="muted" style={{ fontSize: 13 }}>{(b.sentByName as string) || '—'}</td>
                      <td data-label="When" className="muted" style={{ fontSize: 13 }}>{fmtWhen(b.createdAt)}</td>
                      <td data-label="" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm secondary" title="Load into the composer to tweak & re-push"
                          onClick={() => editBroadcast(b)} style={{ marginRight: 6 }}>✎ Edit</button>
                        <button className="btn sm" title="Send this notification again as-is"
                          disabled={busy} onClick={() => resendBroadcast(b)}>↻ Resend</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </MobileSection>
    </div>
  );
}
