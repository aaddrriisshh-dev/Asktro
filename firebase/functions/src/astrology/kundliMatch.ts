/**
 * purchaseKundliMatch — the PAID (₹49) Ashtakoota Guna Milan report.
 *
 * Money-critical, so the client is never trusted:
 *  - The price is fixed here (PRICE_PAISE), never sent by the app.
 *  - The report is fetched from ProKerala SERVER-SIDE. If that fetch fails we do
 *    NOT charge — a customer is never billed for a report they didn't get.
 *  - The debit + ledger row + cached result commit in ONE Firestore transaction,
 *    with a fresh balance re-check inside it (no charge on insufficient funds).
 *  - Idempotent: the exact same pair of births is cached under
 *    users/{uid}/astro/match_<hash>; a re-open or a double-tap returns the saved
 *    report and NEVER double-charges.
 */
import { onCall } from 'firebase-functions/v2/https';
import { createHash } from 'crypto';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, HttpsError } from '../common/errors';
import { enforceRateLimit } from '../common/rateLimit';
import { writeLedger } from '../wallet/ledger';
import { PROKERALA_CLIENT_ID, PROKERALA_CLIENT_SECRET, prokeralaGet } from '../prokerala/prokerala';

export const KUNDLI_MATCH_PRICE_PAISE = 4900; // ₹49

interface MatchInput {
  girlDob?: string;
  girlCoordinates?: string;
  boyDob?: string;
  boyCoordinates?: string;
}

export const purchaseKundliMatch = onCall(
  { secrets: [PROKERALA_CLIENT_ID, PROKERALA_CLIENT_SECRET] },
  async (req) => {
    const uid = assertAuthed(req);
    await enforceRateLimit('purchaseKundliMatch', uid);

    const { girlDob, girlCoordinates, boyDob, boyCoordinates } = (req.data ?? {}) as MatchInput;
    if (!girlDob || !girlCoordinates || !boyDob || !boyCoordinates) {
      badRequest('Both partners’ birth details are required.');
    }

    const key = createHash('sha1')
      .update([girlDob, girlCoordinates, boyDob, boyCoordinates].join('|'))
      .digest('hex')
      .slice(0, 24);
    const cacheRef = db.collection(Collections.users).doc(uid).collection('astro').doc(`match_${key}`);

    // Already bought this exact match → hand it back free (persistence + natural
    // idempotency against retries/double-taps).
    const cached = await cacheRef.get();
    if (cached.exists && cached.data()?.data) {
      return { data: cached.data()!.data, charged: false, alreadyPurchased: true, pricePaise: KUNDLI_MATCH_PRICE_PAISE };
    }

    // Cheap balance pre-check so a broke wallet doesn't waste a paid ProKerala call.
    const preUser = (await db.collection(Collections.users).doc(uid).get()).data();
    const preSpendable = ((preUser?.walletBalance as number) ?? 0) + ((preUser?.bonusBalance as number) ?? 0);
    if (preSpendable < KUNDLI_MATCH_PRICE_PAISE) {
      throw new HttpsError('failed-precondition', 'INSUFFICIENT_BALANCE', {
        pricePaise: KUNDLI_MATCH_PRICE_PAISE,
        spendable: preSpendable,
      });
    }

    // Fetch the FULL report from ProKerala. No charge if this fails.
    const data = await prokeralaGet(
      'v2/astrology/kundli-matching',
      {
        girl_dob: girlDob,
        girl_coordinates: girlCoordinates,
        boy_dob: boyDob,
        boy_coordinates: boyCoordinates,
        ayanamsa: 1,
        la: 'en',
      },
      PROKERALA_CLIENT_ID.value(),
      PROKERALA_CLIENT_SECRET.value(),
    );
    if (!data) {
      failedPrecondition('The astrology service is temporarily unavailable. You have not been charged.');
    }

    const result = await applyMatchCharge(uid, key, data as Record<string, unknown>);
    logger.info('kundliMatch purchased', { uid, key, charged: result.charged });
    return { ...result, pricePaise: KUNDLI_MATCH_PRICE_PAISE };
  },
);

/**
 * The money-critical core, extracted so it can be tested against the emulator
 * without a live ProKerala call: atomically re-check balance, debit (bonus
 * first), append the ledger row, and cache the report. Idempotent — if the
 * report is already cached (a racing purchase), it returns it and charges
 * nothing.
 */
export async function applyMatchCharge(
  uid: string,
  key: string,
  data: Record<string, unknown>,
): Promise<{ data: unknown; charged: boolean; alreadyPurchased: boolean; newBalancePaise?: number }> {
  const userRef = db.collection(Collections.users).doc(uid);
  const cacheRef = userRef.collection('astro').doc(`match_${key}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const c = await tx.get(cacheRef); // all reads before any write
    if (c.exists && c.data()?.data) {
      return { data: c.data()!.data, charged: false, alreadyPurchased: true };
    }
    const u = snap.data() ?? {};
    const wallet = (u.walletBalance as number) ?? 0;
    const bonus = (u.bonusBalance as number) ?? 0;
    const spendable = wallet + bonus;
    if (spendable < KUNDLI_MATCH_PRICE_PAISE) {
      throw new HttpsError('failed-precondition', 'INSUFFICIENT_BALANCE', {
        pricePaise: KUNDLI_MATCH_PRICE_PAISE,
        spendable,
      });
    }
    const bonusUsed = Math.min(bonus, KUNDLI_MATCH_PRICE_PAISE);
    const walletUsed = KUNDLI_MATCH_PRICE_PAISE - bonusUsed;
    tx.update(userRef, {
      walletBalance: FieldValue.increment(-walletUsed),
      bonusBalance: FieldValue.increment(-bonusUsed),
      totalSpent: FieldValue.increment(KUNDLI_MATCH_PRICE_PAISE),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeLedger(tx, {
      userId: uid,
      kind: 'kundli_match',
      amount: -KUNDLI_MATCH_PRICE_PAISE,
      balanceBefore: spendable,
      balanceAfter: spendable - KUNDLI_MATCH_PRICE_PAISE,
      refId: key,
      note: 'Kundali Match report',
    });
    tx.set(cacheRef, {
      data,
      key,
      pricePaise: KUNDLI_MATCH_PRICE_PAISE,
      purchasedAt: FieldValue.serverTimestamp(),
    });
    return { data, charged: true, alreadyPurchased: false, newBalancePaise: spendable - KUNDLI_MATCH_PRICE_PAISE };
  });
}
