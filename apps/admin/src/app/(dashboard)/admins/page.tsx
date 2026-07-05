'use client';

import { useEffect, useState, useCallback } from 'react';
import { callFn } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { ROLE_LABEL, AdminRole } from '@/lib/roles';

interface AdminRow {
  uid: string;
  name: string;
  email: string;
  adminRole: string;
  disabled?: boolean;
}

const ROLE_BADGE: Record<string, string> = { super: 'gold', ops: 'purple', astrology: 'amber' };
const ROLES: AdminRole[] = ['super', 'ops', 'astrology'];

export default function AdminsPage() {
  const { user, adminRole } = useAuth();
  const isSuper = adminRole === 'super';
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFn<{ admins: AdminRow[] }>('listAdmins', {});
      setRows((res.admins ?? []).sort((a, b) => ROLES.indexOf(a.adminRole as AdminRole) - ROLES.indexOf(b.adminRole as AdminRole)));
    } catch (e) {
      setRows([]);
      setError(`${(e as { code?: string }).code ?? ''} ${(e as Error).message}`.trim());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeRole(a: AdminRow, next: string) {
    if (next === a.adminRole) return;
    setBusy(a.uid);
    try { await callFn('setAdminRole', { targetUid: a.uid, adminRole: next }); await load(); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }
  async function remove(a: AdminRow) {
    if (!confirm(`Remove ${a.name || a.email}'s admin access? Their login will be disabled.`)) return;
    setBusy(a.uid);
    try { await callFn('removeAdmin', { targetUid: a.uid }); await load(); }
    catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Admin Management</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Your team and what each of them can access.</p>
        </div>
        {isSuper && (
          <button className="btn" onClick={() => setShowAdd((s) => !s)}>{showAdd ? 'Close' : '+ Add admin'}</button>
        )}
      </div>

      {!isSuper && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ margin: 0 }}>Only a Super Admin can add or change admins. You can view the team below.</p>
        </div>
      )}

      {showAdd && isSuper && <AddAdmin onDone={() => { setShowAdd(false); load(); }} />}

      {error && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--error)' }}>
          <strong style={{ color: 'var(--error)' }}>Couldn’t load the admin team.</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13, fontFamily: 'monospace' }}>{error}</p>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        {rows === null ? <p className="muted">Loading…</p> : rows.length === 0 ? (
          <p className="muted">{error ? 'Could not reach the admin list (see the error above).' : 'No admins yet.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th>{isSuper && <th>Actions</th>}</tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.uid}>
                    <td>
                      <b>{a.name || '—'}</b>
                      {a.uid === user?.uid && <span className="muted" style={{ fontSize: 12 }}> · you</span>}
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>{a.email}</td>
                    <td><span className={`badge ${ROLE_BADGE[a.adminRole] ?? ''}`}>{ROLE_LABEL[a.adminRole] ?? a.adminRole}</span></td>
                    <td className="muted" style={{ fontSize: 12.5, maxWidth: 280 }}>{ACCESS_NOTE[a.adminRole] ?? '—'}</td>
                    {isSuper && (
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={a.adminRole}
                            disabled={busy === a.uid || a.uid === user?.uid}
                            onChange={(e) => changeRole(a, e.target.value)}
                            className="input" style={{ padding: '5px 8px', width: 'auto' }}
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                          {a.uid !== user?.uid && (
                            <button className="btn sm danger" disabled={busy === a.uid} onClick={() => remove(a)}>Remove</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const ACCESS_NOTE: Record<string, string> = {
  super: 'Full access — everything, including revenue, money held & owed, and this page.',
  ops: 'Everything except Total Revenue and Money held & owed.',
  astrology: 'Only the astrologer world — add / approve / manage astrologers.',
};

function AddAdmin({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', adminRole: 'ops' as AdminRole });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.name.trim() || !form.email.trim()) return alert('Name and email are required.');
    setBusy(true);
    try {
      const res = await callFn<{ tempPassword?: string | null }>('createAdmin', {
        name: form.name.trim(), email: form.email.trim(), adminRole: form.adminRole,
      });
      if (res?.tempPassword) {
        alert(`Admin created.\n\nEmail: ${form.email.trim()}\nTemporary password: ${res.tempPassword}\n\nShare these — they can change the password after first login.`);
      } else {
        alert('Existing account promoted to admin. They should sign out and back in.');
      }
      onDone();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Add admin</h3>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <input className="input" placeholder="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <input className="input" placeholder="Email (login)" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <select className="input" value={form.adminRole} onChange={(e) => setForm((f) => ({ ...f, adminRole: e.target.value as AdminRole }))}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{ACCESS_NOTE[form.adminRole]}</p>
      <div style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Creating…' : 'Create admin'}</button>
      </div>
    </div>
  );
}
