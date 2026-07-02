'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  QueryConstraint,
  onSnapshot,
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

/** Invoke a Cloud Function callable and surface errors. */
export async function callFn<T = unknown>(name: string, data: Record<string, unknown>): Promise<T> {
  const fn = httpsCallable(functions, name);
  const res = await fn(data);
  return res.data as T;
}
