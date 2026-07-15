'use client';

import { useMemo, useState } from 'react';
import { arrayUnion, doc, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCollection, Row } from '@/lib/hooks';
import { formatPaise, formatDate } from '@/lib/format';

const STATUS_FLOW = ['pending_payment', 'confirmed', 'shipped', 'delivered'] as const;
const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Pending payment', confirmed: 'Confirmed', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled',
};
const STATUS_COLOR: Record<string, string> = {
  pending_payment: '#9a6b00', confirmed: '#1e6fd6', shipped: '#7a3fd0', delivered: '#1e9e63', cancelled: '#c0392b',
};

/** AstroMall orders — fulfilment dashboard. Money fields are server-set and
 *  locked by rules; admins only advance status + add courier/tracking. */
export default function StoreOrdersPage() {
  const { rows, loading } = useCollection('storeOrders', [orderBy('createdAt', 'desc')]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Row | null>(null);

  const shown = useMemo(
    () => (filter ? rows.filter((o) => o.status === filter) : rows.filter((o) => o.status !== 'pending_payment' || filter === '')),
    [rows, filter],
  );
  const paid = rows.filter((o) => o.status !== 'pending_payment' && o.status !== 'cancelled');
  const revenue = paid.reduce((n, o) => n + ((o.totalPaise as number) || 0), 0);

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>Store Orders</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {paid.length} paid orders · {formatPaise(revenue)} gross · manage fulfilment below.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        <button className={`btn sm ${filter === '' ? '' : 'secondary'}`} onClick={() => setFilter('')}>All</button>
        {(['confirmed', 'shipped', 'delivered', 'cancelled'] as const).map((s) => (
          <button key={s} className={`btn sm ${filter === s ? '' : 'secondary'}`} onClick={() => setFilter(s)}>{STATUS_LABEL[s]}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <p className="muted">Loading…</p> : shown.length === 0 ? <p className="muted">No orders.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cardify">
              <thead><tr><th>Order</th><th>Items</th><th>Total</th><th>Placed</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Order"><b>{(o.orderNo as string) || o.id.slice(0, 6)}</b><br /><span className="muted" style={{ fontSize: 12 }}>{(o.address as Address)?.name || '—'}</span></td>
                    <td data-label="Items" className="muted">{(o.itemCount as number) ?? '—'}</td>
                    <td data-label="Total"><b>{formatPaise(o.totalPaise as number)}</b></td>
                    <td data-label="Placed" className="muted" style={{ fontSize: 13 }}>{o.createdAt?.toMillis ? formatDate(o.createdAt.toMillis()) : '—'}</td>
                    <td data-label="Status">
                      <span style={{ color: STATUS_COLOR[o.status as string] || '#666', fontWeight: 600, fontSize: 13 }}>
                        {STATUS_LABEL[o.status as string] || (o.status as string)}
                      </span>
                    </td>
                    <td data-label=""><button className="btn sm secondary" onClick={() => setOpen(o)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <OrderDrawer order={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

interface Address { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; landmark?: string }
interface Item { title: string; qty: number; pricePaise: number; lineTotalPaise: number; image?: string | null }

function OrderDrawer({ order, onClose }: { order: Row; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [courier, setCourier] = useState((order.courier as string) ?? '');
  const [tracking, setTracking] = useState((order.trackingNumber as string) ?? '');
  const addr = order.address as Address;
  const items = (order.items as Item[]) ?? [];
  const status = order.status as string;

  async function advance(to: string) {
    if (to === 'shipped' && (!courier.trim() || !tracking.trim())) {
      return alert('Add courier + tracking number before marking as shipped.');
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'storeOrders', order.id), {
        status: to,
        ...(to === 'shipped' ? { courier: courier.trim(), trackingNumber: tracking.trim() } : {}),
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({ status: to, at: Date.now(), source: 'admin' }),
      });
      onClose();
    } catch (e) { alert('Failed: ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  const nextStatus = status === 'confirmed' ? 'shipped' : status === 'shipped' ? 'delivered' : null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(460px,100%)', height: '100%', overflowY: 'auto', borderRadius: 0, margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{(order.orderNo as string) || 'Order'}</h3>
          <button className="btn sm secondary" onClick={onClose}>Close</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {STATUS_LABEL[status] || status} · {order.createdAt?.toMillis ? formatDate(order.createdAt.toMillis()) : ''}
        </p>

        <h4 style={{ marginBottom: 6 }}>Items</h4>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border,#eee)' }}>
            {it.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={it.image} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
              : <span style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--surface,#f1f1f4)', display: 'grid', placeItems: 'center' }}>🛍️</span>}
            <div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{it.title}</b><br /><span className="muted" style={{ fontSize: 12 }}>{formatPaise(it.pricePaise)} × {it.qty}</span></div>
            <b>{formatPaise(it.lineTotalPaise)}</b>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <Row2 k="Subtotal" v={formatPaise(order.subtotalPaise as number)} />
          <Row2 k="Shipping" v={(order.shippingPaise as number) ? formatPaise(order.shippingPaise as number) : 'FREE'} />
          <Row2 k="Total" v={formatPaise(order.totalPaise as number)} bold />
        </div>

        <h4 style={{ marginBottom: 6, marginTop: 18 }}>Deliver to</h4>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          <b>{addr?.name}</b> · {addr?.phone}<br />
          {addr?.line1}{addr?.line2 ? `, ${addr.line2}` : ''}<br />
          {addr?.landmark ? <>{addr.landmark}<br /></> : null}
          {addr?.city}, {addr?.state} — {addr?.pincode}
        </p>

        {(status === 'confirmed' || status === 'shipped') && (
          <>
            <h4 style={{ marginBottom: 6, marginTop: 18 }}>Shipping</h4>
            <label className="af"><span>Courier</span>
              <input className="input" placeholder="e.g. Delhivery" value={courier} onChange={(e) => setCourier(e.target.value)} />
            </label>
            <label className="af" style={{ marginTop: 8 }}><span>Tracking number</span>
              <input className="input" placeholder="AWB / tracking ID" value={tracking} onChange={(e) => setTracking(e.target.value)} />
            </label>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          {nextStatus && (
            <button className="btn" disabled={busy} onClick={() => advance(nextStatus)}>
              {busy ? 'Saving…' : nextStatus === 'shipped' ? 'Mark as shipped' : 'Mark as delivered'}
            </button>
          )}
          {status !== 'delivered' && status !== 'cancelled' && (
            <button className="btn secondary danger" disabled={busy}
              onClick={() => { if (confirm('Cancel this order? (Refund the customer separately in Razorpay.)')) advance('cancelled'); }}>
              Cancel order
            </button>
          )}
        </div>
        {order.paymentId ? <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Razorpay payment: {order.paymentId as string}</p> : null}
      </div>
    </div>
  );
}

function Row2({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: bold ? 700 : 400 }}>
      <span className={bold ? '' : 'muted'}>{k}</span><span>{v}</span>
    </div>
  );
}
