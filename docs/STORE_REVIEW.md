# Asktro — Store-Submission Review (Play + App Store)

_Read-only reviewer-perspective pass, 2026-07-19. What Google Play and Apple will
check, mapped to the actual code/config. Companion to `PRELAUNCH_PLAN.md` §1–2._

Legend: 🔴 blocker (store will reject / can't upload) · 🟠 likely-reject risk ·
🟢 already handled · 👤 owner task (not code)

---

## The one-paragraph verdict

The app is **close** on store mechanics — usage strings, report/block, in-app
deletion, current target SDK, and signing config are all in place. The **hard
blockers are two config items** (the `com.example.*` package IDs and the release
keystore) plus **hosted legal URLs**, and the **iOS AI-payments (IAP) decision**.
None are deep code work; most are owner/config. **Android-first is clearly the
faster path** — iOS adds the IAP constraint and APNs setup on top.

---

## 🔴 Blockers — must fix before you can upload

1. **Package IDs are `com.example.*`** — CONFIRMED in code:
   - Android `applicationId = "com.example.asktro_customer"` (`android/app/build.gradle.kts`)
   - iOS `PRODUCT_BUNDLE_IDENTIFIER = com.example.asktroCustomer` (`ios/.../project.pbxproj`)
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
   live, public URL**. Host the same content at a stable URL.
4. **Public web account-deletion URL** — in-app deletion **exists** ✅ (profile →
   delete), but **Google Play also requires a public web page** where a user can
   request deletion without installing the app. Add a simple hosted page.
5. **Real legal content** — `seed_legal.mjs` still has placeholders
   (`[EFFECTIVE DATE]`, office address, grievance officer, support email). Fill real
   values before submission (DPDP + store review both check).

## 🟠 Content / policy — likely-reject risks

6. **"For entertainment purposes" disclaimer + <18 age gate** — NOT present. Only a
   weak "not a substitute for a personal consultation" line inside the match-report
   PDF. Astrology/fortune-telling apps are expected to show a clear disclaimer, and
   **DPDP §9 + both stores** want an age gate (paid + astrology). Add: a visible
   disclaimer (onboarding/home) and an age confirmation at signup. _(small code)_
7. **Chat-image NSFW auto-scan** — report/block ✅ and a manual moderation queue
   exist, but there's **no automatic pre-scan** of user-uploaded chat images. Apple
   **1.2** wants *proactive* filtering of objectionable UGC. Wire the Vision API
   safe-search scan on upload (the moderation plumbing is already there). _(code)_

## 🍎 iOS-specific

8. **Apple IAP for the AI astrologer** 🔴 (the `PRELAUNCH_PLAN.md` §1 decision) — the
   app has **no StoreKit/IAP** today. Under Guideline **3.1.1**, an AI (digital)
   service consumed in-app **must** use Apple IAP (15–30% cut). Human consults
   (3.1.3(e) realtime) and Mall physical goods stay on Razorpay. **Decide:** add
   StoreKit for iOS AI recharge, **or** make AI free/hidden on iOS. → **Android-first
   sidesteps this entirely for now.**
9. **APNs push** 👤 — Apple Dev account, `.p8` key → Firebase, capabilities, real-device test.
10. **App Privacy nutrition label** 👤 — declare accurately (see the data map below).

## 🟢 Already handled (verified in code)

- iOS **usage strings** present and well-written (camera / mic / photo). ✅
- **Report + Block** UGC controls (`reportContent`, `blockUser`) — Apple **1.2**. ✅
- **In-app account deletion** (profile) + full server erasure. ✅
- **targetSdk 36** — exceeds Play's minimum target API. ✅
- **Signing config** is code-ready (release keystore when present). ✅
- **Terms & Privacy acceptance** gate at login. ✅
- **No third-party ad/tracking SDKs** (only Firebase Analytics) → simpler privacy
  story; almost certainly **no ATT prompt** required on iOS. ✅

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
3. Add the **entertainment disclaimer + age gate** and wire the **image NSFW scan**
   (the only two real code items here).
4. Complete **Play Data Safety** + **content rating** → **submit Android.**
5. iOS later: decide **IAP**, set up **APNs**, complete **App Privacy** → submit.

**Bottom line:** no deep engineering left for the store — it's package IDs, a
keystore, two hosted URLs, a disclaimer/age-gate, an image scan, and the iOS IAP
call. Android-first is a short list.
