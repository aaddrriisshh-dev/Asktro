'use client';

import { ReactNode, useState } from 'react';
import { useCardFilter } from '@/lib/useCardFilter';
import { Preset, Range } from '@/lib/dateRange';
import { DrawerFilter } from './DrawerFilter';
import { Drawer } from './Drawer';

/** Shape every card's data hook returns. */
export interface CardView<T = unknown> {
  loading: boolean;
  error: string | null;
  value: string; // the big headline number
  pill?: string; // small context pill
  data: T | null; // handed to renderDrawer
}

const expandIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3h7v7M21 3l-8 8" />
    <path d="M10 21H3v-7M3 21l8-8" />
  </svg>
);

/**
 * Reusable dashboard stat card: a small colour-coded tile that opens a
 * light, colourful analytics drawer with an in-panel date/time filter.
 */
export function DashCard<T>({
  cardKey,
  defaultPreset = 'last30',
  accentClass,
  accent,
  icon,
  title,
  decor,
  useData,
  renderDrawer,
}: {
  cardKey: string;
  defaultPreset?: Preset;
  accentClass: string;
  accent: string;
  icon: ReactNode;
  title: string;
  decor?: string;
  useData: (range: Range) => CardView<T>;
  renderDrawer: (data: T, range: Range) => ReactNode;
}) {
  const { preset, setPreset, custom, setCustom, range } = useCardFilter(cardKey, defaultPreset);
  const view = useData(range);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={`stat dashcard ${accentClass}`} onClick={() => setOpen(true)} role="button" tabIndex={0}>
        <button
          className="dashcard__expand"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          aria-label={`Open ${title}`}
        >
          {expandIcon}
        </button>
        <div className="stat__label">
          <span className="stat__icon">{icon}</span>
          {title}
        </div>
        {view.error ? (
          <div className="dashcard__err">Couldn’t load</div>
        ) : view.loading ? (
          <div className="dashcard__skel" />
        ) : (
          <div className="stat__value">{view.value}</div>
        )}
        <div className="stat__foot">
          {!view.loading && !view.error && view.pill && <span className="stat__pill">{view.pill}</span>}
          <span className="dashcard__range">{range.label}</span>
        </div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title={title} subtitle={range.label} accent={accent} decor={decor}>
        <DrawerFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
        {view.error ? (
          <p className="dashcard__err">Couldn’t load — {view.error}</p>
        ) : view.loading || !view.data ? (
          <div className="dashcard__skel" style={{ height: 200 }} />
        ) : (
          renderDrawer(view.data, range)
        )}
      </Drawer>
    </>
  );
}
