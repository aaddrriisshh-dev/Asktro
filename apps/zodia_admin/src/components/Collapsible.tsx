'use client';

import { useState, ReactNode } from 'react';

/** A tidy accordion panel: a header (title + optional summary + chevron) that
 *  expands/collapses its body. Used to keep the promo composers inside the
 *  viewport by folding away advanced sections. */
export function Collapsible({
  title, summary, defaultOpen = false, children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`cxp${open ? ' cxp--open' : ''}`}>
      <button type="button" className="cxp__head" onClick={() => setOpen((o) => !o)}>
        <span className="cxp__title">{title}</span>
        {summary && <span className="cxp__sum muted">{summary}</span>}
        <span className="cxp__chev" aria-hidden>▾</span>
      </button>
      {open && <div className="cxp__body">{children}</div>}
    </div>
  );
}
