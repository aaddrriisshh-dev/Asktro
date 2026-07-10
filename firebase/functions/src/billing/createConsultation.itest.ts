/**
 * Integration test for the per-customer concurrency lock (P1-4) against the
 * Firestore emulator. Proves the phantom-insert race is closed: two concurrent
 * "create a session" transactions using the lock pattern from createConsultation
 * yield exactly ONE open session, never two.
 */
import { db, FieldValue } from '../common/admin';

const OPEN = ['waiting', 'active', 'paused'];

// Mirrors createConsultation's guard: read the lock, reject if an open session
// exists, else create the session and write the lock (so a concurrent caller's
// lock read is invalidated and it retries into the rejection).
async function attemptCreateWithLock(uid: string): Promise<string> {
  const consultationRef = db.collection('consultations').doc();
  const lockRef = db.collection('consultationLocks').doc(uid);
  await db.runTransaction(async (tx) => {
    await tx.get(lockRef); // enroll the lock in the conflict set
    const open = await tx.get(
      db.collection('consultations').where('customerId', '==', uid).where('status', 'in', OPEN).limit(1),
    );
    if (!open.empty) throw new Error('ALREADY_OPEN');
    tx.set(consultationRef, {
      customerId: uid, astrologerId: 'a1', type: 'chat', status: 'waiting',
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(lockRef, { lastConsultationId: consultationRef.id, updatedAt: FieldValue.serverTimestamp() });
  });
  return consultationRef.id;
}

describe('createConsultation concurrency lock (emulator)', () => {
  it('two concurrent creates yield exactly ONE open session', async () => {
    const uid = 'u_lock_1';
    await db.collection('users').doc(uid).set({ walletBalance: 5000 });

    const results = await Promise.allSettled([
      attemptCreateWithLock(uid),
      attemptCreateWithLock(uid),
    ]);

    const sessions = await db.collection('consultations').where('customerId', '==', uid).get();
    expect(sessions.size).toBe(1); // the crux — never two paid sessions for one wallet
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(results.filter((r) => r.status === 'rejected').length).toBe(1);
  });
});
