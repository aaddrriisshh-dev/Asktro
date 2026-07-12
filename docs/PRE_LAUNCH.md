# Pre-Launch Checklist — MUST do before going live

---

## 🗓️ TOMORROW'S LIST (set 2026‑07‑12, do next session)

1. **🔴 Money-logic + commission — discuss + LIVE test.** Agree the commission
   model (flat vs per-astrologer, AI vs human, coupon/offer effect), then run a
   real chat session and reconcile customer debit / astrologer credit / platform
   cut to the paisa. _(The critical item — do this one properly.)_
2. **Razorpay live keys.** Get the `rzp_live_…` Key ID + Key Secret from the
   person who set up the WhatsApp platform (don't regenerate live). Set both
   secrets → deploy the 3 wallet functions → ₹10 live test. _(Full steps in the
   "RAZORPAY LIVE KEYS — resume here" section below.)_
3. **Package ID rename** off `com.example.*` → real IDs (e.g.
   `com.asktro.customer` / `com.asktro.astrologer`). Claude does the code; Adrish
   re-registers both IDs in Firebase + drops in fresh `google-services.json`.
4. **Agora voice/video calls** — re-add `agora_rtc_engine` (fix the AGP namespace
   clash), build dial/answer screens, wire the token join. Its own focused effort
   (token backend is already done + deployed).
5. **Launch-day toggles** (flip at launch, in order, with a real build): App Check
   enforcement, `devPaymentsEnabled → false`, R8 shrinking + keep-rules,
   `minInstances` on hot functions.
6. **Quick console step:** enable the Firestore TTL policy on `rateLimits.expireAt`
   (30 seconds).

_Owner-side, not blockers: legal text, Android release keystore, iOS APNs push,
raise the ₹1,000 budget alert → ₹50,000._

---

## 🔴 CRITICAL — VERIFY BEFORE LAUNCH (added 2026‑07‑11, do first tomorrow)

**End-to-end money-logic validation on a real phone — needs a discussion + a live test.**
Before any real user is charged, confirm on-device that the numbers are exactly right:
- **Billing basis:** what per-minute rate is actually being charged to the customer
  (`ratePerMinutePaise` on the session) and how it's detected — confirm the rate
  shown in the app == the rate metered == the rate on the astrologer doc.
- **Commission:** what commission % is loaded for each astrologer and where it's
  read from (session snapshot `commissionPercent`), and that the astrologer's
  **earning = charge × (1 − commission%)** and the **platform cut = charge ×
  commission%** — reconcile all three (customer debit, astrologer credit, platform
  cut) for a real test session.
- **Test matrix:** run a live chat session end-to-end and check: wallet debit per
  minute, astrologer ledger credit, commission split, pause/resume, and end-of-
  session settlement all agree to the paisa.
- Discuss the intended commission model (flat vs per-astrologer, AI vs human,
  offers/coupons effect on the split) so the config matches the business intent.

---

## 🆕 RECENT UPDATES (2026‑07‑11)

Snapshot of what changed since the last audit deploy, so this doc matches HEAD:

- **Admin portal is now fully mobile‑responsive** (deployed to Vercel). Login
  centres correctly on phones; the sidebar is an off‑canvas hamburger drawer so
  content uses the full width; every list renders as cards; every page section
  (Customer/Astrologer Management, Sessions, Coupons, Banners, Push, Plans,
  Reports, CMS) folds into tappable collapsible headers; all multi‑column forms
  drop to a single column. Desktop layout unchanged.
- **Android/iOS back button fixed in both apps** — the phone back button now
  retraces visited tabs (and asks once before exiting on Home) instead of
  dropping the app; detail pages keep their in‑app back arrows. _Needs a
  customer + astrologer **APK rebuild** to reach devices._
- **Offers screen** now shows offer‑type recharge plans under "View all offers".
- **App launch crash fixed** (R8 shrinking disabled — see the R8 section below).

### Pre-pilot brief (scale + observability) — DONE (2026‑07‑11)
The "safe to point 10k users at it" brief is complete:
- **Backups (C1/C2):** Firestore **Point-in-time recovery** (7‑day) and **daily
  scheduled backups** (14‑day retention) enabled in the console.
- **Bounded reads (A):** the last few `astrologers` full-collection reads capped
  at `limit(500)`; no dashboard/report query can scan an unbounded collection.
- **Alert delivery (B4):** `deliverAlert` forwards every new `alerts` doc to
  **Slack #all-asktro-alerts** (critical = `@channel`). Tested end-to-end.
- **Error tracking (B1/B2):** backend crashes are auto-captured by **Google
  Cloud Error Reporting** (zero-code, gen-2 functions); the admin portal now has
  a global handler + route error boundary (`ErrorReporter` / `error.tsx`) that
  reports uncaught portal errors via the `reportClientError` callable → Slack.
- Deliberately deferred per the brief (premature until ~100k users): distributed
  counters, message-participant denormalization, sendBroadcast rewrite,
  walletTransactions TTL.

### ProKerala astrology API — finish wiring before horoscope goes live
- [ ] The `prokeralaAstrology` callable proxy is **written** (holds the
  Client ID/Secret in Secret Manager, OAuth2 client‑credentials, path
  whitelist) but **credentials are not set and it is not deployed yet**. To
  finish: (1) `firebase functions:secrets:set PROKERALA_CLIENT_ID` and
  `PROKERALA_CLIENT_SECRET` with the real (production, not sandbox) keys,
  (2) deploy `prokeralaAstrology`, (3) test a live call, (4) point the app's
  horoscope/kundli screens at it.

---

## 🔒 SECURITY — flip on RIGHT BEFORE launch (not earlier)

- [ ] **Enforce App Check on the callables.** App Check is *activated* in both apps but NOT
  *enforced* server-side (`setGlobalOptions` in `functions/src/index.ts` has no `enforceAppCheck`).
  This is the anti-bot / anti-abuse layer (stops scripted free-credit farming). **Deliberately deferred
  to launch:** turning it on before App Check is fully provisioned on the *production* builds
  (Play Integrity for Android release, App Attest for iOS, debug tokens for dev) will **lock out real
  users** from chat/recharge. Steps at launch: (1) confirm App Check is green in the Firebase console
  for real builds, (2) add `enforceAppCheck: true`, (3) test on a real build, then deploy.
  _(From the CTO audit — this was finding M1.)_

- [ ] **Add MFA (2‑factor) to the admin portal login.** Today the portal
  (`asktro-admin.vercel.app`) is email + password only. It controls real money
  (wallet adjust, payouts, refunds), so before real money flows it should require
  a second factor (authenticator‑app code). **Safe to defer now — there are no
  real users and the previously‑committed super‑admin password has been rotated.**
  Needs: (1) upgrade Firebase Auth to **Identity Platform** (paid tier, enables
  TOTP MFA), (2) each admin enrolls their phone, (3) small portal login‑flow code
  (Claude can do the code side once the tier is enabled). _(Adversarial audit P0‑2.)_

- [ ] **Flip `config/global.devPaymentsEnabled` → false.** This ON‑switch lets the
  dummy‑gateway functions mint wallet credit with no real payment (for testing).
  **No longer a live risk:** the 0c code guard is deployed, so those functions now
  refuse to run outside the local emulator regardless of this flag — the money‑mint
  is dead in production. Flipping the flag off before launch is just tidiness.
  _(Adversarial audit 0a/0c.)_

> **Adversarial‑audit money/trust fixes — DONE & DEPLOYED (2026‑07‑10).** For the
> record: customer‑presence + astrologer‑drop billing gate, single‑tick over‑bill
> clamp, Razorpay webhook credit fix (order‑doc resolution + dead‑letter),
> two‑simultaneous‑session lock, refund bucket allocation (P3‑7) + ledger
> reconciliation (P3‑8), dev‑mint prod guard (0c), full account deletion, support
> IDOR, and settlement test coverage (endConsultation / sweep / refund / payout /
> webhook / concurrency). 30 unit + 23 emulator tests green. See `AUDIT.md`.

---

## 🖼️ CHAT IMAGE AUTO-SCAN (NSFW) — enable before launch

The server-side image-safety trigger (`onChatImageUploaded`) is **written but
deliberately NOT deployed yet**. Once on, it sends every chat photo to Google
Cloud Vision SafeSearch and **auto-deletes + alerts** on adult/violent images so
they never reach the other person. Until enabled, uploaded images are only queued
in `imageModeration` for manual admin review — nothing is auto-blocked.

Why it's deferred: a Storage/Eventarc trigger needs a one-time IAM grant the
deploy service account can't set itself, and the real scan needs the Vision API.
Turn it on in ONE step (all of the below together):

- [ ] **Grant the IAM role.** Cloud Console → IAM → *Grant access* → principal
  `service-234450497443@gs-project-accounts.iam.gserviceaccount.com` → role
  **Pub/Sub Publisher** (`roles/pubsub.publisher`). _(Or make the deploy account
  a project Owner once, and the Firebase CLI configures this automatically.)_
- [ ] **Enable the Cloud Vision API** on the project (console → APIs & Services).
- [ ] **Install the client:** `cd firebase/functions && npm i @google-cloud/vision`.
- [ ] **Flip the flag:** set `config/global.featureFlags.imageModeration = true`.
- [ ] **Re-export + deploy:** add `onChatImageUploaded` back to the moderation
  export in `functions/src/index.ts`, then `firebase deploy --only functions`.
  _(Remember: this one function must run in **us-east1** — the bucket's region.)_

Note: report-user, block-user, and automatic **text** flagging (abuse / phone-
number sharing) are ALREADY live — only the image auto-scan is pending.

---

## 📱 iOS PUSH NOTIFICATIONS — required before iOS launch (Apple-side, only Adrish can do)

Launching iOS + Android together, so iOS push **must** be set up. The app code already
sends iOS notifications (banner + sound + `time-sensitive`), but iPhones get **zero** push
until the Apple pieces below exist:

- [ ] **Apple Developer account** ($99/yr) enrolled for Asktro Tech Private Limited.
- [ ] **APNs Auth Key (.p8)** created in the Apple Developer portal, then **uploaded into
  Firebase** → Project Settings → Cloud Messaging → Apple app config. *(This is the switch
  that lets Firebase send to iPhones. Without it, iOS push silently does nothing.)*
- [ ] **`GoogleService-Info.plist`** added to `apps/astrologer/ios/Runner/` (and the customer
  app's) — it's gitignored, so it must be placed on the build machine.
- [ ] **Push Notifications** capability + **Background Modes → Remote notifications** enabled
  in Xcode for both apps.
- [ ] Test on a **real iPhone** (the simulator never receives push).

Follow-up code (small, do during iOS device testing): bundle the custom `incoming_ring`
sound into the iOS app so iOS rings with our tone instead of the default; add Accept/Decline
notification actions (shared with Android). Not blockers — iOS still notifies with the
default sound + tap-to-accept without them.

---

## 💳 BILLING & CLOUD CONSOLE (Adrish — verify before launch)

- [ ] **Raise the budget alert** from **₹1,000 → ~₹50,000/month** at launch. The ₹1,000 tripwire is
  correct for testing (early warning, spends nothing today), but real traffic will cross ₹1,000 in a
  day or two and spam "over budget" emails. Google Cloud → **Billing → Budgets & alerts** → edit the
  "Firebase Project" budget. Keep thresholds at 50/90/100%. **A budget only alerts — it does NOT cap
  spend**, so raising it can't cut off users.
- [ ] **Confirm budget-alert emails reach Adrish** (add your email under the budget's alert recipients
  if it isn't already a billing admin).
- [ ] **Complete pending Google Cloud Console verifications (Adrish)** — clear any identity / billing /
  account-verification prompts flagged in the Cloud Console before launch. _(Confirm exactly what's
  pending and resolve each.)_

---

## 📋 NEEDS FROM YOU (Adrish) — fill these, then we apply them all at once

> Running list of values/content only you can provide. Claude adds to this
> whenever a task is blocked on your input; nothing else is blocked meanwhile.

### Legal docs (to finalise Privacy Policy + Terms in `seed_legal.mjs`)
- [ ] **Effective date** (e.g. 8 July 2026)
- [ ] **Registered office address** of Asktro Tech Private Limited
- [ ] **Support email** (e.g. support@asktro.app)
- [ ] **Grievance Officer name** (a real person — required by IT Rules)
- [ ] **Grievance email** (same as support, or grievance@…)
- [ ] **City for legal jurisdiction** (e.g. Kolkata)

### Content
- [ ] **About ASKTRO** text (you said you'd send it) — goes into `cms/about`
- [ ] **App download / Play Store URL** for the referral "Share invite" — set
      `_kAppDownloadLink` in `apps/customer/lib/features/profile/profile_tab.dart`
      (placeholder `https://asktro.app` for now).

### Run on your Mac (native/regeneration steps Claude can't do here)
- [ ] `dart run flutter_launcher_icons` in `apps/customer` — regenerates the
      home-screen launcher icon PNGs with the new lavender background (the
      splash is already fixed in code; this fixes the app-drawer icon).

### Assets / accounts (from the security section below, repeated here for one view)
- [ ] Move & back up the deploy key + all secrets (see "Critical files" section)
- [ ] Create the Android **release keystore** before Play Store

---



> Living list of things that are safe for now but MUST be handled before the
> public launch (~30 days out, real wallets, millions of users).

---

## 🔐 SECURITY / SECRETS

### 1. Secure the Firebase deploy service-account key (HIGH PRIORITY)

**The exact file (do not confuse with the other similarly-named JSONs):**

```
asktro-tech-provate-limited-firebase-adminsdk-fbsvc-100e163e63.json
```

- Currently sitting loose in `~/Downloads/` on Adrish's Mac.
- This key can deploy Cloud Functions and act with admin power on the
  Firebase project. If leaked, someone can take over the backend.

**What to do before launch:**
1. Move it OUT of `Downloads` into a locked-down location
   (e.g. `~/.secrets/` with `chmod 600`, or a password manager / secret vault).
2. Never commit it to git (already gitignored — keep it that way).
3. **Rotate to CI-based deploys** eventually — the deploy key should live in a
   CI secret store (GitHub Actions secrets), NOT on a personal laptop, so a
   lost/stolen laptop doesn't hand over the project.
4. After moving to CI, **rotate (regenerate) this key** in
   Google Cloud Console → IAM & Admin → Service Accounts → Keys, and delete the
   old one, since it has been sitting unencrypted on disk.

**Deploy account & roles (one-time IAM setup already done — do NOT remove):**
- Account: `firebase-adminsdk-fbsvc@asktro-tech-provate-limited.iam.gserviceaccount.com`
- Roles granted: Service Usage Admin, Secret Manager Admin, Cloud Functions Admin.

---

### 2. Critical files & secrets to back up and keep safe

These are NOT in git (correctly gitignored), so they exist ONLY on Adrish's
Mac. If the laptop dies or is lost, these are gone. Back every one of them up
to a secure vault / password manager NOW, and keep them off `Downloads`.

| File / secret | Where it is now | Why it matters | Recoverable? |
|---|---|---|---|
| **Firebase deploy key** `asktro-tech-provate-limited-firebase-adminsdk-fbsvc-100e163e63.json` | `~/Downloads/` | Admin deploy access to backend | Yes — regenerate in Cloud Console (then delete old) |
| **google-services.json** (customer app) | `apps/customer/android/app/` (local only, gitignored) | Firebase config + OAuth clients for the app | Yes — re-download from Firebase console |
| **google-services.json** (astrologer app) | astrologer android dir (local only) | Same, for astrologer app | Yes — re-download from Firebase console |
| **Android RELEASE keystore (.jks)** | ⚠️ DOES NOT EXIST YET — app is signing with the *debug* key | Signs the Play Store app. LOSE IT = you can NEVER update the app again | ❌ NO — irreplaceable once created (unless enrolled in Play App Signing) |
| **key.properties** (keystore passwords) | ⚠️ not created yet (comes with the keystore) | Passwords for the release keystore | ❌ No — keep with the keystore |
| **Razorpay keys** (KEY_ID, KEY_SECRET, WEBHOOK_SECRET) | Secret Manager + Razorpay dashboard | Real money — payments/refunds | Yes — Razorpay dashboard |
| **Agora keys** (APP_ID, APP_CERTIFICATE) | Secret Manager + Agora dashboard | Voice/video calls | Yes — Agora dashboard |
| **Admin portal env** `apps/admin/.env.local` | local only (gitignored) | Admin portal secrets | Depends what's in it — back up |
| **iOS signing** (certs + provisioning profiles) | ⚠️ only if/when iOS is built | Signs the iOS app | Recreatable via Apple Developer, but painful |

**Action before launch:**
1. Copy every "exists now" file above into a secure vault / password manager
   (1Password, Bitwarden, etc.) — NOT `Downloads`, NOT plain iCloud.
2. **Create the Android release keystore** (it does not exist yet) and back it
   up in TWO safe places. This is the #1 irreplaceable file. Strongly recommend
   also enrolling in **Google Play App Signing** so Google holds a copy — that
   is the safety net if the keystore is ever lost.
3. Wire the release keystore into `apps/customer/android/app/build.gradle.kts`
   (currently line ~32 uses `signingConfigs.getByName("debug")` — must switch to
   a real `release` signing config before publishing).

---

## ⚖️ SCALE HARDENING (from the 1M-user audit)

**Fixed & committed** (need the function+index deploy to go live): function
sizing/concurrency (C1), config caching (H3), missing composite indexes
(H1/H5), bounded unread-count listener (M1).

**Fixed & committed (10k-scale audit):** sweep-job sharding (bounded-parallel
batches + concurrent fan-out, 300s timeout); two-phase account deletion (fast
critical phase + idempotent background erasure worker) so a heavy account can't
time out mid-delete; admin dashboard no longer downloads whole collections —
the users table paginates server-side and reads denormalized `usageSeconds`,
and revenue / consultation-activity charts read a per-day `dailyStats` rollup
instead of scanning walletTransactions / consultations. All need the function +
index + rules deploy to go live.

### `minInstances` — set at LAUNCH, not now
Keeping Cloud Function instances warm (`minInstances: N` on the hot callables —
tick / createConsultation / endConsultation / generateAgoraToken) removes the
cold-start lag the first user of each idle period feels. **Do not set it yet:**
a warm instance bills 24×7 even with zero traffic, so it only makes sense once
real, steady traffic exists. When launching: start with `minInstances: 1` on
those hot functions and raise with observed concurrency. (Left off until then.)

**Remaining — bigger changes, do before heavy scale:**
- [ ] **C2 — `sendBroadcast` → FCM topics / paginated tasks.** Current version
      loads ALL users into one function + writes 1M docs. **Do NOT send an
      all-users broadcast until this is rewritten.**
- [ ] **H2 — distributed counters** for the astrologer doc (rating/earnings/
      counts) — a celebrity astrologer with many concurrent chats contends on
      one document.
- [ ] **H4 — denormalize participants onto message docs** so security rules
      stop doing a `get(parent)` on every message/typing op (doubles reads on
      the hottest path).
- [ ] **M2 — home-feed "top rated"** sorts only 100 client-side (wrong past 100
      astrologers); back the rails with server `orderBy(...).limit()` + indexes.
- [ ] **M3 — `walletTransactions` growth** — add TTL/archival (ledger written
      every ~10s per active session).

## 📦 ANDROID R8 CODE SHRINKING — re-enable with keep-rules before launch
Currently **OFF** (`isMinifyEnabled=false` / `isShrinkResources=false` in both apps'
`android/app/build.gradle.kts`). AGP 9 turned shrinking ON by default, and without
keep-rules it stripped Firebase's classes → `Firebase.initializeApp()` crashed the
release build on launch. We disabled it so the app works.
**Before the polished launch:** turn shrinking back ON (smaller, harder-to-copy
app) but WITH proper ProGuard/R8 keep-rules for Firebase + Flutter, and **test the
release APK on a real device** — a shrunk build that isn't device-tested can crash
only in production. (Only re-enable once the keep-rules are verified on a phone.)

## 🚦 RATE LIMITING — enable the TTL policy (one-time, owner)
Per-user rate limiting is **live in code** (audit M2): `enforceRateLimit` guards
`createConsultation`, `createRechargeOrder`, `verifyRecharge`, and
`prokeralaAstrology` with generous, atomic, fixed-window caps (a real user never
hits them; only scripted abuse does). Counters live in the `rateLimits`
collection and each carries an `expireAt`.

- [ ] **Enable a Firestore TTL policy** so those counter docs auto-delete and the
  collection stays bounded: Firebase console → Firestore → **TTL** → *Create
  policy* → collection `rateLimits`, timestamp field `expireAt`. (One-time. Until
  it's on, docs still expire logically — the limiter ignores old windows — they
  just aren't garbage-collected.)
- Caps are in `functions/src/common/rateLimit.ts` (`RATE_RULES`); tune + redeploy
  to change. Flip any action's `mode` to `'observe'` to log-only without blocking.

---

## 💳 RAZORPAY LIVE KEYS — resume here (paused 2026‑07‑12)
Razorpay integration is **fully coded, tested, and deployed** — the only thing
missing is the correct **live key values** in Secret Manager.

**State right now:**
- `createRechargeOrder`, `verifyRecharge`, `razorpayWebhook` are deployed and
  bound to secret **version 4**. The shared-account webhook guard is live
  (ignores the other Asktro product's captures).
- The secrets currently hold **stale/mismatched TEST values**, so a recharge
  returns `401 BAD_REQUEST_ERROR "Authentication failed"`. Recharge is therefore
  **intentionally non-functional until real keys are set** — fine pre-launch.
- A **live webhook is already registered** in the Razorpay dashboard →
  URL `https://asia-south1-asktro-tech-provate-limited.cloudfunctions.net/razorpayWebhook`,
  event `payment.captured`.

**⚠️ Shared account:** the Razorpay account is shared with another Asktro product
(the WhatsApp platform), which runs on the **live** keys. **Do NOT click
"Regenerate" on the LIVE key** — it invalidates the live pair and breaks that
platform. Get the existing live Key Secret from whoever generated it.

**To finish (≈10 min):**
1. Obtain the live `rzp_live_…` **Key ID** + its matching **Key Secret**.
2. `firebase functions:secrets:set RAZORPAY_KEY_ID` (paste live Key ID), answer `n`.
3. `firebase functions:secrets:set RAZORPAY_KEY_SECRET` (paste live secret), answer `n`.
4. Confirm `RAZORPAY_WEBHOOK_SECRET` matches the live webhook's secret (re-set if needed).
5. Deploy the three wallet functions **one at a time** (409 → lands in background):
   `createRechargeOrder`, `verifyRecharge`, `razorpayWebhook`.
6. Test a real ₹10 recharge: checkout opens → wallet credits → Razorpay dashboard
   + admin portal agree. Then flip `config/global.devPaymentsEnabled → false`.

_(Test-mode alternative for a dry run without real money: regenerate the TEST key
— safe, doesn't touch live — set both secrets to the test pair, redeploy, pay
with a Razorpay test card.)_

---

## Add new pre-launch items below as they come up.
