/**
 * Firestore SECURITY-RULES tests — run against the emulator with the real
 * firestore.rules loaded. These lock the money/PII authorization boundary so a
 * rules regression (e.g. the lower-tier-admin coupon-mint escalation found in
 * the production audit) can never ship again. Run via npm run test:integration.
 */
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// Distinct project id so this suite's clearFirestore() only wipes its OWN
// namespace and never races the admin-SDK integration tests (project demo-asktro).
const PROJECT = 'asktro-rules-test';
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');

let env: RulesTestEnvironment;

const superAdmin = () => env.authenticatedContext('super1', { role: 'admin', adminRole: 'super' }).firestore();
const opsAdmin = () => env.authenticatedContext('ops1', { role: 'admin', adminRole: 'ops' }).firestore();
const astroAdmin = () => env.authenticatedContext('astroadm1', { role: 'admin', adminRole: 'astrology' }).firestore();
const customer = (uid = 'cust1') => env.authenticatedContext(uid, {}).firestore();
const astrologer = (uid = 'astro1') => env.authenticatedContext(uid, { role: 'astrologer', approved: true }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host, port: Number(port) },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/cust1'), { name: 'A', phone: '+911', walletBalance: 500, bonusBalance: 0, accountStatus: 'active' });
    await setDoc(doc(db, 'astrologers/astro1'), { name: 'Astro', verified: true, ratePerMinutePaise: 2500, accountStatus: 'approved', available: true });
    await setDoc(doc(db, 'astrologers/astro1/private/financials'), { earnings: 1000, pendingPayout: 1000 });
    await setDoc(doc(db, 'coupons/c1'), { active: true, type: 'amount', bonus: 100 });
    await setDoc(doc(db, 'rechargePlans/p1'), { active: true, amount: 10000, walletCredit: 10000 });
    await setDoc(doc(db, 'walletTransactions/t1'), { userId: 'cust1', kind: 'recharge', amount: 500 });
  });
});

describe('coupons / rechargePlans — money-minting catalogs (B1)', () => {
  it('super admin CAN write a coupon', async () => {
    await assertSucceeds(setDoc(doc(superAdmin(), 'coupons/c2'), { active: true, type: 'amount', bonus: 999900 }));
  });
  it('ops admin CANNOT write a coupon (mint path closed)', async () => {
    await assertFails(setDoc(doc(opsAdmin(), 'coupons/c3'), { active: true, type: 'amount', bonus: 999900 }));
  });
  it('astrology admin CANNOT write a coupon', async () => {
    await assertFails(setDoc(doc(astroAdmin(), 'coupons/c4'), { active: true, type: 'amount', bonus: 999900 }));
  });
  it('a plain customer CANNOT write a coupon or a plan', async () => {
    await assertFails(setDoc(doc(customer(), 'coupons/c5'), { active: true, bonus: 100 }));
    await assertFails(setDoc(doc(customer(), 'rechargePlans/p2'), { amount: 1 }));
  });
  it('only super can write a recharge plan', async () => {
    await assertSucceeds(setDoc(doc(superAdmin(), 'rechargePlans/p3'), { active: true, amount: 10000, walletCredit: 10000 }));
    await assertFails(setDoc(doc(opsAdmin(), 'rechargePlans/p4'), { active: true, amount: 10000 }));
  });
});

describe('astrologers update — approval / rate / money fields', () => {
  it('super CAN change verified / rate', async () => {
    await assertSucceeds(updateDoc(doc(superAdmin(), 'astrologers/astro1'), { verified: false, ratePerMinutePaise: 9999 }));
  });
  // NB: values below genuinely differ from the seed (verified:true,
  // rate:2500, accountStatus:'approved') — a no-op change is legitimately
  // allowed because diff().affectedKeys() would be empty.
  it('ops admin CANNOT change verified / rate / status', async () => {
    await assertFails(updateDoc(doc(opsAdmin(), 'astrologers/astro1'), { verified: false }));
    await assertFails(updateDoc(doc(opsAdmin(), 'astrologers/astro1'), { ratePerMinutePaise: 1 }));
    await assertFails(updateDoc(doc(opsAdmin(), 'astrologers/astro1'), { accountStatus: 'blocked' }));
  });
  it('ops admin CAN edit a non-privileged field (e.g. featured)', async () => {
    await assertSucceeds(updateDoc(doc(opsAdmin(), 'astrologers/astro1'), { featured: true }));
  });
  it('the astrologer CANNOT self-approve or self-set rate', async () => {
    await assertFails(updateDoc(doc(astrologer(), 'astrologers/astro1'), { verified: false }));
    await assertFails(updateDoc(doc(astrologer(), 'astrologers/astro1'), { ratePerMinutePaise: 1 }));
  });
});

describe('customer PII + balances (M3)', () => {
  it('the user reads their own profile', async () => {
    await assertSucceeds(getDoc(doc(customer(), 'users/cust1')));
  });
  it('super and ops admins read a user profile', async () => {
    await assertSucceeds(getDoc(doc(superAdmin(), 'users/cust1')));
    await assertSucceeds(getDoc(doc(opsAdmin(), 'users/cust1')));
  });
  it('astrology-tier admin CANNOT read customer PII/balances', async () => {
    await assertFails(getDoc(doc(astroAdmin(), 'users/cust1')));
  });
  it('another customer / an astrologer CANNOT read a user profile', async () => {
    await assertFails(getDoc(doc(customer('cust2'), 'users/cust1')));
    await assertFails(getDoc(doc(astrologer(), 'users/cust1')));
  });
  it('a customer CANNOT write their own money fields', async () => {
    await assertFails(updateDoc(doc(customer(), 'users/cust1'), { walletBalance: 999999 }));
  });
});

describe('astrologer financials + ledger', () => {
  it('the astrologer reads their own financials; super/ops read; astrology-tier does NOT', async () => {
    await assertSucceeds(getDoc(doc(astrologer(), 'astrologers/astro1/private/financials')));
    await assertSucceeds(getDoc(doc(superAdmin(), 'astrologers/astro1/private/financials')));
    await assertSucceeds(getDoc(doc(opsAdmin(), 'astrologers/astro1/private/financials')));
    await assertFails(getDoc(doc(astroAdmin(), 'astrologers/astro1/private/financials')));
  });
  it('walletTransactions: owner reads own row; astrology-tier denied; nobody writes', async () => {
    await assertSucceeds(getDoc(doc(customer(), 'walletTransactions/t1')));
    await assertFails(getDoc(doc(astroAdmin(), 'walletTransactions/t1')));
    await assertFails(setDoc(doc(superAdmin(), 'walletTransactions/t2'), { userId: 'cust1', amount: 1 }));
  });
});
