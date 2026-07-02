/** Firestore collection/path constants — single source of truth for paths. */
export const Collections = {
  users: 'users',
  astrologers: 'astrologers',
  consultations: 'consultations',
  messages: (consultationId: string) => `consultations/${consultationId}/messages`,
  walletTransactions: 'walletTransactions',
  rechargePlans: 'rechargePlans',
  coupons: 'coupons',
  couponRedemptions: 'couponRedemptions',
  banners: 'banners',
  notifications: 'notifications',
  referrals: 'referrals',
  payouts: 'payouts',
  supportTickets: 'supportTickets',
  auditLogs: 'auditLogs',
  adminUsers: 'adminUsers',
  processedPayments: 'processedPayments', // idempotency keys for recharge
} as const;

export const ConfigDoc = { path: 'config/global' } as const;
