/**
 * Wallet ledger helpers. Every balance mutation writes an immutable
 * walletTransactions entry. Callers pass an existing Firestore transaction so
 * the balance change and the ledger row commit atomically.
 */
import { Transaction, DocumentReference } from 'firebase-admin/firestore';
import { db, FieldValue, Timestamp } from '../common/admin';
import { Collections } from '../common/collections';
import { TxnKind } from '../common/types';

export interface LedgerEntry {
  userId: string;
  kind: TxnKind;
  amount: number; // signed paise: credit +, debit −
  balanceBefore: number;
  balanceAfter: number;
  refId?: string;
  note?: string;
}

/** Append an immutable ledger row inside an existing transaction. */
export function writeLedger(tx: Transaction, entry: LedgerEntry): DocumentReference {
  const ref = db.collection(Collections.walletTransactions).doc();
  tx.set(ref, {
    ...entry,
    refId: entry.refId ?? null,
    note: entry.note ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref;
}

/** Convenience: a Firestore server Timestamp for "now". */
export function nowTs(): Timestamp {
  return Timestamp.now();
}
