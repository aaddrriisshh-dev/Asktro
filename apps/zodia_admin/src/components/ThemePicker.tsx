'use client';

import { useState } from 'react';
import { PROMO_THEMES, ART_SRC, PromoTheme, themeById } from '@/lib/promoThemes';

function swatchBg(t: PromoTheme): React.CSSProperties {
  return t.layout === 'photo'
    ? { backgroundImage: `${t.bg}, url(${ART_SRC[t.art!]})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: t.bg };
}

/** Collapsible theme dropdown. Closed, it shows the selected theme in one row;
 *  open, the 20 celestial themes appear as a horizontal slider. Sits beside
 *  “upload a photo” in the Coupon / Banner / Push composers. */
export function ThemePicker({
  value, onSelect,
}: {
  value: string;
  onSelect: (t: PromoTheme | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const sel = themeById(value);

  return (
    <div className={`tp${open ? ' tp--open' : ''}`}>
      <button type="button" className="tp__head" onClick={() => setOpen((o) => !o)}>
        <span className="tp__chip" style={sel ? swatchBg(sel) : undefined}>{sel ? sel.medal : '🎨'}</span>
        <span className="tp__label">
          <b>{sel ? sel.name : 'Choose a theme'}</b>
          <span className="muted">{sel ? 'Tap to change' : 'No design needed — pick & type'}</span>
        </span>
        <span className="tp__chev" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="tp__body">
          <div className="theme-grid">
            <button type="button" className={`theme-sw theme-sw--none${value ? '' : ' on'}`}
              onClick={() => { onSelect(null); }} title="No theme — use your own photo / colours">
              <span>None</span>
            </button>
            {PROMO_THEMES.map((t) => (
              <button key={t.id} type="button" className={`theme-sw${value === t.id ? ' on' : ''}`}
                style={{ ...swatchBg(t), color: t.tx, borderColor: value === t.id ? '#f0c96b' : t.edge }}
                onClick={() => { onSelect(t); setOpen(false); }} title={t.name}>
                <span className="theme-sw__medal">{t.medal}</span>
                <span className="theme-sw__name" style={{ color: t.tx }}>{t.name}</span>
                {value === t.id && <span className="theme-sw__tick">✓</span>}
              </button>
            ))}
          </div>
          <p className="muted" style={{ margin: '8px 2px 0', fontSize: 12 }}>
            Pick any of the 20 · uploading a photo below overrides the theme background.
          </p>
        </div>
      )}
    </div>
  );
}
