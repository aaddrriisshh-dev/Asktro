# Session handover — launch status snapshot

_Last updated at end of the pre-submission session. Read this first when
resuming — it captures exactly where things stand so work can continue without
re-deriving context._

---

## ✅✅ SUBMITTED FOR REVIEW — 31 Jul 2026 (LATEST). READ THIS FIRST.

**The Free-v1 was built, verified end-to-end, and SUBMITTED to Google.** Play
Console now shows **"Changes in review"** and the old rejection banner is gone.
This is a **Closed testing (Alpha)** submission — the required first step for a
**personal developer account** before Production.

**What is in review (13 changes):**
- **App build: versionCode 3 (1.0.0)** — the free-v1 AAB (`kMonetizationEnabled
  = false`). Built on the Mac (`flutter build appbundle --release`, 186 MB
  upload → 66 MB delivered). Old money build **versionCode 2 excluded** ("Not
  included" in the release). Release notes set.
- Country: **India** only · Track: Alpha, 100% rollout · Testers: "Asktro Tester
  list" (**14 testers**, above Google's 12 minimum).
- **Store listing (en-GB / Default):** clean short + full descriptions (free AI
  only); **6 phone screenshots** (Panchang, Janam Kundli, Daily Horoscope,
  astrologers-list-with-AI-badges, chat, home 3-tab "Hi Adraash"); app icon +
  feature graphic. **Tablet/Chromebook/XR left empty on purpose.** Removed all
  old money screenshots (Add Cash / ₹per-min / 5-tab / "Pandit Balbir Singh"
  human-remedy profile). NOTE: the old **tablet screenshots** (Add Cash + ₹/min
  + 5-tab) were a hidden rejection trigger — deleted.

**All App-content declarations verified before submit:**
- **Financial features = "My app does not contain any financial features"** ← the
  core fix for the rejection.
- **Data safety:** Financial info **0/4**, Health & fitness **0/2** collected;
  account-deletion URL present; encrypted in transit. Consistent with "no money".
- **Health apps:** "My app does not have any health features" ✓
- **Ads:** "No, my app does not contain ads" ✓
- **App access (reviewer login):** test number **+918318259972 / OTP 123456**
  (Firebase test number) with instructions; Google-testing toggle ON.
- Target audience **18+** · Category **Lifestyle** · Foreground-services declared.

**Website pages fixed to match the free app (dev team updated the live site):**
- `asktro.in/privacy` and `asktro.in/accountdeletion` were rewritten to remove
  payments/wallet/pooja/pandit/call/referral wording. Clean v1 source saved at
  `docs/legal/privacy-policy-v1.html` (privacy) and the account-deletion text is
  in the chat/handoff. The full-paid versions remain in `docs/legal/*.html` for
  v2. ⚠️ When monetization returns in v2, restore the paid privacy + deletion
  pages too.

**WHAT HAPPENS NEXT (pick up here):**
1. **Wait for Google's review** of the closed-testing release (hours → a couple
   days). Result comes by email + console notification. Don't touch the release
   while in review.
2. **If approved:** send the 14 testers the opt-in link; they must open the app
   over **14 continuous days** → that unlocks the **Production** application.
   Then create a Production release (same AAB) and submit for production review.
3. **If Google flags something:** read it together and fix + resubmit (same flow
   as today).
4. **v2 (after D-U-N-S / org account):** flip `kMonetizationEnabled = true`
   (see `docs/FREE_V1_RESTORE.md`), restore paid privacy/deletion pages, rebuild,
   ship the 8-issue batch in `docs/POST_APPROVAL_FIXES.md`.

**Env note:** this Claude session runs in a locked-down cloud env that CANNOT
reach external sites (asktro.in etc. are blocked by the network policy). To
verify live pages, the founder pastes text / screenshots.

---

## 🚨 PREVIOUS STATE — the "Free v1" pivot (context for the above).

**What happened:** the customer app was **REJECTED** by Play — not for the app,
but for the **developer account**. Google now requires an **organisation account
(+ D-U-N-S)** for apps that offer **financial features** (wallet/payments). We're
on a **personal/individual** account. The founder has **applied for D-U-N-S**
(pending, takes time).

**The strategy (agreed):** ship a **"Free v1"** now — a genuinely free app with
**NO money/financial features at all** — so the "My app doesn't provide any
financial features" Play declaration is truthful and it passes on the individual
account. Then, once D-U-N-S/org account lands, flip everything back on as **v2**
(Google reviews v2 normally). This is the developer's standard play (ship basic,
add features across versions).

**HOW it's built (all done + committed on branch `claude/asktro-session-handoff-o1ggo8`):**
- One master switch: `apps/customer/lib/app/feature_flags.dart` →
  `const bool kMonetizationEnabled = false;`. Everything money is HIDDEN behind
  it (nothing deleted). Flip to `true` + rebuild = full app back for v2.
- Hidden in v1: Wallet + Mall tabs, recharge/Razorpay, transactions, coupons,
  referral, per-minute rates, balance/recharge UI in chat, Kundali ₹49 (now
  free), home "Add Cash" + money banners + live admin banners (Rudraksh shop).
- **AI astrologers ONLY** (human = paid = hidden) via `data/repositories.dart`
  `_visible()`. AI chat is free. Clear **"AI" disclosure badge** (deception
  policy). Language globe removed; onboarding languages = English + Hindi only.
- Version bumped to **1.0.0+3**. Restore steps: **`docs/FREE_V1_RESTORE.md`**.
- Tested on device: all money surfaces gone ✓, AI chat works ✓, AI badge ✓,
  Horoscope/Kundli load (ProKerala keys ARE set) ✓, tabs = Home·Consults·Profile ✓.

**STILL TO DO before submitting the Free v1 (pick up here tomorrow):**
1. **"Guest" profile bug** — after onboarding, name showed "Guest" + chart said
   "add details" (birth details didn't persist). Buffer/write code looks correct;
   may be an artifact of the founder's delete-account-and-relogin testing. NEXT:
   do a CLEAN test (full uninstall → fresh install → BRAND-NEW number → full
   onboarding). If it still says Guest → real bug, add logging + fix (cosmetic,
   NOT a review-blocker). If not → was a testing artifact.
2. **Backend config for free AI** (Firestore `config/global`, no deploy):
   set `minWalletToStartPaise: 0` and `freeChatMinutes: 999999`; top up the demo
   account's `chatBonusBalance`. (See FREE_V1_RESTORE.md §2/§3.)
3. **Play Console updates** (do together): Data Safety — remove "Payment info" +
   "Purchase history"; Store listing — no wallet/recharge/paid wording; swap any
   screenshots showing money screens. Financial-features declaration already =
   "no". App access (reviewer login) already set: `+918318259972` / OTP `123456`.
4. **Build the AAB** (`flutter build appbundle --release`, it's 1.0.0+3), hand to
   developer to upload + submit for review.

**Reviewer login (already configured in Play Console → App access):** test number
`+918318259972`, OTP `123456` (Firebase test number, bypasses Play Integrity).
Play App Signing SHA-256 already added to Firebase for `in.asktro.customer`.

**Post-approval (v2 + the earlier fix batch):** see `docs/POST_APPROVAL_FIXES.md`
(8 improvements) and `docs/FREE_V1_RESTORE.md` (turn money back on).

---

## Where we are right now (earlier snapshot — superseded by the pivot above)

**The apps are built, signed, and handed off. Awaiting Play Store submission +
review.** The founder is taking a 2–3 day break and will return with
**post-approval updates**, or sooner if **something gets stuck during Play
review**.

Both apps are **Play-ready and testable today**:

| App | Package ID | AAB (Play) | APK (test) | Signed with | Phone login |
|-----|-----------|-----------|-----------|-------------|-------------|
| Customer | `in.asktro.customer` | ✅ built | ✅ built | shared upload keystore | ✅ works (fingerprints registered, OTP confirmed) |
| Astrologer | `in.asktro.astrologer` | ✅ built | ✅ built | same shared keystore | ✅ works (fingerprints registered) |

Files (on the founder's Mac, under `~/Projects/Asktro/`):
- Customer AAB/APK: `apps/customer/build/app/outputs/...`
- Astrologer AAB: `apps/astrologer/build/app/outputs/bundle/release/app-release.aab`
- Astrologer APK: `apps/astrologer/build/app/outputs/flutter-apk/app-release.apk`

Both AAB + APK for **both** apps have already been sent to an experienced
developer who will handle the Play Console upload + listing forms.

## The signing keystore (critical shared state)

- One keystore signs **both** apps: `asktro-upload-key.jks` (on the Mac, NOT in
  git). Each app points at it via a git-ignored `android/key.properties`
  (astrologer's was `cp`-copied from the customer's this session).
- Key alias: `asktro`. SHA-256: `06:CD:B9:AD:1D:07:01:3D:F8:3A:15:A9:E5:AC:D9:9B:E9:E2:F2:E0:D5:1C:89:C3:C3:6B:E1:0B:B1:5D:70:38`.
  SHA-1: `45:6D:22:AE:82:66:0E:E8:51:B5:E4:BE:2B:E8:C7:B3:36:D5:C7:11`.
- Both fingerprints are registered in Firebase for **both** Android apps.
- ⚠️ Losing this file/password = can never update the apps on Play again.
  (Backup reminder is in POST_LAUNCH.md.)

## The one thing that must happen AFTER Play upload

When each AAB is uploaded, Play re-signs it with **Play App Signing** (a
different Google-managed key). That new SHA-256 (Play Console → App integrity →
App signing) must be added to Firebase for each app, or **phone login fails for
Play-store users** ("missing a valid app identifier / Play Integrity /
reCAPTCHA unsuccessful"). Sideload testing is unaffected. Full steps in
POST_LAUNCH.md (top section). This is the most likely "stuck during review"
support item.

## What this session did (for continuity)

- Fixed customer phone-login on the release build by registering the new
  keystore's SHA-1 + SHA-256 in Firebase (`in.asktro.customer`).
- Made the astrologer app Play-ready: shared the customer keystore via copied
  `key.properties`, built + verified a signed AAB + APK, registered its
  fingerprints in Firebase (`in.asktro.astrologer`).
- Expanded `docs/POST_LAUNCH.md`: Play App Signing SHA step, keystore backup
  warning, astrologer Play-readiness, `versionCode` bump rule, sideload
  uninstall gotcha, Node 20 → 22 runtime deprecation plan.
- Earlier in the session (see git log + prior summary): app-speed overhaul,
  chat unread-badge + high-priority push, purple Mall icon / removed Alerts tab,
  astrologer app cleanup, testimonial overflow fix, portal delete-astrologer.

## ⚠️ Post-approval fix batch — see `docs/POST_APPROVAL_FIXES.md`

The founder gave a refined list of 8 issues to fix as a **v1.0.1 update AFTER Play
approval** (developer is uploading the current 1.0.0 AAB for review; must NOT be
disturbed). Full diagnosis, per-issue file:line references, rebuild/backend/config
classification, batch decision (6 now, 2 deferred), reviewer test-login status,
and open confirmations all live in **`docs/POST_APPROVAL_FIXES.md`**. Read it
before doing any of this work. Nothing is built/deployed yet — awaiting the
founder's "go" after approval.

## Open items when we resume (none block launch)

- **Post-upload:** add Play App Signing SHA-256 to Firebase (both apps).
- **First week live:** App Check monitor→enforce (task #32); one live-money
  reconciliation test (#57); rotate admin password + portal MFA (#31).
- **Content:** finish real astrologer portraits, remove filler (#63).
- **Grow-into-it:** home rails→server (#47), search backend (#48), Gemini
  caching (#50), R8 shrinking, font bundling.
- **iOS (separate track):** Apple IAP decision for the AI astrologer (#55).
- **Housekeeping:** Node 20→22 bump, dep updates, strip dead Vastu code, 2px
  astrologer overflow (#30).

## Working notes (from CLAUDE.md — keep following)

- **One step at a time.** Give the founder a single command/action, then wait.
- Founder is non-technical — plain English, short answers, no walls of text.
- Deploy from the Mac using the service-account key (never `firebase login`);
  functions one at a time; new callables need a Cloud Run invoker grant.
- Branch for this work: `claude/asktro-session-handoff-o1ggo8`.

---

## 🟡 ZODIA — white-label demo clone (built for a sales prospect)

**Why:** the founder sells the platform as an IT company; built a rebranded clone
to demo live to a lead. **NOT for Play** — local demo only.

**What it is:** full copies of all 3 products in separate folders (Asktro 100%
untouched, git-verified):
- `apps/zodia_customer` (label **Zodia**, id `in.zodia.customer`)
- `apps/zodia_astrologer` (label **Zodia Astrologer**, id `in.zodia.astrologer`)
- `apps/zodia_admin` (**ZODIA Admin** portal)
- `packages/zodia_shared` (its own copy of shared_flutter; Zodia apps point here)

**Branding:** white + gold-yellow (primary `#F5B301`, charcoal UI `#2B2417`).
Recoloured via scripted hex maps (tokens + inline hex + portal CSS). Generated
Zodia icon/emblem/wordmark (gold tile + charcoal "Z"), recoloured zodiac wheels.
`kMonetizationEnabled = true` → ALL paid features on (wallet, Mall, human
astrologers, per-min pricing, Razorpay, calls, kundli paywall).

**Backend = REUSE Asktro's** (Blaze not available for a separate project, so
`zodia-4a766` is parked). `firebase_options.dart` still points to
`asktro-tech-provate-limited`. So the Zodia demo READS/WRITES Asktro's live DB.
- ⚠️ Admin actions in the Zodia portal are REAL on Asktro's backend. During demo
  do NOT: send broadcasts (hit real users), change global config/pricing (Asktro
  free-v1 depends on it while in review), or delete real data.
- The one demo write: a human demo astrologer **demo@zodia.in** (hidden in
  Asktro's free-v1 customer app because it filters to AI-only, so it won't affect
  review).

**Demo logins:** customer app → test number `+918318259972` / OTP `123456`;
astrologer app → `demo@zodia.in` / (password set at creation); portal → Asktro
admin creds.

**Build/run (Mac):** `flutter pub get` + `dart run flutter_launcher_icons` +
`flutter run --release -d <device>` per app; portal: `cp ../admin/.env.local
.env.local && npm install && npm run dev`. All three verified working on device.

**To make Zodia a real product later:** enable Blaze on `zodia-4a766`, point both
`firebase_options.dart` + portal `.env.local` at it, deploy functions/rules,
seed data, register app SHAs for real phone auth.

---

## 🔑 POST-APPROVAL PLAN (founder's intent — do NOT do before Play approval)

Two separate post-approval tasks the founder wants remembered:

**1. Turn ALL paused features back on (v2).** For the first Play approval the app
ships FREE with money features HIDDEN via `kMonetizationEnabled = false`
(everything hidden, nothing deleted). AFTER approval (and once the org/D-U-N-S
account lands), flip `kMonetizationEnabled = true` and follow
`docs/FREE_V1_RESTORE.md` to restore wallet/Razorpay/human astrologers/pricing/
mall/etc., plus the paid privacy + account-deletion pages, then ship the 8-issue
batch in `docs/POST_APPROVAL_FIXES.md`. Reviewed normally by Google as v2.

**2. Transfer the Firebase/GCP project off the founder's personal email + card.**
After approval, move ownership + billing of `asktro-tech-provate-limited` from the
founder's PERSONAL Google account/card to a different email/entity (ideally the
company/organization). Key facts to reuse:
- It is an OWNERSHIP + BILLING reassignment, NOT a data migration — Functions,
  Firestore, Auth, data all stay in place; nothing rebuilds.
- Ownership: GCP/Firebase IAM → add the new account as Owner, confirm, then remove
  the personal one. Always keep ≥1 Owner during the switch (add new before remove).
- Billing: set up the new billing account/card first, then link the project to it
  and unlink the old — GCP Console → Billing.
- Optionally migrate the project INTO the company Google Cloud Organization.
- Play Store developer-account transfer is a SEPARATE process if ever wanted.
- Timing: ONLY after Play approval / when stable — not during review.

---

## 📌 UPDATE — 18 Aug 2026: Applied for Production access

Closed test completed (12+ testers, 14 continuous days). Filled the 3-step
"Apply for access to production" questionnaire (closed test / about app /
readiness) with honest answers and clicked **Apply**. Now awaiting Google's
**production-access review** (typically a few days, up to ~7).

NEXT once access is granted:
1. Create a **Production release** (same build, versionCode 3 / 1.0.0+3), roll out.
2. It goes through the normal app review, then publishes to the public store.
3. Post-launch: the v2 restore (money features back on) + project ownership/billing
   transfer — see sections above.

---

## 🚀 UPDATE — 1 Sept 2026: LIVE ON PLAY STORE + 3 post-launch fixes

Asktro is **LIVE on the public Google Play Store (India)**, free-v1
(`kMonetizationEnabled = false`). Timeline: production release submitted
22 Aug → rejected 27 Aug (content-rating) → fixed + resubmitted same day →
**approved & published ~31 Aug**. App status: Production, `in.asktro.customer`.

Three production-only issues surfaced on the live app and were all fixed
(none required code changes — all config/account/data):

**1. Content-rating rejection (fixed 27 Aug).** Google/IARC rated the app
**"Adults Only 18+"** everywhere → rejected as an inaccurate rating. Cause: the
original content-rating questionnaire (25 Jul) had answered YES to **cash
rewards / gambling with cash payouts**, user-to-user interaction, and shares
location — describing a gambling app. Fix: retook the questionnaire in Play
Console (App content → Content rating → Start new questionnaire), category
**"All other app types"**, answered honestly — only "Online content = Yes" (AI
content), everything else No. New rating: **Everyone / PEGI 3 / All ages / 3+**.
Resubmitted; approved. NOTE for v2: turning ON in-app purchases → answer
"purchase digital goods = Yes"; that does NOT raise the rating to 18+ (purchases
≠ gambling). Never answer the gambling/cash-rewards questions Yes.

**2. Login OTP failed on the live app** — "This app is not authorized to use
Firebase Authentication … play_integrity_token was passed, but no matching
SHA-256 was registered." Cause: **Play App Signing** re-signs the distributed
app with Google's key, whose SHA-256 was never in Firebase (only the upload/local
keys were, which is why test builds worked). The app is enrolled in Play
**"Quantum-ready (beta)"** signing. Fix: added ALL app-signing fingerprints to
Firebase Console → Project settings → Android app `in.asktro.customer` → SHA
certificate fingerprints. The DECISIVE one was the real app-signing cert from the
**Digital Asset Links JSON** on the Play App-signing page:
`BF:F9:43:CB:6A:55:86:E0:84:A5:AD:60:66:ED:45:A7:D6:4A:2E:1F:95:30:4A:6B:3C:E7:9E:C7:D6:D0:FB:B6`
(the classical/post-quantum key fingerprints alone were NOT enough — that
Digital-Asset-Links SHA-256 is the one Play Integrity actually checks). Server-side
change, no app rebuild. To re-check later: Play Console → Test and release →
"Protected with Play" → Manage Play app signing → Digital Asset Links JSON.

**3. Kundli chart image blank + AI astrologer silent after 1 msg.** Both traced
(via Cloud Functions logs → Logs Explorer) to the SAME root: **ProKerala API
429 "rate limit of 5 requests per 60 seconds"** — the account was on ProKerala's
**FREE plan** (5 req/min, 5,000 credits). One user opening kundli + chat fires
5–7 ProKerala calls at once → over the cap → 429. The AI stays silent by design
when it can't build the chart (`onAiChatMessage: no chart` in logs is misleading —
it's the 429, not missing birth data; birth data was present and correct).
- ProKerala account confirmed correct: **"Asktro Tech"** account, Live Client ID
  `518d3b23-53e5-40da-a1b4-cbd8a2a6d121`, which MATCHES the app's
  `PROKERALA_CLIENT_ID` secret (GCP Secret Manager, latest version) — so no
  wrong-account issue.
- **Fix: subscribed to ProKerala "Emerald" plan** (₹2,499/mo, 350,000 credits,
  **120 req/min**). Takes effect immediately, no app change. AI chat + chart both
  work now. (Ruby ₹999/60-per-min would also have sufficed; Emerald for headroom.)
- One residual: a FAILED kundli fetch during the broken window had cached an EMPTY
  chart at `users/{uid}/astro/kundli` (client caches `chartSvg:null`). Cleared it
  manually in Firestore to prove the fix; the chart then loaded fresh.

### ⏭️ QUEUED CODE FIX — apply ONLY right before the next app release (founder said no code changes now)
In `apps/customer/lib/data/prokerala_repository.dart` `janamKundli()`:
- On a cache HIT where `chartSvg` is null/empty, **re-fetch the chart** instead of
  serving the stale empty (self-heals every user who got an empty chart cached
  during an outage; today we had to delete the cache doc by hand).
- Also space out / better-cache the ProKerala calls (chat_kundli_card +
  janam_kundli_screen both call `janamKundli`; getOrBuildChart fires 3 parallel
  calls) to cut credit burn and stay under the rate limit as users grow.
These are CLIENT changes → require a new AAB + Play update (faster review than the
first). Do them bundled with the next release, not before.

### Still-to-test on the live build (was mid-checklist)
Google Sign-In button, account deletion flow, push notifications, photo-in-chat,
daily horoscope / panchang / kundli matching, and a Crashlytics glance after real
use. Also confirm no money UI leaks (free-v1 kill switch).
