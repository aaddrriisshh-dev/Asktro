'use client';

import { useState, useEffect, ReactNode } from 'react';

/**
 * Transparent on desktop, a collapsible fold on mobile (≤900px). Wrap a page
 * section in this to keep the phone view tidy: on a phone the section becomes a
 * tappable header that expands its content; on desktop it renders the children
 * untouched so the existing layout is unchanged.
 */
export function MobileSection({
  title, subtitle, defaultOpen = false, children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  if (!mobile) return <>{children}</>;

  return (
    <section className={`mfold${open ? ' mfold--open' : ''}`}>
      <button type="button" className="mfold__head" onClick={() => setOpen((o) => !o)}>
        <span className="mfold__title">{title}</span>
        {subtitle && <span className="mfold__sub">{subtitle}</span>}
        <span className="mfold__chev" aria-hidden>▾</span>
      </button>
      {open && <div className="mfold__body">{children}</div>}
    </section>
  );
}
