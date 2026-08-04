'use client';

import React, { ReactNode, useEffect } from 'react';

/** Right-side slide-in analytics drawer, shared by all dashboard cards. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  accent,
  decor,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accent?: string;
  decor?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`drawer-root${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside
        className={`drawer-panel${decor ? ' ' + decor : ''}`}
        role="dialog"
        aria-modal="true"
        style={accent ? ({ ['--c']: accent } as React.CSSProperties) : undefined}
      >
        <div className="drawer-decor" aria-hidden="true" />
        <div className="drawer-head">
          <div>
            <h2 className="drawer-title">{title}</h2>
            {subtitle && <p className="drawer-sub">{subtitle}</p>}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="drawer-body">{open && children}</div>
      </aside>
    </div>
  );
}
