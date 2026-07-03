/**
 * ASKTRO Cloud Functions entry point. All business logic — billing, wallet,
 * consultations, recharge, coupons, referrals, ratings, tokens, notifications,
 * admin actions — is enforced here. Clients only display state.
 */
import { setGlobalOptions } from 'firebase-functions/v2';

// Sensible defaults for all functions (region close to India, modest memory).
setGlobalOptions({ region: 'asia-south1', maxInstances: 50 });

// ---- Consultation / billing engine (core) ----
export { createConsultation } from './billing/createConsultation';
export { activateConsultation } from './billing/activateConsultation';
export { tickConsultation } from './billing/tickConsultation';
export { pauseConsultation, resumeConsultation } from './billing/pauseResume';
export { endConsultation } from './billing/endConsultation';
export { sweepStaleSessions } from './billing/sweepSessions';

// ---- Wallet / recharge / payments ----
export { createRechargeOrder, verifyRecharge, razorpayWebhook } from './wallet/recharge';

// ---- Coupons / referrals / ratings ----
export { validateCoupon } from './coupons/validateCoupon';
export { rateConsultation } from './ratings/rateConsultation';

// ---- Voice / video ----
export { generateAgoraToken } from './agora/token';

// ---- Auth / account lifecycle ----
export { onCustomerSignup } from './auth/onUserCreate';
export { setUserRole, deleteAccount } from './auth/adminAndDeletion';

// ---- Notifications ----
export { onNotificationCreated, sendBroadcast } from './notifications/sender';

// ---- Admin financial actions ----
export { adjustWallet, processPayout, setAstrologerStatus } from './admin/actions';

// ---- Admin astrologer provisioning ----
export { createAstrologer, updateAstrologer, deleteAstrologer } from './admin/createAstrologer';
