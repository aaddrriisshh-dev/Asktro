/**
 * Integration tests for runBroadcast (the resumable per-user fan-out core, #49)
 * against the Firestore emulator. The topic path (all_users / astrologers) calls
 * FCM and isn't covered here; the per-user paths are pure Firestore (the
 * onNotificationCreated trigger does the actual push).
 *
 * The integration suite runs in PARALLEL workers over ONE shared emulator, so
 * these tests never clear shared collections — they assert only about their own
 * uniquely-named users/titles.
 */
import { db, FieldValue } from '../common/admin';
import { runBroadcast } from './sender';

const notifCountFor = async (title: string) =>
  (await db.collection('notifications').where('title', '==', title).get()).size;
const notifFor = async (uid: string, title: string) =>
  (await db.collection('notifications').where('userId', '==', uid).where('title', '==', title).get()).size;

describe('runBroadcast (emulator)', () => {
  it('paged segment writes exactly one notification per matching user, skips deleted, completes', async () => {
    const title = 'bc_paged_1';
    const mine = ['u_bcp_a', 'u_bcp_b', 'u_bcp_c'];
    for (const u of mine) await db.collection('users').doc(u).set({
      name: u, totalRecharge: 0, accountStatus: 'active', createdAt: FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc('u_bcp_del').set({
      name: 'del', totalRecharge: 0, accountStatus: 'deleted', createdAt: FieldValue.serverTimestamp(),
    });

    // pageSize 2 forces several cursor hops — a per-user row must still be written
    // exactly once (no duplication across page boundaries).
    const ref = db.collection('broadcasts').doc();
    const r = await runBroadcast(ref, { title, body: 'hi', segment: 'unpaid_users' }, { pageSize: 2 });
    expect(r.complete).toBe(true);
    expect(r.channel).toBe('per_user');
    for (const u of mine) expect(await notifFor(u, title)).toBe(1);
    expect(await notifFor('u_bcp_del', title)).toBe(0); // deleted account skipped
  });

  it('list segment resumes from the checkpoint mid-way without duplicating', async () => {
    const title = 'bc_list_resume';
    const uids = Array.from({ length: 500 }, (_, i) => `lu_${i}`);
    const ref = db.collection('broadcasts').doc();

    // First run: a clock that trips the soft deadline right after the first
    // 400-doc batch, leaving a checkpoint at 400.
    let t = 0;
    const r1 = await runBroadcast(ref, { title, body: 'hi', segment: 'list', uids },
      { softDeadlineMs: 0, now: () => (t++ === 0 ? 0 : 1000) });
    expect(r1.complete).toBe(false);
    expect(r1.delivered).toBe(400);
    expect(await notifCountFor(title)).toBe(400);
    expect((await ref.get()).data()?.sentCount).toBe(400);

    // Resume: writes the remaining 100 and completes — total stays 500, no dup.
    const r2 = await runBroadcast(ref, { title, body: 'hi', segment: 'list', uids });
    expect(r2.complete).toBe(true);
    expect(r2.delivered).toBe(500);
    expect(await notifCountFor(title)).toBe(500);
  });

  it('list re-run after completion is a no-op (checkpoint at end)', async () => {
    const title = 'bc_list_done';
    const uids = ['x1', 'x2', 'x3'];
    const ref = db.collection('broadcasts').doc();
    const r1 = await runBroadcast(ref, { title, body: 'hi', segment: 'list', uids });
    expect(r1.delivered).toBe(3);
    const r2 = await runBroadcast(ref, { title, body: 'hi', segment: 'list', uids });
    expect(r2.delivered).toBe(3);
    expect(await notifCountFor(title)).toBe(3); // still 3 — no duplicates
  });
});
