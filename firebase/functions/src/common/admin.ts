/** Firebase Admin SDK singletons. */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();
/** Default Cloud Storage bucket (used to purge a deleted user's chat media). */
export const bucket = getStorage().bucket();
export { FieldValue, Timestamp };
