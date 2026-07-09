'use client';

import { useEffect } from 'react';

/**
 * A subtle, professional "tick" on every click across the console. The sound is
 * synthesised with the Web Audio API (a short high-passed noise burst with a
 * fast decay) so there's no asset to ship and nothing to load — it stays crisp
 * and works within the portal's CSP. Mounted once at the root so it covers the
 * whole app, including the login screen.
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
      const dur = 0.028;

      const src = ac.createBufferSource();
      src.buffer = noise;

      // High-pass keeps only the crisp "tick" transient, not a dull thud.
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1600;

      // A gentle band-pass gives it a defined, clicky character.
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 0.7;

      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.001); // fast, quiet attack
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur); // fast decay

      src.connect(hp).connect(bp).connect(gain).connect(ac.destination);
      src.start(t);
      src.stop(t + dur);
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
