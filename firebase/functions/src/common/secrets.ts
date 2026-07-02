/** Declared secrets — set via `firebase functions:secrets:set`. Never in repo. */
import { defineSecret } from 'firebase-functions/params';

export const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID');
export const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');
export const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');
export const AGORA_APP_ID = defineSecret('AGORA_APP_ID');
export const AGORA_APP_CERTIFICATE = defineSecret('AGORA_APP_CERTIFICATE');
