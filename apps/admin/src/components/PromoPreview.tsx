'use client';

import { themeById, ART_SRC, PromoTheme } from '@/lib/promoThemes';

/** Live preview of a composed promo (push / banner / coupon). Shows the small
 *  strip (notification / home card) and — when a landing view is chosen — an
 *  exact phone-frame mockup of the half- or full-screen view. When a theme is
 *  picked, the celestial background, golden frame and art are rendered too. */
export function PromoPreview({
  title, body, image, imageStyle = 'banner', bg = '#2e2b5f', fg = '#ffffff', kind = 'push',
  displayMode = 'small', portraitImage, ctaText,
  landingTitle, landingBody, landingBg = '#2e2b5f', landingFg = '#ffffff', code, theme,
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
}) {
  const th = themeById(theme);
  const portrait = imageStyle === 'portrait' && image;
  const landing = displayMode === 'half' || displayMode === 'full';
  const cta = ctaText?.trim();
  const lTitle = landingTitle?.trim() || 'Your landing headline';
  const lBody = landingBody?.trim() || 'Your landing description appears here.';

  const cardBg = th ? themeBgStyle(th) : { background: bg };
  const txCard = th ? th.tx : fg;
  const lBgStyle = th ? themeBgStyle(th) : { background: landingBg };
  const lTx = th ? th.tx : landingFg;

  return (
    <div className="promo-wrap">
      {/* Small strip — the notification / home card */}
      <span className="promo-kind">{kind === 'push' ? '🔔 Notification' : kind === 'banner' ? '🖼 Home strip' : '🎟 Coupon card'}</span>
      <div className="promo-card" style={{ ...cardBg, color: txCard, position: 'relative', overflow: 'hidden' }}>
        {th && <ThemeSkin th={th} />}
        {image && imageStyle === 'banner' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="promo-img-banner" src={image} alt="" style={{ position: 'relative', zIndex: 2 }} />
        )}
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
                {portraitImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="promo-full-img" src={portraitImage} alt="" />
                ) : th ? (
                  <ThemeSkin th={th} big />
                ) : (
                  <div className="promo-full-placeholder">Upload a 9:16 portrait image</div>
                )}
                <div className="promo-full-overlay" style={{ position: 'relative', zIndex: 4 }}>
                  <strong className="promo-full-title" style={{ color: lTx }}>{lTitle}</strong>
                  <p className="promo-full-text" style={{ color: lTx }}>{lBody}</p>
                  {cta && <span className="promo-cta">{cta}</span>}
                </div>
                <span className="promo-close">×</span>
              </div>
            ) : (
              <div className="promo-screen promo-screen-dim">
                <div className="promo-half-sheet" style={{ ...lBgStyle, color: lTx, position: 'relative', overflow: 'hidden' }}>
                  {th && <ThemeSkin th={th} />}
                  <span className="promo-close" style={{ position: 'static', alignSelf: 'flex-end', zIndex: 4 }}>×</span>
                  {portraitImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="promo-half-img" src={portraitImage} alt="" style={{ position: 'relative', zIndex: 4 }} />
                  )}
                  <strong className="promo-full-title" style={{ color: lTx, textAlign: 'center', position: 'relative', zIndex: 4 }}>{lTitle}</strong>
                  <p className="promo-full-text" style={{ color: lTx, textAlign: 'center', position: 'relative', zIndex: 4 }}>{lBody}</p>
                  {cta && <span className="promo-cta" style={{ alignSelf: 'stretch', textAlign: 'center', position: 'relative', zIndex: 4 }}>{cta}</span>}
                </div>
              </div>
            )}
          </div>
        </>
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

/** Renders the theme's golden frame + art (right-anchored image or watermark). */
function ThemeSkin({ th, big = false }: { th: PromoTheme; big?: boolean }) {
  return (
    <>
      <span className="promo-frame" style={{ borderColor: th.edge }} />
      {th.layout === 'split' && th.art && th.art !== 'scenery' && (
        <span className="promo-art" style={{ backgroundImage: `url(${ART_SRC[th.art]})` }} />
      )}
      {th.layout === 'wm' && th.art && (
        <span
          className={big ? 'promo-wm promo-wm--big' : 'promo-wm'}
          style={{ backgroundImage: `url(${ART_SRC[th.art]})`, opacity: th.op ?? 0.3 }}
        />
      )}
    </>
  );
}
