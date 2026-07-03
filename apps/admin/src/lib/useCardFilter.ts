'use client';

import { useEffect, useState } from 'react';
import { Preset, Range, resolveRange } from './dateRange';

interface Custom {
  start?: string;
  end?: string;
}

/**
 * Per-card date filter with the selection persisted in localStorage, so each
 * card remembers the admin's preference across visits.
 */
export function useCardFilter(cardKey: string, defaultPreset: Preset = 'last30') {
  const [preset, setPresetState] = useState<Preset>(defaultPreset);
  const [custom, setCustomState] = useState<Custom>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem('cardfilter:' + cardKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { preset?: Preset; custom?: Custom };
        if (parsed.preset) setPresetState(parsed.preset);
        if (parsed.custom) setCustomState(parsed.custom);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

  function persist(p: Preset, c: Custom) {
    try {
      localStorage.setItem('cardfilter:' + cardKey, JSON.stringify({ preset: p, custom: c }));
    } catch {
      /* ignore */
    }
  }

  function setPreset(p: Preset) {
    setPresetState(p);
    persist(p, custom);
  }
  function setCustom(c: Custom) {
    setCustomState(c);
    persist(preset, c);
  }

  const range: Range = resolveRange(preset, custom);
  return { preset, setPreset, custom, setCustom, range };
}
