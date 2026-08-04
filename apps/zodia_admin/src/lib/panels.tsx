'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

/**
 * Dashboard panel workspace: tracks which detail panels are open (max 3) and
 * their left→right order, so cards can open into a tiling comparison workspace
 * instead of a single drawer.
 */
interface PanelCtx {
  open: string[]; // ordered ids, left → right
  openPanel: (id: string) => void;
  closePanel: (id: string) => void;
  move: (id: string, dir: 'left' | 'right') => void;
}

const Ctx = createContext<PanelCtx | null>(null);

export function usePanels(): PanelCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePanels must be used within <PanelProvider>');
  return c;
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string[]>([]);

  const openPanel = useCallback((id: string) => {
    setOpen((o) => (o.includes(id) ? o : [...o, id].slice(-3))); // cap at 3, drop the oldest
  }, []);

  const closePanel = useCallback((id: string) => {
    setOpen((o) => o.filter((x) => x !== id));
  }, []);

  const move = useCallback((id: string, dir: 'left' | 'right') => {
    setOpen((o) => {
      const i = o.indexOf(id);
      if (i < 0) return o;
      const j = dir === 'left' ? i - 1 : i + 1;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ open, openPanel, closePanel, move }}>{children}</Ctx.Provider>;
}
