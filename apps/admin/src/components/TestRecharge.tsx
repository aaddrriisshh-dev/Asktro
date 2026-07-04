'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callFn } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';

interface UserOpt { id: string; name: string; balance: number; }

/**
 * Dummy payment gateway — simulate a real recharge for a chosen user. Writes a
 * genuine ledger entry (server timestamp) so all revenue/conversion cards update.
 */
export function TestRecharge() {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('500');
  const [bonus, setBonus] = useState('0');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100)));
        const opts = snap.docs.map((d) => {
          const u = d.data() as { name?: string; walletBalance?: number; bonusBalance?: number };
          return { id: d.id, name: u.name ?? d.id.slice(0, 8), balance: (u.walletBalance ?? 0) + (u.bonusBalance ?? 0) };
        });
        setUsers(opts);
        if (opts[0]) setUserId(opts[0].id);
      } catch {
        /* ignore — panel still works with a pasted userId */
      }
    })();
  }, []);

  const selected = useMemo(() => users.find((u) => u.id === userId), [users, userId]);

  async function simulate() {
    const amountPaise = rupeesToPaise(Number(amount) || 0);
    const bonusPaise = rupeesToPaise(Number(bonus) || 0);
    if (!userId || amountPaise <= 0) {
      setMsg({ ok: false, text: 'Pick a user and enter a valid amount.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await callFn<{ newBalancePaise: number; isFirstRecharge: boolean }>('devSimulateRecharge', {
        userId, amountPaise, bonusPaise,
      });
      setMsg({
        ok: true,
        text: `Recharged ${formatPaise(amountPaise)}${bonusPaise ? ` + ${formatPaise(bonusPaise)} bonus` : ''}. New balance ${formatPaise(res.newBalancePaise)}${res.isFirstRecharge ? ' · first recharge 🎉' : ''}. Refresh cards to see it.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card testrc">
      <button className="testrc-head" onClick={() => setOpen((o) => !o)}>
        <span className="testrc-title">🧪 Test Recharge <em>dummy gateway</em></span>
        <span className="testrc-caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="testrc-body">
          <p className="muted" style={{ marginTop: 0 }}>
            Simulate a successful payment. Writes a real ledger entry with a live timestamp — Revenue, Paid Users and Conversion cards will reflect it.
          </p>
          <div className="testrc-grid">
            <label>
              User
              <select value={userId} onChange={(e) => setUserId(e.target.value)}>
                {users.length === 0 && <option value="">No users loaded</option>}
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {formatPaise(u.balance)}</option>
                ))}
              </select>
            </label>
            <label>
              Amount (₹)
              <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              Bonus (₹)
              <input type="number" min="0" value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </label>
          </div>
          {selected && <p className="testrc-hint">Current balance: <strong>{formatPaise(selected.balance)}</strong></p>}
          <div className="testrc-actions">
            <button className="btn" disabled={busy} onClick={simulate}>{busy ? 'Processing…' : 'Simulate payment'}</button>
          </div>
          {msg && <p className={`testrc-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
