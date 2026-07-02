'use client';

import { useState } from 'react';
import { useCollection, callFn, Row } from '@/lib/hooks';
import { formatPaise, rupeesToPaise } from '@/lib/format';

export default function UsersPage() {
  const { rows, loading } = useCollection('users');
  const [search, setSearch] = useState('');

  const filtered = rows.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.phone ?? '').includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      u.id.includes(q)
    );
  });

  async function adjust(u: Row, sign: 1 | -1) {
    const input = prompt(`Amount in ₹ to ${sign > 0 ? 'credit' : 'debit'} for ${u.name}:`);
    if (!input) return;
    const reason = prompt('Reason (logged to audit):') ?? '';
    try {
      await callFn('adjustWallet', {
        userId: u.id,
        amountPaise: sign * rupeesToPaise(Number(input)),
        reason,
      });
    } catch (e) {
      alert('Failed: ' + (e as Error).message);
    }
  }

  return (
    <div>
      <h1>Users</h1>
      <input
        className="input"
        placeholder="Search by name, phone, email, or ID"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 420 }}
      />
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Wallet</th><th>Bonus</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((u) => (
                <tr key={u.id}>
                  <td>{u.name ?? '—'}</td>
                  <td>{u.phone ?? '—'}</td>
                  <td>{formatPaise(u.walletBalance)}</td>
                  <td>{formatPaise(u.bonusBalance)}</td>
                  <td>
                    <span className={`badge ${u.accountStatus === 'blocked' ? 'red' : 'green'}`}>
                      {u.accountStatus ?? 'active'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm" onClick={() => adjust(u, 1)}>Credit</button>
                    <button className="btn sm secondary" onClick={() => adjust(u, -1)}>Debit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
