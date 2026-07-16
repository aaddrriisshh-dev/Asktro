'use client';

import { useState } from 'react';
import { themeById, ART_SRC, PromoTheme, headlineColor } from '@/lib/promoThemes';

/** Live preview of a composed promo (push / banner / coupon). Shows the small
 *  strip (notification / home card) and — when a landing view is chosen — an
 *  exact phone-frame mockup of the half- or full-screen view. A theme adds the
 *  celestial background, golden frame and art. “Expand” opens it larger. */
export function PromoPreview({
  title, body, image, imageStyle = 'banner', bg = '#2e2b5f', fg = '#ffffff', kind = 'push',
  displayMode = 'small', portraitImage, ctaText,
  landingTitle, landingBody, landingBg = '#2e2b5f', landingFg = '#ffffff', code, theme,
  textPosition = 'center', textAlign = 'left', headlineScale = 1,
}: {
  title?: string;
  body?: string;
  image?: string;
  imageStyle?: 'banner' | 'portrait';
  bg?: string;
  fg?: string;
  kind?: 'push' | 'banner' | 'coupon';
  displayMode?: 'small' | 'half' | 'full';
  portraitImage?: string;
  ctaText?: string;
  landingTitle?: string;
  landingBody?: string;
  landingBg?: string;
  landingFg?: string;
  code?: string;
  theme?: string;
  textPosition?: string;
  textAlign?: string;
  headlineScale?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const th = themeById(theme);
  const portrait = imageStyle === 'portrait' && image;
  const landing = displayMode === 'half' || displayMode === 'full';
  const cta = ctaText?.trim();
  // Landing view has its own optional headline/body; when left empty it falls
  // back to the strip's title/description so what you type up top shows here too.
  const lTitle = landingTitle?.trim() || title?.trim() || 'Your landing headline';
  const lBody = landingBody?.trim() || body?.trim() || 'Your landing description appears here.';

  const cardBg = th ? themeBgStyle(th) : { background: bg };
  const txCard = th ? th.tx : fg;
  const lBgStyle = th ? themeBgStyle(th) : { background: landingBg };
  const lTx = th ? th.tx : landingFg;
  // Adaptive gold headline + hero copy, matching the app's showPromoPopup.
  const head = th ? headlineColor(th) : lTx;
  const heroKicker = kind === 'coupon' ? '✦  A GIFT FOR YOU' : '✦  JUST FOR YOU';
  const heroTag = kind === 'coupon' ? 'Everyone loves a gift, right?' : null;

  // A home banner with an uploaded photo overlays its text on the image (exactly
  // like the app), so its preview honours the position/align/size styling.
  const bannerImg = kind === 'banner' && !!image && imageStyle === 'banner';
  const centered = textAlign === 'center';
  const justify = textPosition === 'top' ? 'flex-start' : textPosition === 'bottom' ? 'flex-end' : 'center';

  const inner = (
    <>
      {/* Small strip — the notification / home card */}
      <span className="promo-kind">{kind === 'push' ? '🔔 Notification' : kind === 'banner' ? '🖼 Home strip' : '🎟 Coupon card'}</span>
      {bannerImg ? (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 1', borderRadius: 16, overflow: 'hidden',
          background: `center/cover no-repeat url(${image})` }}>
          <div style={{ position: 'absolute', inset: 0, background: centered
            ? 'linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.15) 60%, rgba(0,0,0,0))'
            : 'linear-gradient(to right, rgba(0,0,0,.80), rgba(0,0,0,.18) 65%, rgba(0,0,0,0))' }} />
          <div style={{ position: 'absolute', left: 16, right: centered ? 16 : undefined, top: 12, bottom: 12,
            width: centered ? undefined : '62%', display: 'flex', flexDirection: 'column',
            justifyContent: justify, alignItems: centered ? 'center' : 'flex-start', textAlign: centered ? 'center' : 'left' }}>
            {(title || '') && <div style={{ fontWeight: 800, color: fg, fontSize: 20 * headlineScale, lineHeight: 1.1 }}>{title}</div>}
            {(body || '') && <div style={{ color: fg, opacity: 0.9, fontSize: 12, marginTop: 5, lineHeight: 1.3 }}>{body}</div>}
            {ctaText?.trim() && <div style={{ marginTop: 10, alignSelf: centered ? 'center' : 'flex-start', background: '#fff', color: bg, fontWeight: 700, fontSize: 11, padding: '6px 12px', borderRadius: 11 }}>{ctaText} →</div>}
          </div>
        </div>
      ) : (
        <div className="promo-card" style={{ ...cardBg, color: txCard, position: 'relative', overflow: 'hidden' }}>
          {th && <ThemeSkin th={th} hideArt={!!(image && imageStyle === 'banner')} />}
          <div className="promo-body" style={{ display: 'flex', gap: 12, alignItems: 'center', position: 'relative', zIndex: 3 }}>
            {portrait && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="promo-img-portrait" src={image} alt="" />
            )}
            <div style={{ minWidth: 0, maxWidth: th && th.layout === 'split' ? '62%' : '100%' }}>
              <strong className="promo-title" style={{ color: txCard }}>{title || 'Your title appears here'}</strong>
              <p className="promo-text" style={{ color: txCard, opacity: 0.9 }}>{body || 'Your message / description appears here.'}</p>
              {kind === 'coupon' && code && (
                <span className="promo-code" style={{ color: txCard, borderColor: th ? th.edge : undefined }}>{code}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Landing view — phone-frame mockup of what opens on tap */}
      {landing && (
        <>
          <span className="promo-kind" style={{ marginTop: 16 }}>
            📱 {displayMode === 'full' ? 'Full-screen' : 'Half-screen'} view on tap
          </span>
          <div className="promo-phone">
            <div className="promo-notch" />
            {displayMode === 'full' ? (
              <div className="promo-screen" style={{ ...lBgStyle, color: lTx, position: 'relative', overflow: 'hidden' }}>
                {th ? (
                  <ThemeSkin th={th} variant="full" />
                ) : portraitImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="promo-full-img" src={portraitImage} alt="" />
                ) : (
                  <div className="promo-full-placeholder">Pick a theme (or upload a 9:16 portrait)</div>
                )}
                {th && (
                  <div className="promo-hero">
                    <span className="promo-kicker" style={{ color: head }}>{heroKicker}</span>
                    <span className="promo-hero-gift" style={{ backgroundImage: `url(${ART_SRC.gift})` }} />
                    {heroTag && <span className="promo-hero-tag" style={{ color: head }}>{heroTag}</span>}
                  </div>
                )}
                <div className="promo-full-overlay" style={{ position: 'relative', zIndex: 4 }}>
                  <strong className="promo-full-title" style={{ color: head }}>{lTitle}</strong>
                  <p className="promo-full-text" style={{ color: lTx }}>{lBody}</p>
                  {cta && <span className="promo-cta">{cta}</span>}
                </div>
                <span className="promo-close">×</span>
              </div>
            ) : (
              <div className="promo-screen promo-screen-dim">
                <div className="promo-half-sheet" style={{ ...lBgStyle, color: lTx, position: 'relative', overflow: 'hidden' }}>
                  {th && <ThemeSkin th={th} variant="half" />}
                  <span className="promo-close" style={{ position: 'static', alignSelf: 'flex-end', zIndex: 4 }}>×</span>
                  {portraitImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="promo-half-img" src={portraitImage} alt="" style={{ position: 'relative', zIndex: 4 }} />
                  )}
                  <strong className="promo-full-title" style={{ color: head, textAlign: 'center', position: 'relative', zIndex: 4 }}>{lTitle}</strong>
                  <p className="promo-full-text" style={{ color: lTx, textAlign: 'center', position: 'relative', zIndex: 4 }}>{lBody}</p>
                  {cta && <span className="promo-cta" style={{ alignSelf: 'stretch', textAlign: 'center', position: 'relative', zIndex: 4 }}>{cta}</span>}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="promo-wrap">
      <div className="pv-toolbar">
        <button type="button" className="pv-expand" onClick={() => setExpanded(true)}>⤢ Expand preview</button>
      </div>
      {inner}
      {expanded && (
        <div className="pv-modal" onClick={() => setExpanded(false)}>
          <button type="button" className="pv-modal__close" onClick={() => setExpanded(false)}>×</button>
          <div className="pv-modal__inner" style={{ width: 'min(420px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            {inner}
          </div>
        </div>
      )}
    </div>
  );
}

function themeBgStyle(th: PromoTheme): React.CSSProperties {
  if (th.layout === 'photo') {
    return { backgroundImage: `${th.bg}, url(${ART_SRC.scenery})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { background: th.bg };
}

/** Renders the theme's golden frame + art. Placement adapts per surface so art
 *  never collides with text:
 *   - card: gift/mandala right-anchored beside the left-aligned text.
 *   - full: gift/mandala as a centred hero in the upper area (text sits below).
 *   - half: split art steps aside entirely (the short centred sheet stays clean).
 *  The zodiac-wheel watermark sits behind at low opacity, so it's safe everywhere.
 *  `hideArt` (uploaded photo) drops theme art so the photo owns the card. */
function ThemeSkin({ th, variant = 'card', hideArt = false }: { th: PromoTheme; variant?: 'card' | 'half' | 'full'; hideArt?: boolean }) {
  const splitArt = th.layout === 'split' && th.art && th.art !== 'scenery';
  return (
    <>
      <span className="promo-frame" style={{ borderColor: th.edge }} />
      {!hideArt && splitArt && variant === 'card' && (
        <span className="promo-art" style={{ backgroundImage: `url(${ART_SRC[th.art!]})` }} />
      )}
      {/* full-screen split art is intentionally omitted: the popup draws its own
          gift hero, so rendering the theme's would stack two gifts. */}
      {!hideArt && th.layout === 'wm' && th.art && (
        <span
          className={variant === 'full' ? 'promo-wm promo-wm--big' : 'promo-wm'}
          style={{ backgroundImage: `url(${ART_SRC[th.art]})`, opacity: th.op ?? 0.3 }}
        />
      )}
    </>
  );
}
