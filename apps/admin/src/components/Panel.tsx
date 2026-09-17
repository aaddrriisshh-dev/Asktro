'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePanels } from '@/lib/panels';

/**
 * A detail panel that tiles into the dashboard workspace. When one is open it
 * behaves like a right drawer; open a second/third and they arrange as columns
 * (left → right). Each panel can be moved left/right or closed.
 *
 * IMPORTANT: the panel is rendered through a portal onto <body>. The dashboard
 * `<main>` establishes its own stacking context (`position:relative; z-index:1`),
 * which would otherwise TRAP the panel's z-index beneath the fixed AlertBell
 * (rendered as a sibling of <main> at z-index 1000). Portaling to <body> lets
 * the panel's z-index:1100 win, so its Close button is never hidden under the
 * notification bell.
 */
export function Panel({
  id, title, subtitle, accent, decor, children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  accent?: string;
  decor?: string;
  children: ReactNode;
}) {
  const { open, closePanel, move } = usePanels();
  const [mounted, setMounted] = useState(false);
  const idx = open.indexOf(id);
  const isOpen = idx >= 0;
  const n = open.length || 1;

  // Portals need the DOM — only render after mount (avoids SSR mismatch).
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closePanel(id); }
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, id, closePanel]);

  if (!isOpen || !mounted) return null;

  const style = {
    ['--n']: String(n),
    ['--i']: String(idx),
    ...(accent ? { ['--c']: accent } : {}),
  } as React.CSSProperties;

  const node = (
    <aside
      className={`pnl${idx === 0 ? ' pnl--lead' : ''}${decor ? ' ' + decor : ''}`}
      style={style}
      role="dialog"
      aria-label={title}
    >
      <div className="pnl-decor" aria-hidden="true" />
      <div className="pnl-head">
        <div className="pnl-titles">
          <h2 className="pnl-title">{title}</h2>
          {subtitle && <p className="pnl-sub">{subtitle}</p>}
        </div>
        <div className="pnl-tools">
          <button className="pnl-move" onClick={() => move(id, 'left')} disabled={idx === 0} aria-label="Move panel left" title="Move left">‹</button>
          <button className="pnl-move" onClick={() => move(id, 'right')} disabled={idx === n - 1} aria-label="Move panel right" title="Move right">›</button>
          <button className="pnl-close" onClick={() => closePanel(id)} aria-label="Close panel" title="Close">✕ Close</button>
        </div>
      </div>
      <div className="pnl-body">{children}</div>
    </aside>
  );

  return createPortal(node, document.body);
}
