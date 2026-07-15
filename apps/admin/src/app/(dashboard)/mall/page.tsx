'use client';

import Link from 'next/link';
import { limit, orderBy } from 'firebase/firestore';
import { useCollection } from '@/lib/hooks';
import { formatPaise } from '@/lib/format';
import { MallNav } from '@/components/MallNav';

/** Asktro Mall — the e-commerce back-office home. Glanceable KPIs + jump-off
 *  cards into each store section. The whole Mall lives under its own menu
 *  (MallNav), separate from the main operations sidebar. */
export default function MallDashboardPage() {
  const { rows: products } = useCollection('storeProducts');
  const { rows: cats } = useCollection('storeCategories');
  const { rows: orders } = useCollection('storeOrders', [orderBy('createdAt', 'desc'), limit(200)]);

  const activeProducts = products.filter((p) => p.active !== false);
  const lowStock = products.filter((p) => typeof p.stock === 'number' && (p.stock as number) <= 5);
  const paidOrders = orders.filter((o) => !['pending_payment', 'cancelled'].includes(o.status as string));
  const toShip = orders.filter((o) => ['paid', 'confirmed', 'packed', 'processing'].includes(o.status as string));
  const revenue = paidOrders.reduce((sum, o) => sum + ((o.totalPaise as number) || 0), 0);

  return (
    <div>
      <MallNav />

      <h1 style={{ marginBottom: 2 }}>Dashboard</h1>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Your e-commerce store at a glance. Manage everything from the tabs above.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 18 }}>
        <Kpi label="Live products" value={activeProducts.length} sub={`${products.length} total`} />
        <Kpi label="Categories" value={cats.length} />
        <Kpi label="Orders (recent)" value={orders.length} sub={paidOrders.length ? `${paidOrders.length} paid` : undefined} />
        <Kpi label="To ship" value={toShip.length} accent={toShip.length ? '#C4562E' : undefined} />
        <Kpi label="Low stock (≤5)" value={lowStock.length} accent={lowStock.length ? '#C4562E' : undefined} />
        <Kpi label="Revenue (recent)" value={formatPaise(revenue)} />
      </div>

      <h2 style={{ fontSize: 16, margin: '26px 0 12px' }}>Manage the store</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        <SectionCard href="/store" emoji="🗂️" title="Catalog" desc="Products, categories, prices, photos, specs, variants" />
        <SectionCard href="/store-orders" emoji="📦" title="Orders" desc="Fulfil orders, tracking, status & courier" />
        <SectionCard href="/store-content" emoji="✍️" title="Content" desc="Testimonials, videos, FAQs & product reviews" />
        <SectionCard href="/home-content" emoji="🏠" title="Home Screen" desc="The trust band shown on the app home" />
      </div>

      {lowStock.length > 0 && (
        <div className="card" style={{ marginTop: 22 }}>
          <h3 style={{ marginTop: 0 }}>⚠️ Low stock</h3>
          {lowStock.slice(0, 8).map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border,#eee)', fontSize: 14 }}>
              <span>{p.title as string}</span>
              <strong style={{ color: '#C4562E' }}>{p.stock as number} left</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: accent ?? 'inherit' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ href, emoji, title, desc }: { href: string; emoji: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card" style={{ padding: 16, textDecoration: 'none', display: 'block' }}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ fontWeight: 800, marginTop: 6, fontSize: 15 }}>{title}</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{desc}</div>
    </Link>
  );
}
