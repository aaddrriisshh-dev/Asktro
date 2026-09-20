'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  QueryConstraint,
  onSnapshot,
  getDocs,
  where,
  documentId,
  DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

export interface Row extends DocumentData {
  id: string;
}

/** Live Firestore collection subscription with optional query constraints. */
export function useCollection(path: string, constraints: QueryConstraint[] = []): {
  rows: Row[];
  loading: boolean;
  error: string | null;
} {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serialize constraints to a stable dependency key.
  const key = path + '|' + constraints.length;

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, path), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { rows, loading, error };
}

/** Resolve a set of document IDs in `path` to their `name` field, fetching ONLY
 *  the IDs asked for (batched documentId() 'in' queries) — so a page can show
 *  real names instead of raw UIDs without streaming the whole collection.
 *  Returns a Map<id, name> (empty until loaded); missing/nameless docs are absent. */
export function useNamesByIds(path: string, ids: string[]): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const key = path + '|' + unique.slice().sort().join(',');

  useEffect(() => {
    if (unique.length === 0) { setMap(new Map()); return; }
    let cancelled = false;
    (async () => {
      const m = new Map<string, string>();
      // documentId() 'in' supports up to 30 values per query.
      for (let i = 0; i < unique.length; i += 30) {
        const chunk = unique.slice(i, i + 30);
        try {
          const snap = await getDocs(query(collection(db, path), where(documentId(), 'in', chunk)));
          snap.forEach((d) => {
            const n = (d.data().name as string | undefined)?.trim();
            if (n) m.set(d.id, n);
          });
        } catch { /* best-effort — fall back to the UID */ }
      }
      if (!cancelled) setMap(m);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}

/** Invoke a Cloud Function callable and surface errors. */
export async function callFn<T = unknown>(name: string, data: Record<string, unknown>): Promise<T> {
  const fn = httpsCallable(functions, name);
  const res = await fn(data);
  return res.data as T;
}
