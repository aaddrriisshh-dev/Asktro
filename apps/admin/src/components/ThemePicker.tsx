'use client';

import { PROMO_THEMES, ART_SRC, PromoTheme } from '@/lib/promoThemes';

/** A swatch strip of the 20 celestial themes. Sits next to “upload a photo”
 *  in the Coupon / Banner / Push composers. Selecting one drives the preview
 *  and stores its id on the doc; the app renders the identical theme. */
export function ThemePicker({
  value, onSelect,
}: {
  value: string;
  onSelect: (t: PromoTheme | null) => void;
}) {
  return (
    <div>
      <div className="theme-swatches">
        <button
          type="button"
          className={`theme-sw theme-sw--none${value ? '' : ' on'}`}
          onClick={() => onSelect(null)}
          title="No theme — use your own photo / colours"
        >
          <span>None</span>
        </button>

        {PROMO_THEMES.map((t) => {
          const bg =
            t.layout === 'photo'
              ? { backgroundImage: `${t.bg}, url(${ART_SRC[t.art!]})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: t.bg };
          return (
            <button
              key={t.id}
              type="button"
              className={`theme-sw${value === t.id ? ' on' : ''}`}
              style={{ ...bg, color: t.tx, borderColor: value === t.id ? '#f0c96b' : t.edge }}
              onClick={() => onSelect(t)}
              title={t.name}
            >
              <span className="theme-sw__medal">{t.medal}</span>
              <span className="theme-sw__name" style={{ color: t.tx }}>{t.name}</span>
              {value === t.id && <span className="theme-sw__tick">✓</span>}
            </button>
          );
        })}
      </div>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
        Pick a theme — the preview repaints instantly and you just type your words. Uploading a photo below is optional and overrides the theme background.
      </p>
    </div>
  );
}
