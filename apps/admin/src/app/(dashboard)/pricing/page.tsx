'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { rupeesToPaise } from '@/lib/format';

interface Config {
  consultationPricePerMinutePaise: number;
  minWalletToStartPaise: number;
  warnLevel1Sec: number;
  warnLevel2Sec: number;
  reconnectTimeoutSec: number;
  sessionTimeoutSec: number;
  requestTimeoutSec: number;
  commissionPercent: number;
}

const DEFAULTS: Config = {
  consultationPricePerMinutePaise: 900,
  minWalletToStartPaise: 1800,
  warnLevel1Sec: 120,
  warnLevel2Sec: 30,
  reconnectTimeoutSec: 45,
  sessionTimeoutSec: 300,
  requestTimeoutSec: 30,
  commissionPercent: 20,
};

export default function PricingPage() {
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'global')).then((s) => {
      if (s.exists()) setCfg({ ...DEFAULTS, ...(s.data() as Partial<Config>) });
      setLoading(false);
    });
  }, []);

  async function save() {
    await setDoc(doc(db, 'config', 'global'), { ...cfg, updatedAt: serverTimestamp() }, { merge: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function num(k: keyof Config, v: string) {
    setCfg((c) => ({ ...c, [k]: Number(v) || 0 }));
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>Pricing & Settings</h1>
      <p className="muted">Changes apply platform-wide instantly — no app update required.</p>
      <div className="card grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 700 }}>
        <Field label="Price per minute (₹)"
          value={String(cfg.consultationPricePerMinutePaise / 100)}
          onChange={(v) => setCfg((c) => ({ ...c, consultationPricePerMinutePaise: rupeesToPaise(Number(v)) }))} />
        <Field label="Minimum wallet to start (₹)"
          value={String(cfg.minWalletToStartPaise / 100)}
          onChange={(v) => setCfg((c) => ({ ...c, minWalletToStartPaise: rupeesToPaise(Number(v)) }))} />
        <Field label="Warning level 1 (sec)" value={String(cfg.warnLevel1Sec)} onChange={(v) => num('warnLevel1Sec', v)} />
        <Field label="Warning level 2 (sec)" value={String(cfg.warnLevel2Sec)} onChange={(v) => num('warnLevel2Sec', v)} />
        <Field label="Reconnect timeout (sec)" value={String(cfg.reconnectTimeoutSec)} onChange={(v) => num('reconnectTimeoutSec', v)} />
        <Field label="Session timeout (sec)" value={String(cfg.sessionTimeoutSec)} onChange={(v) => num('sessionTimeoutSec', v)} />
        <Field label="Request timeout (sec)" value={String(cfg.requestTimeoutSec)} onChange={(v) => num('requestTimeoutSec', v)} />
        <Field label="Commission (%)" value={String(cfg.commissionPercent)} onChange={(v) => num('commissionPercent', v)} />
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="btn" onClick={save}>Save settings</button>
        {saved && <span style={{ marginLeft: 12, color: 'var(--success)' }}>Saved ✓</span>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 4 }} />
    </label>
  );
}
