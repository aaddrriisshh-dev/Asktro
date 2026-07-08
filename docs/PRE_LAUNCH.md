# Pre-Launch Checklist — MUST do before going live

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

## Add new pre-launch items below as they come up.
