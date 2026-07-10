/**
 * Concurrent-chat fairness cap for human astrologers. A reader may hold only so
 * many LIVE (active/paused) chats at once; beyond that a new customer would sit
 * in a queue while the meter never starts, so we refuse the request up front.
 *
 * Extracted from createConsultation so the threshold + query are unit-testable
 * against the emulator. AI personas are never capped (the caller gates that).
 */
import type { Transaction } from 'firebase-admin/firestore';
import { db } from '../common/admin';
import { Collections } from '../common/collections';
import { failedPrecondition } from '../common/errors';

/**
 * Count this astrologer's currently-running chats (active + paused). Reads at
 * most `cap + 5` rows — enough to decide the threshold without scanning a large
 * history. Must be called inside a transaction so the count is consistent with
 * the create that follows.
 */
export async function countLiveChats(
  tx: Transaction,
  astrologerId: string,
  cap: number,
): Promise<number> {
  const snap = await tx.get(
    db
      .collection(Collections.consultations)
      .where('astrologerId', '==', astrologerId)
      .where('status', 'in', ['active', 'paused'])
      .limit(cap + 5),
  );
  return snap.docs.filter((d) => d.data().type === 'chat').length;
}

/**
 * Throw a friendly failed-precondition if the astrologer is already at/over the
 * cap. A cap of 0 (or missing) disables the limit entirely.
 */
export async function assertUnderChatCap(
  tx: Transaction,
  astrologerId: string,
  cap: number,
): Promise<void> {
  if (!cap || cap <= 0) return;
  const live = await countLiveChats(tx, astrologerId, cap);
  if (live >= cap) {
    failedPrecondition(
      'This astrologer is handling several chats right now. '
        + 'Please try again shortly or choose another astrologer.',
    );
  }
}
