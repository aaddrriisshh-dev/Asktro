/**
 * Integration tests for data-retention purges against the Firestore emulator.
 * These are DESTRUCTIVE paths, so the tests prove the safety boundaries:
 *  - chat CONTENT of old ENDED consultations is stripped, but the consultation
 *    record (billing skeleton) is KEPT;
 *  - recent / still-active consultations are never touched;
 *  - old notifications/alerts are deleted, recent ones kept;
 *  - the chat-purge watermark advances so runs don't re-scan purged docs.
 */
import { db, Timestamp } from '../common/admin';
import { purgeOldChatContent, reapCollectionByAge } from './retention';

const DAY_MS = 86_400_000;

async function seedConsultation(id: string, endedDaysAgo: number | null, status: string, nowMs: number, withMessages = true) {
  await db.collection('consultations').doc(id).set({
    customerId: 'u1', astrologerId: 'a1', type: 'chat', status,
    totalCharged: 15000, billedSeconds: 100, // billing skeleton — must survive
    endTime: endedDaysAgo == null ? null : Timestamp.fromMillis(nowMs - endedDaysAgo * DAY_MS),
    createdAt: Timestamp.fromMillis(nowMs - (endedDaysAgo ?? 0) * DAY_MS - 3600_000),
  });
  if (withMessages) {
    await db.collection('consultations').doc(id).collection('messages').doc('m1').set({ text: 'hi', senderId: 'u1' });
    await db.collection('consultations').doc(id).collection('messages').doc('m2').set({ text: 'hello', senderId: 'a1' });
  }
}

const msgCount = async (id: string) => (await db.collection('consultations').doc(id).collection('messages').get()).size;

// The purge watermark persists in the emulator across tests; reset it so each
// test starts from a clean slate (in production it only ever moves forward).
const resetWatermark = () => db.collection('ops').doc('retentionState').delete().catch(() => {});

describe('retention: purgeOldChatContent (emulator)', () => {
  it('strips chat content from OLD ended chats but keeps the consultation + billing skeleton', async () => {
    const now = Date.parse('2026-06-01T00:00:00.000Z');
    await resetWatermark();
    await seedConsultation('old_done', 100, 'completed', now); // 100 days ago, ended
    expect(await msgCount('old_done')).toBe(2);

    const res = await purgeOldChatContent(90, now); // keep 90 days
    expect(res.purged).toBe(1);
    expect(await msgCount('old_done')).toBe(0); // transcript stripped

    const c = (await db.collection('consultations').doc('old_done').get()).data()!;
    expect(c.chatPurged).toBe(true);
    expect(c.totalCharged).toBe(15000); // billing record intact
    expect(c.billedSeconds).toBe(100);
    expect(c.customerId).toBe('u1'); // consultation itself KEPT
  });

  it('never touches a RECENT ended chat or a still-active one', async () => {
    const now = Date.parse('2026-06-02T00:00:00.000Z');
    await seedConsultation('recent_done', 10, 'completed', now); // only 10 days old
    await seedConsultation('active_old', null, 'active', now);   // no endTime (live)

    await purgeOldChatContent(90, now);

    expect(await msgCount('recent_done')).toBe(2); // within window → kept
    expect(await msgCount('active_old')).toBe(2);  // active → never purged
    expect((await db.collection('consultations').doc('recent_done').get()).data()!.chatPurged).toBeUndefined();
  });

  it('advances the watermark so a second run does no redundant work', async () => {
    const now = Date.parse('2026-06-03T00:00:00.000Z');
    await resetWatermark();
    await seedConsultation('old_a', 120, 'completed', now);
    await seedConsultation('old_b', 110, 'expired', now);

    const first = await purgeOldChatContent(90, now);
    expect(first.purged).toBe(2);
    const second = await purgeOldChatContent(90, now); // watermark now past both
    expect(second.processed).toBe(0); // nothing re-scanned
    expect(second.purged).toBe(0);
  });
});

describe('retention: reapCollectionByAge (emulator)', () => {
  it('deletes docs older than the cutoff and keeps newer ones', async () => {
    const now = Date.parse('2026-07-01T00:00:00.000Z');
    await db.collection('notifications').doc('n_old').set({ userId: 'u1', title: 'old', createdAt: Timestamp.fromMillis(now - 40 * DAY_MS) });
    await db.collection('notifications').doc('n_new').set({ userId: 'u1', title: 'new', createdAt: Timestamp.fromMillis(now - 5 * DAY_MS) });

    const removed = await reapCollectionByAge('notifications', now - 30 * DAY_MS, 'notifications');
    expect(removed).toBe(1);
    expect((await db.collection('notifications').doc('n_old').get()).exists).toBe(false); // 40d → gone
    expect((await db.collection('notifications').doc('n_new').get()).exists).toBe(true);  // 5d → kept
  });
});
