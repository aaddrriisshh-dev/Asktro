# Pre-Launch Checklist — MUST do before going live

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

## Add new pre-launch items below as they come up.
