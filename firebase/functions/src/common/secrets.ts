/** Declared secrets — set via `firebase functions:secrets:set`. Never in repo. */
import { defineSecret } from 'firebase-functions/params';

export const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID');
export const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');
export const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');
export const AGORA_APP_ID = defineSecret('AGORA_APP_ID');
export const AGORA_APP_CERTIFICATE = defineSecret('AGORA_APP_CERTIFICATE');

// AI astrologer engine — Gemini API key (Secret Manager: GEMINI_API_KEY).
// Lives on the funded asktro-tech-provate-limited project. Used by the AI reply
// engine only; declared here so any AI function can attach it via { secrets }.
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// WhatsApp Cloud API (Meta) — sends the login OTP over WhatsApp (₹0.115 vs
// Firebase's ₹6.69/SMS). The permanent System-User access token and the sending
// number's Phone Number ID. Set via:
//   firebase functions:secrets:set WHATSAPP_TOKEN
//   firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
export const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');
export const WHATSAPP_PHONE_NUMBER_ID = defineSecret('WHATSAPP_PHONE_NUMBER_ID');
