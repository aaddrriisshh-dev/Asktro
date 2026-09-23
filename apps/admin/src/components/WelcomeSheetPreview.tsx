'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BgThemeId,
  BreakupRow,
  ParticleStyle,
  bgTheme,
  computeWelcomeTotals,
  rupees,
} from '@/lib/welcomePopup';

export interface WelcomeSheetPreviewProps {
  word1: string;
  word2: string;
  body: string;
  /** Pay-button text. Blank shows the charged amount (matches the app). */
  ctaLabel?: string;
  offerGetPaise: number;
  rechargeBasePaise: number;
  gstRatePct: number;
  breakupRows: BreakupRow[];
  showBreakup: boolean;
  totalOverridePaise: number | null;
  bgTheme: BgThemeId;
  particleStyle: ParticleStyle;
  /** Uploaded art overrides the bundled pandit character. */
  image?: string;
  /** welcome_reward is a bottom sheet by default; 'full' is a takeover. */
  displayMode: 'half' | 'full';
  /** Which face of the flow to show. */
  view: 'offer' | 'reward';
  /** Reward amount (plan credit); falls back to the "Get ₹X" gift. */
  rewardCreditPaise?: number | null;
}

const PANDIT_SRC = '/promo-art/welcome.webp';

/** A faithful mock of the app's welcome-offer bottom sheet: 64%-height rounded
 *  sheet, the exact bgTheme gradient, grabber, two-tone headline, "Get ₹X in
 *  your wallet", the pandit (or uploaded) character, the offer line, the
 *  purple→gold pay button + gold "No, thanks →", and the tappable Total Payment
 *  breakdown. A second face previews the "No thanks" reward popup. Updates live. */
export function WelcomeSheetPreview(p: WelcomeSheetPreviewProps) {
  const theme = bgTheme(p.bgTheme);
  const { gstPaise, totalPaise } = computeWelcomeTotals({
    rechargeBasePaise: p.rechargeBasePaise,
    gstRatePct: p.gstRatePct,
    breakupRows: p.breakupRows,
    totalOverridePaise: p.totalOverridePaise,
  });

  const [openBreak, setOpenBreak] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dark = theme.dark;
  const titleW1 = dark ? '#F3ECFF' : '#1C1633';
  const subColor = dark ? '#E7DEF8' : '#6B6390';
  const offerColor = dark ? '#F0EAFB' : '#1C1633';
  const charSrc = p.image?.trim() ? p.image : PANDIT_SRC;
  // Match the app: a non-empty label wins; otherwise show the charged amount.
  const payLabel = (p.ctaLabel && p.ctaLabel.trim())
    ? p.ctaLabel.trim()
    : (totalPaise > 0 ? rupees(totalPaise) : 'Claim now');
  const rewardPaise = p.rewardCreditPaise ?? p.offerGetPaise;

  const [s1, s2, s3, s4] = theme.stops;
  const sheetBg = `linear-gradient(180deg, ${s1} 0%, ${s2} 38%, ${s3} 72%, ${s4} 100%)`;

  // Lightweight falling particles on a canvas sized to the sheet.
  useEffect(() => {
    const canvas = canvasRef.current;
    const sheet = sheetRef.current;
    if (!canvas || !sheet) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
    const w = sheet.clientWidth;
    const h = sheet.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (p.particleStyle === 'none' || w === 0 || h === 0) {
      ctx.clearRect(0, 0, w, h);
      return;
    }

    type Kind = 'star' | 'coin' | 'dot';
    const kinds: Kind[] = p.particleStyle === 'coins' ? ['coin']
      : p.particleStyle === 'stars' ? ['star']
        : ['star', 'coin', 'dot'];
    const colors = ['#E7B93C', '#B79BE6', '#EAD079', '#8A63D2'];
    const glyphs = ['✦', '✧', '⋆'];
    const N = p.particleStyle === 'mixed' ? 24 : 18;
    const parts = Array.from({ length: N }, () => {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      return {
        kind,
        x: Math.random() * w,
        y: Math.random() * h,
        size: kind === 'dot' ? 2 + Math.random() * 3 : 9 + Math.random() * 7,
        sp: 0.2 + Math.random() * 0.45,
        col: colors[Math.floor(Math.random() * colors.length)],
        gl: glyphs[Math.floor(Math.random() * glyphs.length)],
      };
    });

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const pt of parts) {
        pt.y += pt.sp;
        if (pt.y > h + 12) { pt.y = -12; pt.x = Math.random() * w; }
        const op = pt.y < 40 ? pt.y / 40 : pt.y > h - 40 ? (h - pt.y) / 40 : 1;
        ctx.globalAlpha = Math.max(0, Math.min(0.85, op));
        if (pt.kind === 'star') {
          ctx.fillStyle = pt.col;
          ctx.font = pt.size + 'px serif';
          ctx.fillText(pt.gl, pt.x, pt.y);
        } else if (pt.kind === 'coin') {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size / 2, 0, 7);
          ctx.fillStyle = '#E9BE48';
          ctx.fill();
          ctx.fillStyle = '#8A5F13';
          ctx.font = (pt.size * 0.6) + 'px serif';
          ctx.textAlign = 'center';
          ctx.fillText('✦', pt.x, pt.y + pt.size * 0.2);
          ctx.textAlign = 'start';
        } else {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size / 2, 0, 7);
          ctx.fillStyle = pt.col;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [p.particleStyle, p.bgTheme, p.displayMode, p.view]);

  return (
    <div className="wprev">
      <div className="wprev-phone">
        <div className="wprev-notch" />
        <div className="wprev-screen">
          {/* faux home behind the sheet */}
          <div className="wprev-homebg">
            <span className="r" style={{ top: 56 }} />
            <span className="r" style={{ top: 72, right: 64, left: 'auto', width: '38%' }} />
            <span className="r" style={{ top: 98, height: 50, borderRadius: 12 }} />
            <span className="r" style={{ top: 162, height: 40, width: '44%', borderRadius: 11 }} />
            <span className="r" style={{ top: 162, left: 'auto', width: '44%', height: 40, borderRadius: 11 }} />
          </div>
          <div className="wprev-dim" />

          {p.view === 'offer' ? (
            <div
              ref={sheetRef}
              className={`wsheet${p.displayMode === 'full' ? ' full' : ''}`}
              style={{ background: sheetBg }}
            >
              <canvas ref={canvasRef} className="wsheet-fx" />
              <div className="wsheet-in">
                <div className="wgrabber" />
                <div className="wtitle">
                  <span style={{ color: titleW1 }}>{p.word1 || 'Triple'}</span>{' '}
                  <span style={{ color: '#C88617' }}>{p.word2 || 'Dhamaka'}</span>
                </div>
                <div className="wsub" style={{ color: subColor }}>
                  Get <b style={{ color: '#C88617' }}>{rupees(p.offerGetPaise)}</b> in your wallet
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="wchar"><img src={charSrc} alt="character" /></div>
                <div className="woffer" style={{ color: offerColor }}>
                  <span className="hair" />
                  <span className="sp">✦</span>
                  <span>{p.body || 'Grab this one-time offer'}</span>
                  <span className="sp">✦</span>
                  <span className="hair r" />
                </div>
                <div className="wbtns">
                  <div className="wcta pay">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
                      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a2 2 0 0 1 2 2v1H5.5A2.5 2.5 0 0 1 3 7.5zM3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1zm14.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="#fff" />
                    </svg>
                    <span>{payLabel}</span>
                  </div>
                  <div className="wcta no">No, thanks →</div>
                </div>
                {p.showBreakup && (
                  <div className="wtot" role="button" tabIndex={0} onClick={() => setOpenBreak((v) => !v)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpenBreak((v) => !v); }}>
                    Total Payment <span className="info">i</span>
                    {openBreak && (
                      <div className="wbreak" onClick={(e) => e.stopPropagation()}>
                        <h5>Payment Details</h5>
                        <div className="brow"><span>Total Amount</span><span>{rupees(p.rechargeBasePaise)}</span></div>
                        <div className="brow"><span>GST @ {p.gstRatePct}%</span><span>{rupees(gstPaise)}</span></div>
                        {p.breakupRows.map((r, i) => (
                          <div className="brow" key={i}>
                            <span>{r.label || 'Line'}</span>
                            <span>{r.amountPaise < 0 ? '− ' : ''}{rupees(Math.abs(r.amountPaise))}</span>
                          </div>
                        ))}
                        <div className="brow tot"><span>Grand Total</span><span>{rupees(totalPaise)}</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="wreward">
              <div className="wreward-card">
                <div className="emoji">🎉</div>
                <div className="rtxt">
                  <span className="amt">{rupees(rewardPaise)}</span> is still credited to your wallet{' '}
                  <span className="love">because we love you here</span>
                </div>
                <div className="pill">Aap Khush Toh Hum Khush 😊</div>
                <div className="rgo">Start my first reading →</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .wprev { display: flex; justify-content: center; }
        .wprev-phone {
          width: 250px; aspect-ratio: 250 / 512; background: #0F0B26; border-radius: 34px;
          padding: 9px; box-shadow: 0 20px 50px rgba(20,10,50,.4), inset 0 0 0 2px rgba(255,255,255,.05);
          position: relative;
        }
        .wprev-notch {
          position: absolute; top: 11px; left: 50%; transform: translateX(-50%);
          width: 90px; height: 19px; border-radius: 12px; background: #0F0B26; z-index: 6;
        }
        .wprev-screen {
          width: 100%; height: 100%; border-radius: 26px; overflow: hidden; position: relative; background: #120d2c;
        }
        .wprev-homebg {
          position: absolute; inset: 0;
          background:
            radial-gradient(90% 55% at 80% 8%, rgba(138,99,210,.35), transparent 60%),
            linear-gradient(180deg, #241a55, #140f31 55%, #0f0b26);
        }
        .wprev-homebg .r {
          position: absolute; left: 14px; right: 14px; height: 9px; border-radius: 6px; background: rgba(255,255,255,.06);
        }
        .wprev-dim { position: absolute; inset: 0; background: rgba(9,6,24,.55); }

        .wsheet {
          position: absolute; left: 0; right: 0; bottom: 0; height: 64%; z-index: 4;
          border-radius: 28px 28px 0 0; overflow: hidden; box-shadow: 0 -14px 40px rgba(20,10,50,.4);
        }
        .wsheet.full { top: 22px; height: auto; }
        .wsheet-fx { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
        .wsheet-in {
          position: relative; z-index: 1; padding: 11px 18px 14px; height: 100%;
          display: flex; flex-direction: column;
        }
        .wgrabber { width: 42px; height: 5px; border-radius: 99px; background: #D9CAF1; margin: 2px auto 10px; }
        .wtitle {
          font-family: var(--serif, 'Cormorant Garamond', serif);
          font-size: 26px; font-weight: 600; line-height: 1; text-align: center; margin: 2px 0 0;
        }
        .wsub { font-size: 12px; text-align: center; font-weight: 600; margin: 7px 0 0; }
        .wchar { flex: 1 1 0; min-height: 0; display: grid; place-items: center; padding: 4px 0; overflow: hidden; }
        .wchar img {
          max-height: 100%; max-width: 78%; width: auto; height: auto; object-fit: contain;
          filter: drop-shadow(0 12px 18px rgba(60,40,120,.22));
        }
        .woffer {
          display: flex; align-items: center; justify-content: center; gap: 7px;
          font-size: 11.5px; font-weight: 700;
        }
        .woffer .hair { width: 16px; height: 1px; background: linear-gradient(90deg, transparent, #D8CDEB); }
        .woffer .hair.r { background: linear-gradient(90deg, #D8CDEB, transparent); }
        .woffer .sp { color: #C88617; font-size: 10px; }
        .wbtns { display: flex; gap: 9px; margin-top: 10px; }
        .wcta {
          flex: 1; height: 44px; border-radius: 13px; border: 1.5px solid;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-weight: 900; font-size: 14px; box-shadow: 0 8px 16px rgba(0,0,0,.13);
        }
        .wcta.pay { background: linear-gradient(120deg,#8A63D2,#5A3BBC); border-color: #F0DE95; color: #fff; }
        .wcta.no { background: linear-gradient(120deg,#F7DE88,#E7BE46); border-color: #CE9E2A; color: #5A3F12; font-size: 12.5px; font-weight: 800; }
        .wtot {
          display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;
          font-size: 12px; font-weight: 700; color: #1C1633; position: relative; width: max-content;
          background: none; border: 0; padding: 0; cursor: pointer; font-family: inherit;
        }
        .wtot .info {
          width: 15px; height: 15px; border-radius: 50%; border: 1.3px solid #7A7693; display: grid; place-items: center;
          font-size: 9px; font-style: italic; font-weight: 800; color: #7A7693;
          font-family: var(--serif, serif);
        }
        .wbreak {
          position: absolute; bottom: 22px; left: 0; width: 190px; background: #fff; border-radius: 12px;
          padding: 11px 13px; box-shadow: 0 12px 30px rgba(60,40,120,.28); color: #1C1633; text-align: left; z-index: 5;
        }
        .wbreak h5 { margin: 0 0 7px; font-size: 12px; font-weight: 800; }
        .wbreak .brow { display: flex; justify-content: space-between; font-size: 11px; color: #5B5480; margin: 3px 0; }
        .wbreak .brow.tot { color: #1C1633; font-weight: 800; border-top: 1px solid #ECE3F8; padding-top: 5px; margin-top: 5px; }

        .wreward { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .wreward::before { content: ''; position: absolute; inset: 0; background: rgba(12,8,28,.5); }
        .wreward-card {
          position: relative; background: linear-gradient(180deg,#F1E9FD,#FAF7FF 60%,#fff); border-radius: 22px;
          padding: 20px 16px 16px; text-align: center; box-shadow: 0 22px 50px rgba(30,15,50,.4); width: 100%;
        }
        .wreward-card .emoji { font-size: 32px; }
        .wreward-card .rtxt { font-size: 14px; color: #1C1633; font-weight: 700; line-height: 1.4; margin: 4px 4px 0; }
        .wreward-card .rtxt .amt { color: #C68F1E; font-weight: 900; }
        .wreward-card .rtxt .love { color: #1E9E63; font-weight: 800; }
        .wreward-card .pill {
          display: inline-flex; align-items: center; gap: 6px; margin: 14px 0 12px; padding: 8px 13px; border-radius: 999px;
          background: linear-gradient(180deg,#FBF7FF,#EBE1FB); border: 1.5px solid #8A63D2; font-size: 11px; font-weight: 800; color: #5A3BBC;
        }
        .wreward-card .rgo { font-size: 12px; font-weight: 700; color: #1C1633; }
        @media (prefers-reduced-motion: reduce) { .wsheet-fx { display: none; } }
      `}</style>
    </div>
  );
}
