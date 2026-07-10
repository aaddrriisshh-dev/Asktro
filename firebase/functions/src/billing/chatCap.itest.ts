/**
 * Integration tests for the concurrent-chat fairness cap against the Firestore
 * emulator. Verifies a human astrologer is refused a new chat once they hold
 * `cap` live (active/paused) chats — and that calls, terminal chats, and other
 * astrologers' chats never count toward it.
 *
 * Run via: npm run test:integration (wraps this in `firebase emulators:exec`).
 */
import { db, FieldValue } from '../common/admin';
import { assertUnderChatCap, countLiveChats } from './chatCap';

async function seedChat(id: string, astrologerId: string, status: string, type = 'chat') {
  await db.collection('consultations').doc(id).set({
    astrologerId, customerId: `cust_${id}`, type, status,
    createdAt: FieldValue.serverTimestamp(),
  });
}

describe('chatCap (emulator)', () => {
  it('counts only live chats for the given astrologer', async () => {
    const a = 'a_cap_1';
    await seedChat('cap1_a', a, 'active');
    await seedChat('cap1_b', a, 'paused');
    await seedChat('cap1_c', a, 'completed'); // terminal — excluded
    await seedChat('cap1_d', a, 'active', 'voice'); // call — excluded
    await seedChat('cap1_e', 'other', 'active'); // other astrologer — excluded

    const n = await db.runTransaction((tx) => countLiveChats(tx, a, 5));
    expect(n).toBe(2);
  });

  it('refuses a new chat at the cap and allows it under the cap', async () => {
    const a = 'a_cap_2';
    await seedChat('cap2_a', a, 'active');
    await seedChat('cap2_b', a, 'active');
    await seedChat('cap2_c', a, 'paused');

    // cap = 3, already 3 live → refuse.
    await expect(db.runTransaction((tx) => assertUnderChatCap(tx, a, 3))).rejects.toThrow(
      /handling several chats/i,
    );

    // cap = 5, only 3 live → allowed (resolves).
    await expect(db.runTransaction((tx) => assertUnderChatCap(tx, a, 5))).resolves.toBeUndefined();
  });

  it('treats cap of 0 (or missing) as disabled', async () => {
    const a = 'a_cap_3';
    for (let i = 0; i < 8; i++) await seedChat(`cap3_${i}`, a, 'active');
    await expect(db.runTransaction((tx) => assertUnderChatCap(tx, a, 0))).resolves.toBeUndefined();
  });
});
