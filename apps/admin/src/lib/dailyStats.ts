import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Range } from '@/lib/dateRange';

/** One per-UTC-day analytics rollup doc (written by the backend triggers). */
export interface DailyStat {
  day: string;
  dayMs: number;
  revenue?: Partial<Record<'recharge' | 'bonus' | 'consultation' | 'refund' | 'coupon' | 'adjustment', number>>;
  counts?: Partial<Record<'recharge' | 'bonus' | 'consultation' | 'refund' | 'coupon' | 'adjustment', number>>;
  consultations?: { chat?: number; voice?: number; video?: number };
}

/**
 * Read the daily rollup docs overlapping [range.start, range.end). This reads at
 * most one small doc per day (≤ ~365 for a year), no matter how many raw
 * transactions/consultations those days contain — the dashboard never touches
 * the high-volume walletTransactions / consultations collections directly.
 */
export async function fetchDailyStats(range: Range): Promise<DailyStat[]> {
  // Floor the range start to its UTC day so the day containing range.start is
  // included (its dayMs marker is that day's midnight).
  const startDayMs = Date.parse(`${new Date(range.start).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const snap = await getDocs(query(
    collection(db, 'dailyStats'),
    where('dayMs', '>=', startDayMs),
    where('dayMs', '<', range.end),
    orderBy('dayMs', 'asc'),
  ));
  return snap.docs.map((d) => d.data() as DailyStat);
}
