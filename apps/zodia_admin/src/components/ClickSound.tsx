'use client';

import { useEffect } from 'react';

/**
 * A subtle, professional "mouse click" on every click across the console. The
 * sound is synthesised with the Web Audio API (a short high-passed noise-burst
 * transient over a tiny low-frequency body thump — the tactile mouse feel) so
 * there's no asset to ship and nothing to load, and it works within the portal's
 * CSP. Mounted once at the root so it covers the whole app, including login.
 */
export default function ClickSound() {
  useEffect(() => {
    // Respect users who ask the OS to reduce non-essential motion/effects.
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let ctx: AudioContext | null = null;
    let noise: AudioBuffer | null = null;
    let last = 0;

    const AudioCtor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    function ensure() {
      if (!ctx) {
        ctx = new AudioCtor!();
        // ~40ms of white noise, generated once and reused for every tick.
        const frames = Math.floor(ctx.sampleRate * 0.04);
        noise = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }

    function tick() {
      const ac = ensure();
      if (!ac || !noise) return;
      const t = ac.currentTime;

      // Crisp transient — a short high-passed noise burst (the audible "click").
      const src = ac.createBufferSource();
      src.buffer = noise;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1300;
      const g1 = ac.createGain();
      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.exponentialRampToValueAtTime(0.07, t + 0.0008); // fast, quiet attack
      g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.02); // fast decay
      src.connect(hp).connect(g1).connect(ac.destination);
      src.start(t);
      src.stop(t + 0.025);

      // A tiny low-frequency body thump under the transient — the tactile,
      // "real mouse" feel rather than a thin beep.
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 160;
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.05, t + 0.002);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      osc.connect(g2).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return; // primary / touch only — never on right-click
      const now = performance.now();
      if (now - last < 45) return; // throttle bursts of rapid clicks
      last = now;
      try {
        tick();
      } catch {
        /* audio unavailable — ignore */
      }
    }

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      void ctx?.close();
    };
  }, []);

  return null;
}
