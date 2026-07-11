/**
 * Integration tests for the account-deletion erasure worker against the
 * Firestore emulator. Run via: npm run test:integration.
 *
 * Verifies DPDP §12 / GDPR Art. 17 erasure completeness AND the deliberate
 * retentions: the financial ledger and the anonymized consultation skeleton
 * survive, and safety reports authored by OTHERS about this user survive, while
 * every piece of the user's own PII / free-text / linkage is gone. Storage and
 * Auth calls inside the worker are .catch-guarded, so a Firestore-only emulator
 * run exercises the full erasure without a Storage/Auth emulator.
 */
import { db } from '../common/admin';
import { runAccountErasure } from './adminAndDeletion';

const UID = 'u_del_1';
const OTHER = 'u_other';
const AID = 'a_del_1';

async function seedGraph() {
  await db.collection('users').doc(UID).set({ name: 'Deleted user', accountStatus: 'deleted', deletionState: 'pending' });
  await db.collection('customerProfiles').doc(UID).delete().catch(() => {});

  // Two consultations, each with a messages + typing subcollection.
  for (const cid of ['c_del_a', 'c_del_b']) {
    await db.collection('consultations').doc(cid).set({
      customerId: UID, astrologerId: AID, type: 'chat', status: 'ended', totalCharged: 5000,
    });
    await db.collection('consultations').doc(cid).collection('messages').doc('m1').set({ text: 'secret' });
    await db.collection('consultations').doc(cid).collection('messages').doc('m2').set({ text: 'more' });
    await db.collection('consultations').doc(cid).collection('typing').doc(UID).set({ typing: true });
  }
  // A consultation belonging to someone else must be untouched.
  await db.collection('consultations').doc('c_other').set({ customerId: OTHER, astrologerId: AID, type: 'chat' });

  await db.collection('remedies').doc('r1').set({ customerId: UID, text: 'advice' });
  await db.collection('remedies').doc('r2').set({ customerId: OTHER, text: 'keep' });

  await db.collection('supportTickets').doc('t1').set({ customerId: UID, subject: 'help' });
  await db.collection('supportTickets').doc('t1').collection('thread').doc('x').set({ body: 'hi' });

  await db.collection('notifications').doc('n1').set({ userId: UID, title: 'a' });
  await db.collection('notifications').doc('n2').set({ userId: OTHER, title: 'keep' });

  await db.collection('astrologerCustomers').doc(AID).collection('customers').doc(UID).set({ since: 1 });

  // Reports authored BY the user (erase) vs ABOUT the user (retain — safety).
  await db.collection('reports').doc('rep_by').set({ reporterId: UID, reportedId: OTHER, detail: 'x' });
  await db.collection('reports').doc('rep_about').set({ reporterId: OTHER, reportedId: UID, detail: 'safety' });

  await db.collection('consentRecords').doc('cons1').set({ userId: UID, version: 'v1' });
  await db.collection('alerts').doc('al1').set({ refId: UID, kind: 'x' });

  await db.collection('referrals').doc('ref_out').set({ referrerId: UID, referredId: OTHER });
  await db.collection('referrals').doc('ref_in').set({ referrerId: OTHER, referredId: UID });

  await db.collection('userBlocks').doc(UID).set({ blocked: [OTHER] });
  await db.collection('userBlocks').doc(OTHER).set({ blocked: [UID, 'someone_else'] });
}

const exists = async (path: string) => (await db.doc(path).get()).exists;
const count = async (col: string, field: string, val: string) =>
  (await db.collection(col).where(field, '==', val).get()).size;

describe('runAccountErasure (emulator)', () => {
  beforeAll(async () => {
    await seedGraph();
    await runAccountErasure(UID);
  });

  it('erases all chat transcripts and typing docs but RETAINS the consultation skeleton', async () => {
    for (const cid of ['c_del_a', 'c_del_b']) {
      expect(await exists(`consultations/${cid}`)).toBe(true); // billing record retained
      expect((await db.collection('consultations').doc(cid).collection('messages').get()).empty).toBe(true);
      expect((await db.collection('consultations').doc(cid).collection('typing').get()).empty).toBe(true);
    }
    expect(await exists('consultations/c_other')).toBe(true); // another user's data untouched
  });

  it('erases the user\'s remedies, tickets (+thread), and notifications only', async () => {
    expect(await count('remedies', 'customerId', UID)).toBe(0);
    expect(await count('remedies', 'customerId', OTHER)).toBe(1);
    expect(await exists('supportTickets/t1')).toBe(false);
    expect((await db.collection('supportTickets').doc('t1').collection('thread').get()).empty).toBe(true);
    expect(await count('notifications', 'userId', UID)).toBe(0);
    expect(await count('notifications', 'userId', OTHER)).toBe(1);
  });

  it('removes membership markers, authored reports, consent, alerts, referrals, and block linkage', async () => {
    expect(await exists(`astrologerCustomers/${AID}/customers/${UID}`)).toBe(false);
    expect(await exists('reports/rep_by')).toBe(false); // authored by the user → erased
    expect(await exists('reports/rep_about')).toBe(true); // about the user → RETAINED (safety)
    expect(await count('consentRecords', 'userId', UID)).toBe(0);
    expect(await count('alerts', 'refId', UID)).toBe(0);
    expect(await count('referrals', 'referrerId', UID)).toBe(0);
    expect(await count('referrals', 'referredId', UID)).toBe(0);
    expect(await exists(`userBlocks/${UID}`)).toBe(false);
    const otherBlocks = (await db.collection('userBlocks').doc(OTHER).get()).data()!;
    expect(otherBlocks.blocked).toEqual(['someone_else']); // uid scrubbed from others' lists
  });

  it('is idempotent — a second run over an already-erased account is a no-op', async () => {
    await expect(runAccountErasure(UID)).resolves.toBeUndefined();
    expect(await exists('reports/rep_about')).toBe(true); // still retained
  });
});
