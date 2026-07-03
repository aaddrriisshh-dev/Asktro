# ASKTRO — What's Left (audit snapshot)

This is a build-status snapshot: what's done, what needs **your** accounts/keys,
and what code work remains. The platform is largely built (customer app,
astrologer app, admin portal, and the Cloud Functions backend are all real and
wired to live data).

## ✅ Done
- **Backend (Cloud Functions + Firestore):** billing engine, Razorpay recharge +
  webhook, wallet ledger, coupons, referrals, ratings, FCM notifications, admin
  actions, Agora token minting. Production-grade security rules + composite
  indexes. No stubs.
- **Customer app (~90%):** auth (phone/Google/Apple), browse/search, astrologer
  profile, wallet + Razorpay recharge, coupons, server-billed **chat**
  consultations, low-balance/resume, rating, history, notifications, support,
  CMS. Keyless integrations: horoscope API (with local fallback), Nominatim
  geocoding.
- **Astrologer app:** online toggle, incoming requests, accept/decline, chat,
  earnings + payout request, availability, approval gating.
- **Admin portal (Next.js):** 15 live pages — astrologers, users, plans, banners,
  coupons, payouts, pricing, broadcast, support, CMS, audit log, reports.

## 🔑 Your setup (operational — no coding)
1. Firebase project → upgrade to **Blaze**; set the real project id in `.firebaserc`.
2. Set 5 backend secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`.
3. Deploy functions/rules/indexes → paste the `razorpayWebhook` URL into Razorpay
   (enable `payment.captured`).
4. Manually set the **first super-admin** custom claim (unlocks the admin portal).
5. Run seed scripts: recharge plans (required before recharge works) + astrologers.
6. Enable Auth providers (Phone, Google, Apple); add release SHA-1/256; iOS
   reversed-client-id; Apple entitlement.
7. Add `google-services.json` / `GoogleService-Info.plist`; run
   `flutterfire configure` (iOS/Web `firebase_options` are placeholders).
8. Admin portal: create `apps/admin/.env.local` from the example.

## 🛠️ Code work left (prioritized)
1. **Voice/Video calling — MISSING.** Agora was removed from both apps; buttons
   show "coming soon"; the backend token function exists but nothing calls it.
   Decide: build for v1 or ship chat-only. (Biggest effort.)
2. ~~Astrologer can't send images in chat~~ — **DONE** (this change).
3. ~~Payout requested lifetime earnings instead of unpaid balance~~ — **DONE**
   (now uses `pendingPayout` + blocks duplicate open requests).
4. **Astrologer self-onboarding/KYC** — none; astrologers are admin-created only.
   Build only if self-serve recruitment is intended.
5. **Android release config** — real app IDs + release signing (both apps still
   debug-signed / placeholder IDs).
6. Reviews list (only average stars shown today) + polish + `flutter analyze` /
   emulator verification.

## ⚠️ Reproducibility risk
The native `android/` & `ios/` project files (manifest, `google-services.json`,
generated launcher icons) are **not committed** — they exist only on the dev
Mac, so a fresh clone can't build. Commit them from that machine.
