/**
 * ASKTRO Cloud Functions entry point. All business logic — billing, wallet,
 * consultations, recharge, coupons, referrals, ratings, tokens, notifications,
 * admin actions — is enforced here. Clients only display state.
 */
import { setGlobalOptions } from 'firebase-functions/v2';

// Defaults for all functions. cpu:1 + concurrency:80 lets one warm instance
// serve up to 80 requests at once (256MiB/<1vCPU would force concurrency-1 and
// throttle the billing heartbeat under load). maxInstances:100 => ~8k in-flight
// requests of headroom. Scales to zero when idle, so idle cost is unchanged.
setGlobalOptions({
  region: 'asia-south1',
  memory: '512MiB',
  cpu: 1,
  concurrency: 80,
  maxInstances: 100,
});

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
export { onAuthUserCreate } from './auth/onAuthUserCreate';
export { onCustomerSignup } from './auth/onUserCreate';
export { setUserRole, deleteAccount } from './auth/adminAndDeletion';

// ---- Notifications ----
export { onNotificationCreated, sendBroadcast } from './notifications/sender';

// ---- Admin financial actions ----
export { adjustWallet, processPayout, setAstrologerStatus, setUserStatus } from './admin/actions';

// ---- Admin astrologer provisioning ----
export { createAstrologer, updateAstrologer, deleteAstrologer } from './admin/createAstrologer';

// ---- Admin support-ticket actions ----
export { replySupportTicket, closeSupportTicket, reopenSupportTicket } from './admin/support';
export { onSupportTicketCreated } from './admin/supportTrigger';

// ---- Admin team management (roles & attribution) ----
export { createAdmin, setAdminRole, removeAdmin, listAdmins } from './admin/admins';

// ---- Dev/testing: dummy payment gateway ----
export { devSimulateRecharge, simulateRechargeSelf } from './admin/devTools';
