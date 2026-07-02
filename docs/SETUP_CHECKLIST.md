# ASKTRO — Owner Setup Checklist (accounts & keys)

This is your side of the build: the external accounts to create and the
keys/values to hand the app. The engineering session builds against
placeholders in `.env.example`, so it will NOT stall waiting on you — but
each item below UNBLOCKS a specific phase. Get the early ones done first.

Legend:  ⛔ blocks a phase  •  🟡 needed soon  •  🟢 can defer

---

## 0. Naming decisions (do this first — 2 minutes)  ⛔
- [ ] Android applicationId — customer app  → e.g. `com.asktro.customer`
- [ ] Android applicationId — astrologer app → e.g. `com.asktro.astrologer`
- [ ] iOS bundle id — customer  → e.g. `com.asktro.customer`
- [ ] iOS bundle id — astrologer → e.g. `com.asktro.astrologer`
> These get baked into Firebase apps and store listings — pick them once, don't change later.

## 1. Firebase project  ⛔ (blocks Auth, Firestore, Functions — the core)
- [ ] Create a Firebase project at console.firebase.google.com (name: ASKTRO)
- [ ] Upgrade to the **Blaze (pay-as-you-go)** plan — Cloud Functions require it
- [ ] Register apps and download configs:
      - [ ] Android customer  → `google-services.json`
      - [ ] Android astrologer → `google-services.json`
      - [ ] iOS customer  → `GoogleService-Info.plist`
      - [ ] iOS astrologer → `GoogleService-Info.plist`
      - [ ] Web (for Admin portal) → web config snippet (apiKey, authDomain, etc.)
- [ ] Enable **Authentication** providers:
      - [ ] Phone (OTP)
      - [ ] Google
      - [ ] Apple  (needs an Apple Developer account — see §5)
- [ ] Enable **Firestore**, **Storage**, **Cloud Messaging**, **Remote Config**, **Crashlytics**
- [ ] Collect: `FIREBASE_PROJECT_ID`, web `apiKey`, `authDomain`, `storageBucket`,
      `messagingSenderId`, `appId`

> ⚠️ Phone OTP in production needs SHA-1/SHA-256 fingerprints (Android) and
> APNs auth key (iOS) added to Firebase. The session can use test numbers
> until you add these.

## 2. Razorpay (payments)  🟡 (blocks Recharge / wallet top-up phase)
- [ ] Create account at razorpay.com and complete **KYC** (can take a few days — start early)
- [ ] Get **Test mode** keys first: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- [ ] Later, switch to **Live** keys after testing
- [ ] Set up a **Webhook** (URL comes from the deployed Cloud Function) +
      `RAZORPAY_WEBHOOK_SECRET`
> Key SECRET and webhook secret live ONLY in Cloud Functions config — never in the app.

## 3. Agora (voice & video)  🟡 (blocks Voice/Video consultation phase)
- [ ] Create account at agora.io
- [ ] Create a project → get `AGORA_APP_ID`
- [ ] Enable **App Certificate** → get `AGORA_APP_CERTIFICATE`  (token auth)
> Token generation happens in a Cloud Function; the certificate never ships in the app.

## 4. Google Play Console  🟢 (needed only to publish the Android apps)
- [ ] Pay one-time $25, create developer account
- [ ] Two app listings (customer + astrologer)

## 5. Apple Developer Program  🟢 (needed for iOS build + Sign in with Apple)
- [ ] Enroll ($99/year)
- [ ] Create App IDs + APNs auth key (for push + phone OTP on iOS)
- [ ] Two app records (customer + astrologer)

## 6. Content you provide (no code)  🟢
- [ ] Logo (SVG/PNG, purple) for splash + app icons
- [ ] Privacy Policy, Terms, Refund Policy text (for the CMS)
- [ ] Astrologer roster to onboard (you're handling this)

---

## Where each value goes
| Value | Lives in |
|---|---|
| Firebase web config, project id | Admin portal `.env`, Flutter config |
| `google-services.json` / `GoogleService-Info.plist` | Flutter apps (android/ios folders) |
| Razorpay Key ID | client (checkout) |
| Razorpay Key Secret, Webhook Secret | Cloud Functions config only |
| Agora App ID | client |
| Agora App Certificate | Cloud Functions config only |

## Suggested order of doing all this
1. Naming (§0) → 2. Firebase project + Blaze + Auth (§1) → 3. Razorpay TEST keys (§2)
→ 4. Agora (§3) → build & test everything in test mode → 5. Play/Apple accounts (§4,§5)
when you're close to launch → 6. Swap TEST keys for LIVE keys → publish.

> Rule: nothing here blocks the engineering session from STARTING. It scaffolds,
> builds the design system, data model, and billing logic against placeholders.
> You feed real keys in as each phase needs them.
