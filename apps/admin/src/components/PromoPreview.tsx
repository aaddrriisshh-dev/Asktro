'use client';

/** Live preview of a composed promo (push / banner / coupon): image + title +
 *  body on a chosen background — the exact look the app will render. */
export function PromoPreview({
  title, body, image, imageStyle = 'banner', bg = '#2e2b5f', fg = '#ffffff', kind = 'push',
}: {
  title?: string;
  body?: string;
  image?: string;
  imageStyle?: 'banner' | 'portrait';
  bg?: string;
  fg?: string;
  kind?: 'push' | 'banner' | 'coupon';
}) {
  const portrait = imageStyle === 'portrait' && image;
  return (
    <div className="promo-wrap">
      <span className="promo-kind">{kind === 'push' ? '🔔 Notification preview' : kind === 'banner' ? '🖼 Banner preview' : '🎟 Coupon preview'}</span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
