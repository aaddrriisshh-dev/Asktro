'use client';

import React, { ReactNode, useEffect } from 'react';
import { usePanels } from '@/lib/panels';

/**
 * A detail panel that tiles into the dashboard workspace. When one is open it
 * behaves like a right drawer; open a second/third and they arrange as columns
 * (left → right). Each panel can be moved left/right or closed.
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
  const idx = open.indexOf(id);
  const isOpen = idx >= 0;
  const n = open.length || 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closePanel(id); }
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, id, closePanel]);

  if (!isOpen) return null;

  const style = {
    ['--n']: String(n),
    ['--i']: String(idx),
    ...(accent ? { ['--c']: accent } : {}),
  } as React.CSSProperties;

  return (
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
          <button className="pnl-close" onClick={() => closePanel(id)} aria-label="Close panel" title="Close">×</button>
        </div>
      </div>
      <div className="pnl-body">{children}</div>
    </aside>
  );
}
