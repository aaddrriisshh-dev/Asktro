'use client';

/** Live preview of a composed promo (push / banner / coupon). Shows the small
 *  strip (notification / home card) and — when a landing view is chosen — an
 *  exact phone-frame mockup of the half- or full-screen view. The landing view
 *  uses its OWN title / body / colours (independent of the strip). */
export function PromoPreview({
  title, body, image, imageStyle = 'banner', bg = '#2e2b5f', fg = '#ffffff', kind = 'push',
  displayMode = 'small', portraitImage, ctaText,
  landingTitle, landingBody, landingBg = '#2e2b5f', landingFg = '#ffffff', code,
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
}) {
  const portrait = imageStyle === 'portrait' && image;
  const landing = displayMode === 'half' || displayMode === 'full';
  const cta = ctaText?.trim();
  const lTitle = landingTitle?.trim() || 'Your landing headline';
  const lBody = landingBody?.trim() || 'Your landing description appears here.';

  return (
    <div className="promo-wrap">
      {/* Small strip — the notification / home card */}
      <span className="promo-kind">{kind === 'push' ? '🔔 Notification' : kind === 'banner' ? '🖼 Home strip' : '🎟 Coupon card'}</span>
      <div className="promo-card" style={{ background: bg, color: fg }}>
        {image && imageStyle === 'banner' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="promo-img-banner" src={image} alt="" />
        )}
        <div className="promo-body" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {portrait && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="promo-img-portrait" src={image} alt="" />
          )}
          <div style={{ minWidth: 0 }}>
            <strong className="promo-title" style={{ color: fg }}>{title || 'Your title appears here'}</strong>
            <p className="promo-text" style={{ color: fg, opacity: 0.9 }}>{body || 'Your message / description appears here.'}</p>
            {kind === 'coupon' && code && (
              <span className="promo-code" style={{ color: fg }}>{code}</span>
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
              <div className="promo-screen" style={{ background: landingBg, color: landingFg }}>
                {portraitImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="promo-full-img" src={portraitImage} alt="" />
                ) : (
                  <div className="promo-full-placeholder">Upload a 9:16 portrait image</div>
                )}
                <div className="promo-full-overlay">
                  <strong className="promo-full-title" style={{ color: landingFg }}>{lTitle}</strong>
                  <p className="promo-full-text" style={{ color: landingFg }}>{lBody}</p>
                  {cta && <span className="promo-cta">{cta}</span>}
                </div>
                <span className="promo-close">×</span>
              </div>
            ) : (
              <div className="promo-screen promo-screen-dim">
                <div className="promo-half-sheet" style={{ background: landingBg, color: landingFg }}>
                  <span className="promo-close" style={{ position: 'static', alignSelf: 'flex-end' }}>×</span>
                  {portraitImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="promo-half-img" src={portraitImage} alt="" />
                  )}
                  <strong className="promo-full-title" style={{ color: landingFg, textAlign: 'center' }}>{lTitle}</strong>
                  <p className="promo-full-text" style={{ color: landingFg, textAlign: 'center' }}>{lBody}</p>
                  {cta && <span className="promo-cta" style={{ alignSelf: 'stretch', textAlign: 'center' }}>{cta}</span>}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
