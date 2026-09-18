'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

/**
 * In-place drill-downs for a card's analytics drawer.
 *
 * Instead of a metric tile jumping to another page, clicking it opens a detail
 * OVERLAY on top of the panel that lists the exact records behind that number
 * (10 rows by default, expandable via the Rows selector) with a Close button.
 * The overlay is portaled to <body> so it sits above the panel AND the bell.
 */

export interface DrillColumn<R> {
  header: string;
  cell: (r: R) => ReactNode;
  /** right-align numeric columns */
  align?: 'left' | 'right';
}

export interface DrillDef<R> {
  title: string;
  subtitle?: string;
  rows: R[];
  columns: DrillColumn<R>[];
  emptyNote?: string;
  /** when set, a search box appears and filters rows by this predicate */
  search?: (r: R, q: string) => boolean;
}

export interface DrillTile<R> {
  color: string;      // e.g. 'c-rose' — sets the --c accent
  label: string;
  value: string;
  big?: boolean;
  /** when present, the tile opens a detail overlay with these records */
  drill?: DrillDef<R>;
  /** fallback: navigate to another console instead of opening an overlay */
  href?: string;
}

const ROW_OPTIONS = [10, 50, 100];

function DetailOverlay<R>({ def, onClose }: { def: DrillDef<R>; onClose: () => void }) {
  const [limit, setLimit] = useState(10);
  const [q, setQ] = useState('');
  const rows = def.search && q.trim() ? def.rows.filter((r) => def.search!(r, q.trim().toLowerCase())) : def.rows;
  const all = rows.length;
  const shown = rows.slice(0, limit);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    // Lock the page/panel behind so the wheel scrolls the LIST, not the
    // background. Restored to whatever it was when the overlay closes.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="ovl-backdrop" onClick={onClose} role="presentation">
      <aside className="ovl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={def.title}>
        <header className="ovl-head">
          <div className="ovl-titles">
            <h2 className="ovl-title">{def.title}</h2>
            {def.subtitle && <p className="ovl-sub">{def.subtitle}</p>}
          </div>
          <div className="ovl-head-right">
            {def.search && (
              <input
                className="input ovl-search"
                placeholder="Search name / phone / email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
            <button className="ovl-close" onClick={onClose} aria-label="Close">✕ Close</button>
          </div>
        </header>
        <div className="ovl-body">
          {all === 0 ? (
            <p className="drawer-muted">{def.emptyNote ?? 'Nothing here yet.'}</p>
          ) : (
            <table className="ovl-table">
              <thead>
                <tr>{def.columns.map((c, i) => (
                  <th key={i} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>{c.header}</th>
                ))}</tr>
              </thead>
              <tbody>
                {shown.map((r, ri) => (
                  <tr key={ri}>{def.columns.map((c, ci) => (
                    <td key={ci} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>{c.cell(r)}</td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <footer className="ovl-foot">
          <span className="muted">Showing {Math.min(limit, all)} of {all.toLocaleString('en-IN')}</span>
          <label className="muted">Rows
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {ROW_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={all || 1}>All</option>
            </select>
          </label>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

export function DrillGrid<R>({ tiles }: { tiles: DrillTile<R>[] }) {
  const [active, setActive] = useState<number | null>(null);
  const activeDef = active != null ? tiles[active]?.drill : null;

  return (
    <>
      <div className="metricgrid">
        {tiles.map((t, i) => {
          const cls = `metricchip ${t.color}${t.big ? ' big' : ''}`;
          const inner = (<><span>{t.label}</span><strong>{t.value}</strong></>);
          if (t.drill) {
            return (
              <button key={i} type="button" className={`${cls} metricchip--link metricchip--drill`} onClick={() => setActive(i)}>
                {inner}
                <span className="mc-go" aria-hidden>›</span>
              </button>
            );
          }
          if (t.href) {
            return <Link key={i} href={t.href} className={`${cls} metricchip--link`}>{inner}</Link>;
          }
          return <div key={i} className={cls}>{inner}</div>;
        })}
      </div>
      {activeDef && <DetailOverlay def={activeDef} onClose={() => setActive(null)} />}
    </>
  );
}
