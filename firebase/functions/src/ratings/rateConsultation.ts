/**
 * rateConsultation — customer rates a completed consultation. Stores the rating
 * on the session and atomically recomputes the astrologer's rolling average and
 * review count. A consultation can only be rated once.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';

export const rateConsultation = onCall(async (req) => {
  const uid = assertAuthed(req);
  const { consultationId, rating, review } = (req.data ?? {}) as {
    consultationId?: string;
    rating?: number;
    review?: string;
  };
  if (!consultationId) badRequest('consultationId is required.');
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    badRequest('rating must be between 1 and 5.');
  }

  const ref = db.collection(Collections.consultations).doc(consultationId!);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) notFound('Consultation not found.');
    const c = snap.data()!;
    if (c.customerId !== uid) failedPrecondition('Only the customer can rate this consultation.');
    if (c.status !== 'completed' && c.status !== 'expired') {
      failedPrecondition('Only completed consultations can be rated.');
    }
    if (c.rating != null) failedPrecondition('This consultation has already been rated.');

    const astrologerRef = db.collection(Collections.astrologers).doc(c.astrologerId);
    const astroSnap = await tx.get(astrologerRef);
    const astro = astroSnap.data() ?? {};
    const prevCount: number = astro.totalReviews ?? 0;
    const prevAvg: number = astro.rating ?? 0;
    const newCount = prevCount + 1;
    const newAvg = (prevAvg * prevCount + rating!) / newCount;

    tx.update(ref, {
      rating,
      review: review ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      astrologerRef,
      {
        rating: Math.round(newAvg * 100) / 100,
        totalReviews: newCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return { ok: true };
});
