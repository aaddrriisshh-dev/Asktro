# Asktro — Store-Submission Review (Play + App Store)

_Reviewer-perspective pass, **re-verified 2026-07-20** against current code. What
Google Play and Apple will check, mapped to the actual code/config. Companion to
`PRELAUNCH_PLAN.md` §1–2._

Legend: 🔴 blocker (store will reject / can't upload) · 🟠 likely-reject risk ·
🟢 already handled · 👤 owner task (not code)

> **What changed since the 2026-07-19 pass:** the "for entertainment purposes"
> disclaimer + 18+ age gate are now **shipped** in the customer login (moved to
> 🟢). Two **new** items surfaced this pass, both iOS-only: the missing
> `ITSAppUsesNonExemptEncryption` key and absent `UIBackgroundModes`. Neither
> blocks the Android-first launch.

---

## The one-paragraph verdict

The app is **close** on store mechanics — usage strings, report/block, in-app
deletion, current target SDK, signing config, and now the disclaimer/age-gate are
all in place. The **hard blockers remain two config items** (the `com.example.*`
package IDs and the release keystore) plus **hosted legal URLs**, and the **iOS
AI-payments (IAP) decision**. None are deep code work; most are owner/config.
**Android-first is clearly the faster path** — iOS adds the IAP constraint, APNs,
the encryption key, and background-modes on top.

---

## 🔴 Blockers — must fix before you can upload

1. **Package IDs are `com.example.*`** — CONFIRMED still in code (2026-07-20):
   - Android `applicationId = "com.example.asktro_customer"` / `"..._astrologer"`
     (`android/app/build.gradle.kts`; the file even carries a `// BANNED by Play` note)
   - iOS `PRODUCT_BUNDLE_IDENTIFIER = com.example.asktroCustomer` / `...Astrologer`
     (`ios/Runner.xcodeproj/project.pbxproj`)
   - **Google Play outright bans the `com.example` prefix.** Pick real IDs (e.g.
     `in.asktro.customer` / `in.asktro.astrologer`), then **re-register both apps in
     Firebase** and drop in the new `google-services.json` / `GoogleService-Info.plist`.
     ⚠️ Changing the applicationId means a **new app** on the store — do it *before*
     the first upload, never after.
2. **Release keystore + `android/key.properties`** 👤 — the Gradle signing config is
   code-ready (uses the release keystore when `key.properties` is present, else
   debug), but the keystore itself doesn't exist yet. Create it, keep it + its
   passwords backed up forever (losing it = can't update the app).

## 🔴 Hosted legal URLs — required by both stores 👤

3. **Public Privacy Policy URL** — today the policy is only an in-app CMS page
   (`cms/privacy`). Play's Data Safety form and Apple's App Privacy **both require a
   live, public URL**. Draft ready at `docs/legal/privacy-policy.html`; review +
   fill + host at a stable URL (`asktro.in/privacy`).
4. **Public web account-deletion URL** — in-app deletion **exists** ✅ (profile →
   delete + support screen), but **Google Play also requires a public web page**
   where a user can request deletion without installing the app. Draft ready at
   `docs/legal/account-deletion.html`; host at `asktro.in/account-deletion`.
5. **Real legal content** — `seed_legal.mjs` and the 3 HTML drafts still carry
   placeholders (`[EFFECTIVE DATE]`, office address, grievance officer, support
   email). Fill real values before submission (DPDP + store review both check).

## 🟠 Content / policy — likely-reject risks

6. **Chat-image NSFW auto-scan** — report/block ✅ and a manual moderation queue
   exist, but there's **no automatic pre-scan** of user-uploaded chat images. Apple
   **1.2** wants *proactive* filtering of objectionable UGC. Wire the Vision API
   safe-search scan on upload (the moderation plumbing is already there). _(code —
   this is a Cloud Function, so it goes in the next backend batch, not now.)_
7. **Camera/mic permissions vs. a chat-only launch** 🟠 — both apps declare
   `CAMERA` + `RECORD_AUDIO` (Android) and the matching iOS usage strings, but
   voice/video calling isn't live yet (Agora phase). If the **first** release ships
   chat-only, a reviewer may ask why camera/mic are requested. Options: (a) ship
   calls in v1 so the permissions are visibly used, or (b) keep them — the usage
   strings already explain "for voice and video consultations," which usually
   satisfies review. Low risk; just be ready to answer it.

## 🍎 iOS-specific

8. **Apple IAP for the AI astrologer** 🔴 (the `PRELAUNCH_PLAN.md` §1 decision) — the
   app has **no StoreKit/IAP** today. Under Guideline **3.1.1**, an AI (digital)
   service consumed in-app **must** use Apple IAP (15–30% cut). Human consults
   (3.1.3(e) realtime) and Mall physical goods stay on Razorpay. **Decide:** add
   StoreKit for iOS AI recharge, **or** make AI free/hidden on iOS. → **Android-first
   sidesteps this entirely for now.**
9. **Missing `ITSAppUsesNonExemptEncryption`** 🟠 — NEW this pass. Neither app's
   `Info.plist` declares it, so **every** TestFlight/App Store upload will stop and
   ask you the export-compliance question by hand. The app uses only standard HTTPS
   crypto → it qualifies for the exemption. Add one line to both `Info.plist`:
   `<key>ITSAppUsesNonExemptEncryption</key><false/>`. _(trivial config; iOS-only —
   apply when the iOS build is prepped.)_
10. **No `UIBackgroundModes`** 🟠 — NEW this pass. For Agora voice/video to survive
    backgrounding and for VoIP push to ring, iOS needs `audio` (and likely `voip`)
    in `UIBackgroundModes`. Not needed for a chat-only Android-first launch; **wire
    it with the APNs / Agora-calls phase**, not before.
11. **APNs push** 👤 — Apple Dev account, `.p8` key → Firebase, capabilities,
    real-device test.
12. **App Privacy nutrition label** 👤 — declare accurately (see the data map below).

## 🟢 Already handled (verified in code, 2026-07-20)

- **"For entertainment purposes" disclaimer + 18+ age gate** — DONE. Login requires
  "I am 18 or older and agree to the Terms of Service and Privacy Policy"
  (`login_screen.dart:164`) and shows the guidance/entertainment disclaimer
  (`:174`), enforced for phone + Google/Apple (`:31,:68`). ✅
- iOS **usage strings** present in both apps (camera / mic / photo library). ✅
- **Report + Block** UGC controls (`reportContent`, `blockUser`) — Apple **1.2**. ✅
- **In-app account deletion** (profile + support screen) + full server erasure. ✅
- **targetSdk 36 / minSdk 24** — exceeds Play's minimum target API. ✅
- **Signing config** is code-ready (release keystore when present). ✅
- **Terms & Privacy acceptance** gate at login. ✅
- **No cleartext traffic** — HTTPS-only (no `usesCleartextTraffic`, no legacy
  network-security-config exception). ✅
- **Android permissions are lean** — `INTERNET`, `ACCESS_NETWORK_STATE`,
  `RECORD_AUDIO`, `CAMERA`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH_CONNECT`,
  `POST_NOTIFICATIONS` (Android 13+), `VIBRATE` (astrologer). No legacy
  `READ/WRITE_EXTERNAL_STORAGE`, no over-broad scopes. ✅
- **No third-party ad/tracking SDKs** (only Firebase Analytics) → simpler privacy
  story; almost certainly **no ATT prompt** required on iOS. ✅

## 👀 Worth a quick owner check (not blockers)

- **Launcher / store display names** — Android labels are **"Asktro Clarity"**
  (customer) and **"Asktro Consultation"** (astrologer); iOS `CFBundleDisplayName`
  is set too. Confirm these are the names you want the store listing + home-screen
  icon to show (many would want just **"Asktro"** for the customer app). Trivial to
  change, but change it *before* listing so it matches the store metadata.

---

## Data map — for Play Data Safety + Apple App Privacy 👤

Declare exactly what's collected (must match reality or it's a reject):

| Data | Where | Note |
|---|---|---|
| Name, phone | signup/profile | Personal IDs |
| **Birth date, birth time, birth PLACE** | onboarding | Sensitive; birth place = **precise location** — declare it |
| Wallet / purchases | recharge, Mall | Financial |
| Chat images | chat | User photos/UGC |
| Mic / camera | voice/video calls | |
| App activity | Firebase Analytics | |

**Shared with / processors:** Agora (calls), Razorpay (payments), Google/Firebase
(backend, analytics, push), Google Gemini (AI replies), ProKerala (astrology API).
Encrypted in transit; user can request deletion. List these as third parties.

---

## Recommended submission order

1. Fix the **package IDs** + re-register Firebase apps (do this first — everything
   else builds on the real IDs).
2. Create the **release keystore**; fill **real legal content**; host the **Privacy
   Policy** + **account-deletion** URLs.
3. Confirm the **display names**; wire the **image NSFW scan** (next backend batch).
4. Complete **Play Data Safety** + **content rating** → **submit Android.**
5. iOS later: decide **IAP**, add `ITSAppUsesNonExemptEncryption` + `UIBackgroundModes`,
   set up **APNs**, complete **App Privacy** → submit.

**Bottom line:** no deep engineering left for the store on Android — it's package
IDs, a keystore, two hosted URLs, and the NSFW scan. The disclaimer/age-gate that
used to be here is **done**. iOS adds the IAP decision, the encryption key, and
background-modes — all deferrable behind an Android-first launch.
