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

---

## 🔴 PRIORITY-1 BUG (next release) — First-run onboarding lost → new user lands as "Guest"

**Reported 1 Sept 2026** (a friend installed the live app). Symptom: user completes
ALL onboarding (name, DOB, time, place — place autocomplete worked), logs in via
OTP, reaches Home — but shows as **"Guest"** with **no details fetched**. Because
the birth details never reached the account, **nothing works**: no kundli, no
chart, no AI/astrologer chat. The user only recovered by **re-entering everything
in the Profile tab** (that path writes straight to the account and works).

### Root cause (verified in code, read-only)
Profile setup runs **BEFORE login**, so there's no account yet. The details are
held in a **buffer** (memory + on-disk via SharedPreferences `pending_profile`,
see `apps/customer/lib/app/router.dart` writePendingProfile/readPendingProfile)
and only written to `users/{uid}` **after** login — by `ensureProfile` at sign-in
(`auth_controller.dart _ensureProfile`) and a backstop flush at Home
(`home_gate.dart _flushPendingProfile` → `repositories.dart applyOnboarding`).
When that hand-off misses, `ensureProfile` creates a bare `{name:'Guest'}` doc
(repositories.dart:225 fallback) with no birth details, and the flush has nothing
to apply → user stuck as Guest. It is the **collect-before-login + buffer→flush
design that is fragile** (e.g. app killed/timing during the OTP step). NOT data
loss (recoverable via Profile), and NOT universal (backgrounding ≠ kill; disk
buffer usually survives — which is why the founder's own account worked). Birth
data buffers as plain primitives (`birthDateMs` int, `birthTime` string) so JSON
encoding is NOT the cause. Firestore rules are NOT the blocker (edit-profile writes
the same fields fine).

### No server-side / no-update fix exists (verified)
Onboarding timing, buffer and flush are all **hardcoded in the installed app** —
none read any server config. `firebase_remote_config` is in pubspec but **unused**
(not wired to anything). So this CANNOT be fixed without shipping a new app
version. Only user-side workaround meanwhile: complete details in the **Profile
tab**. There is no way to recover already-lost buffers server-side (the missed
data only ever lived in that device's buffer).

### The durable fix (do in next release — careful + tested)
**Reorder: run profile setup AFTER login**, so details write **directly** to
`users/{uid}` (the same reliable path Profile-edit uses) — no buffer, no hand-off,
no race. Eliminates the whole bug class. (Interim alt = harden the buffer/flush,
but keeps the fragile design — NOT preferred.)

### Ship-safely requirements (founder is anxious the live app not break)
- The live version keeps running unchanged; we publish a NEW tested version.
- **STAGED ROLLOUT** on Play (10% → 50% → 100%), halt if issues.
- **MUST run a real fresh-install end-to-end test** (uninstall → onboard → OTP →
  Home → confirm details landed on the account) BEFORE building the AAB. The
  pre-launch audits reviewed CODE but never ran the true first-run journey — that
  is the gap that let this ship.
- Bundle with the other queued next-release fixes: chart-cache re-fetch, ProKerala
  call spacing/caching, geocoder reliability (Nominatim → proxied paid Places API),
  and notification CTA deep-link options.

### Before coding: measure impact (server-side, zero risk)
Count live users with `name == 'Guest'` / missing `birthDateMs` vs. total in
Firestore to gauge urgency (patch-this-week vs. bundle-with-next-update).

---

## 🟠 NEXT-VERSION UX FIXES (from live testing, 1 Sept 2026) — no code changes yet

Founder is anxious the live app not break; ALL of these are NEXT-RELEASE app
changes, to ship together with a **staged rollout** + a real fresh-device test
(incl. a SLOW-network run). Money features are a SEPARATE discussion (excluded).

### P1 — First-run onboarding "Guest" (see the dedicated priority-1 section above)
UPDATE from testing 1 Sept: reproduced as a **TIMING RACE**, not "left app for OTP."
Founder reset a number, reinstalled, onboarded as "ZZTEST" with auto-OTP on his
(fast) phone → **worked** ("Hi ZZTEST", details fetched). But it **failed on a
friend's device and a second device** (both showed Guest, incl. one with auto-OTP).
So: fast phone/network wins the race (client writes the details before/around the
server `onAuthUserCreate` Guest-doc creation); slower phone/spotty network loses →
Guest with no details. NOT every user, but a real share (slow devices/networks,
common in India). No server-only fix (birth details live on the phone; the server
can't invent them). Durable fix = **onboarding AFTER login → direct, confirmed
write, retry** (kills the race). Files: `auth/onAuthUserCreate.ts` (server Guest
doc, merge:true, guarded on snap.exists but still races), `apps/customer/lib/
features/auth/auth_controller.dart` `_ensureProfile`, `data/repositories.dart`
`ensureProfile`/`applyOnboarding`, `features/home/home_gate.dart` flush,
`app/router.dart` write/readPendingProfile.

### P2 — Onboarding CTA pushed below the fold on some viewports
Reported: on a OnePlus the onboarding CTA (e.g. the "you've got free chat" first
screen) sits far down, only reachable after scrolling — some users won't know to
scroll and think it's broken. Root cause: `apps/customer/lib/features/profile_setup/
onboarding_widgets.dart` `OnboardingScaffold` puts `content` + `footer`(CTA) inside
ONE `SingleChildScrollView` (Expanded) — button scrolls with content, so tall
content/short viewports push it off-screen. It's the SHARED scaffold used by every
onboarding step, so one fix covers all steps. Fix: PIN the CTA to the bottom
(SafeArea/bottomNavigationBar), let only the content scroll above it. Test across
several screen sizes.

### P3 — Free-chat silent failures (from the UX audit — VERIFY live config first)
The free build hides recharge, but the backend still gates chat on a one-time
~3-min free credit (`config/global`: `freeChatMinutes`, `minWalletToStartPaise`;
defaults 3 and 1800 in `firebase/functions/src/common/config.ts`). If those live
values are NOT set to the free-v1 values (`freeChatMinutes` huge / `minWalletToStartPaise`
0 per docs/FREE_V1_RESTORE.md §2), then: (#1 CRITICAL) after the first short chat,
tapping Chat/Chat-again does NOTHING (client `_promptRecharge` early-returns when
`!kMonetizationEnabled`) — `astrologer_profile_screen.dart:57-69`,
`chat_consultation_screen.dart:276-307`; and (#2 MAJOR) the first chat goes
silently dead ~4 min in when the credit exhausts and the session pauses
(`tickConsultation.ts:219` pause; `replyEngine.ts:119` never replies on paused;
client suppresses the paused sheet in free v1 `chat_consultation_screen.dart:631`).
**FIRST STEP (server-side, no app update, low risk): check `config/global` live —
if freeChatMinutes/minWalletToStartPaise aren't the free-v1 values, setting them
makes free chat effectively unlimited and both #1/#2 disappear without a release.**
If a code-side guard is still wanted, add a friendly "your free session ended"
message instead of the silent no-op — that part is an app change.

### P4 — Minor onboarding-timing UI glitches (app change)
- Janam Kundli can show "Please sign in to view your kundli" to a signed-in user if
  the profile stream hasn't emitted yet — `tools/janam_kundli_screen.dart:41-48`.
- Daily Horoscope can lock to Aries (first sign) if opened before the profile loads
  — `tools/horoscope_screen.dart:34-35` (computed once in initState, not re-evaluated).
- Notifications with a plain/offer deeplink do nothing on tap (only remedy + chat
  deeplinks handled) — `features/notifications/notifications_tab.dart:42-66`.

### P5 — Geocoder reliability (birth-place autocomplete)
`apps/customer/lib/data/place_search_service.dart` uses free OpenStreetMap Nominatim
(keyless), which rate-limits/blocks production app traffic and fails silently (empty
suggestions). Swap to a reliable Places API, ideally proxied via a Cloud Function so
the provider can change later without an app update. Add a graceful fallback.

### P6 — Notification CTA deep-link options (portal + app)
Portal push composer has a CTA label + a Deep-link dropdown, but the dropdown only
offers Recharge/Home/specific-astrologer/custom (`apps/admin/src/components/
DeepLinkSelect.tsx`). CTA in-app follows the SAME deeplink via `_followDeeplink`
(`features/home/home_shell.dart:163`) and works for any EXISTING route. Portal-only
(no app update) for routes the app already has (Home, /astrologer/:id). NEEDS app
changes for: destinations with no route yet (generic Chat/consult, Kundli,
Horoscope, Panchang) and for a CTA target DIFFERENT from the notification tap.
NOTE: /recharge, /store, /offers routes EXIST and would open on the LIVE free-v1 app,
exposing hidden money screens — do NOT use those CTAs until v2.

### Queued code-quality/handoff notes (from the audit)
- Zodia is a hard FORK (near-duplicate of Asktro) → fixes often need doing twice;
  Asktro is canonical. Consider a shared-source/flavor approach later.
- Flutter client has almost no tests (backend well-tested). Add tests when touching
  client code.
- `docs/` has sprawled/drifted (README/ARCHITECTURE describe an older/aspirational
  state). Trust code + BILLING_ENGINE.md/DATA_MODEL.md; archive stale planning docs.

---

## v2 Phase 1 IMPLEMENTED — onboarding reorder + OTP redesign (5 Sept 2026)

Branch `claude/asktro-session-handoff-o1ggo8`. Code written but NOT yet
compiled/tested (no Flutter SDK in the remote env) — founder runs `flutter analyze`
+ device tests on the Mac. Live app untouched until a new release is built & rolled out.

### What changed (the "Guest" bug fix — reorder after login)
- **Flow is now: splash → login → OTP → profile setup → home** (was: setup → login →
  home with a fragile pre-login buffer). Setup now writes birth details DIRECTLY to
  `users/{uid}` — no buffer, no hand-off race.
- **Router gate** (`app/router.dart`): a signed-in user with missing ESSENTIALS is
  held at `/setup` and cannot reach Home. Essentials = **name + date of birth + birth
  place WITH coordinates**. Birth time stays optional (unknown → noon, ProKerala still
  called). Helper `profileEssentialsComplete()`. While the profile stream is still
  loading we hold on splash (so a returning complete user never flashes the setup screen).
- **Confirmed save + retry** (`profile_setup_screen.dart` `_saveWithRetry`): writes via
  `UserRepository.ensureProfile`, then read-backs from the SERVER (`essentialsSaved`,
  `Source.server`) to confirm it truly persisted; up to 3 attempts with backoff; bounded
  by timeouts so an offline `set()` can't hang the button. On failure → inline error,
  user held here (never dumped inside half-saved). Details live in widget state, so a
  retry re-sends everything.
- **Place step now REQUIRES a picked result with coordinates** (was: free text allowed).
  This matches the gate and fixes coordless → blank-chart accounts.
- Removed: pre-login buffer (`pendingProfileProvider`, `writePendingProfile`/read/clear,
  `setupDoneProvider`/read/set), `home_gate.dart` (backstop flush), `applyOnboarding`,
  the congrats-screen "Explore More" skip (it would just loop back through the gate).
- `auth_controller._ensureProfile` now just guarantees the base account doc (money
  zeroed); details come from the post-login setup screen.
- Server `onAuthUserCreate.ts` left as-is — its bare `{name:'Guest'}` doc is now just a
  placeholder the gate treats as incomplete (sends user to setup). No race to lose.

### OTP screen redesign (`features/auth/otp_screen.dart`)
- On-brand celestial theme (same zodiac-wheel + scenery bg as Login), AppLogo, Cormorant
  title, sparkle divider — no longer a bare AI-looking TextField.
- 6 segmented cells driven by a transparent field with `AutofillHints.oneTimeCode` →
  **OS SMS auto-fill + auto-submit** at 6 digits; digits-only; paste works.
- "sent to +91 XXXXX XXXXX" + **Wrong number? Change**; **resend timer** (60s); clean
  **Verifying…** state; **gentle shake + inline error** on a wrong code; Android instant-
  verify path handled (login's `onAutoVerified` navigates). Success → `/home` (gate decides).
- CTA pinned to the bottom of every onboarding step (`onboarding_widgets.dart`
  `OnboardingScaffold`) — content scrolls above it. Fixes the below-the-fold CTA bug.

### ⚠ DEPENDENCY / RISK to close before release
- The gate now REQUIRES birth-place coordinates, and the place picker uses **Nominatim**
  (P5), which rate-limits/fails silently in production. If it returns nothing, a user is
  **stuck at the place step**. → **P5 geocoder fix must land in this same v2** (reliable
  Places API, proxied, with graceful fallback). Until then, testers must pick a place
  from the dropdown. This is the one hard coupling introduced by the coords requirement.
- Existing v1 accounts with no coords (or name still "Guest") will be sent to `/setup`
  once on next launch to complete details — a one-time, self-healing re-entry (their
  charts were blank anyway). Expected, not a bug.

### Founder's next action
Pull on the Mac and run `flutter analyze` in `apps/customer` (I can't compile here).

---

## v2 — Offline birth-place atlas built (P5 resolved) + ghost-session cleanup (5 Sept 2026)

### Offline India atlas (fixes the coords-gate ↔ geocoder coupling)
The birth-place picker no longer depends on the free Nominatim service at runtime.
It now searches an **offline atlas bundled in the app** — generated from the
**GeoNames India** dump: **548,202 places** (cities/towns/villages), each with
coordinates and **state (100% tagged)**. ~10× AstroSage's ~50k. This is what makes
the coords-required onboarding gate safe at scale (no throttling, works offline).

- Assets: `apps/customer/assets/geo/` — 390 shard files (~15 MB uncompressed;
  compresses in the APK), sharded by first 2 letters of the place name, each
  pre-sorted by population so best-known places surface first.
- Search + online fallback: `apps/customer/lib/data/place_search_service.dart`
  (offline first; Nominatim only when a place isn't in the atlas — rarely hit).
- Generator + how-to-regenerate: `tools/geodata/build_atlas.js` + `tools/geodata/README.md`.
  The raw GeoNames dump is NOT committed (only the generated shards).
- Verified: Mumbai/Delhi/Bengaluru/Kolkata/Patna/Varanasi/Meerut resolve with
  correct coords + state; "Rampur" alone has ~993 distinct village entries.
- Known minor limitation: same-named villages in the same state show as similar
  "Name, State" rows (district name not shown). District-level disambiguation
  would need the GeoNames admin2 file — deferred, not blocking.

### Ghost "Active Consultations = 1" on the admin dashboard
Root cause: the dashboard card counts ALL `consultations` with `status=='active'`
globally; a chat session got stuck `active` (its end/tick write never landed) and
the 1-min sweeper can't catch an `active` doc that has no `lastTickAt` (its query
filters on that field). No money impact (v1 free) — a display ghost.
- One-time cleanup script: `firebase/functions/scripts/closeStaleConsultations.js`
  (run on the Mac with the service-account key; safe — only closes sessions idle
  >30 min). TODO (v2 hardening): make sweepSessions also reap `active` docs with
  no `lastTickAt` so this can't recur.

---

## v2 Phase 2 — Monetization turned on (5 Sept 2026)

`kMonetizationEnabled = true`. Money model: **AI chat FREE, human consults PAID
(wallet/Razorpay), Kundli FREE, Mall PAID (Razorpay-direct).**

### Code changes
- **AI is now structurally FREE** (not config-dependent):
  - `billing/createConsultation.ts`: AI (`astrologer.isAI`) → `price = 0` and the
    `minWalletToStartPaise` start-gate is **skipped** for AI. Humans keep real
    per-type rate + the gate.
  - `billing/tickConsultation.ts` `applyTick`: **short-circuits for `c.isAI`** —
    never charges, never money-pauses, never touches balances; still advances
    presence markers so the idle/disconnect cleanup lifecycle is unchanged.
- **Kundli stays FREE**: new flag `kKundliMatchPaid = false` (feature_flags.dart),
  separate from `kMonetizationEnabled`. `kundali_match_screen.dart` now gates the
  ₹49 paywall/badge/label on `kKundliMatchPaid` (v3 flips it when a compliant paid
  flow exists). The paid server fn `purchaseKundliMatch` simply goes unused.
- **AI shows no price / no cost UI**: rate badge hidden for AI in
  `astrologer_card.dart`, `astrologer_profile_screen.dart`, `home_feed.dart`
  (`&& !a.isAI`); chat countdown + low-balance warnings suppressed for AI
  (`chat_consultation_screen.dart`); AI consult-end hides charge/receipt rows
  (`consultation_end.dart`). Support FAQ copy updated (AI free / human paid).
- Verified: `tsc --noEmit` clean on functions; Flutter analyze pending on Mac.
- Dev "dummy gateway" recharge (`admin/devTools.ts`) confirmed SAFE — hard-locked
  to the local emulator (`FUNCTIONS_EMULATOR`), permanently inert in production.
- Mall confirmed Razorpay-direct, never wallet/bonus (audit) — no change needed.

### REQUIRED before/at v2 release (NOT code — do these or it leaks money)
1. **Deploy the two changed functions** (existing → redeploy, no invoker grant):
   `firebase deploy --only functions:createConsultation` then
   `...functions:tickConsultation` (one at a time, service-account key). Deploy
   BEFORE/with the app release — they're backward-compatible (live AI stays free).
2. **Firestore `config/global` (edit live, no deploy):**
   - `minWalletToStartPaise` → **1800** (₹18 min to start a HUMAN consult; AI ignores it).
   - `freeChatMinutes` → **small (e.g. 3) or 0**. It is currently **999999** (free-v1
     hack). LEFT HUGE IT IS A LEAK: it mints a huge `chatBonusBalance` welcome credit
     that is spendable on **base-rate human chats**, so new users could chat with a
     ₹9-rate human for free forever. Must be reduced for v2.
3. **Human astrologer rates:** set human rates **above the ₹9 base** (config
   `consultationPricePerMinutePaise`) so the chat-only welcome credit
   (`chatBonusBalance`) can't be spent on them (`chatCreditEligible` is true only
   for AI or base-rate chats). Also consider zeroing existing ~33 users'
   `chatBonusBalance` (low risk — friends/family).
4. **Portal data:** delete the fake demo astrologers (`seed_astrologers.mjs` names,
   stock photos) + placeholder products; add 2-3 REAL astrologers (founder + friends)
   and real products before submitting. Astrologers/products are portal-managed — no
   app update needed to add/remove later.
5. **Play Console:** declare financial features truthfully; Data safety → add
   Payment info + Purchase history; store listing/screenshots may show wallet/
   consults/Mall (do NOT headline "paid AI" — AI is free).

### Still open in later phases
- Notification-CTA fix (Phase 3), scale/AI-cost kill-switch + sweeper ghost-active
  hardening (Phase 4), full device test + staged rollout (Phase 5).

---

## v2 Phase 3 — notification CTA fix + minor timing bugs (5 Sept 2026)

### Notification CTA now has its OWN destination (separate from the tap)
- Backend `notifications/sender.ts`: new `ctaDeeplink` carried through
  `BroadcastParams` → `buildNotifDoc` → both push payloads (per-user trigger +
  topic) and the finalized broadcast record.
- App `home_shell.dart`: the promo-popup CTA now navigates to `ctaDeeplink`
  (falls back to the tap `deeplink` when empty).
- Portal `broadcast/page.tsx`: added a "Button (CTA) — go to" picker (shown for
  half/full popups); `DeepLinkSelect` destinations expanded with **Asktro Mall
  (/store)** and **Offers (/offers)** (valid now that money is on).
- Deploy at release: redeploy functions `onNotificationCreated` + `sendBroadcast`;
  redeploy the admin portal (Vercel). Routes with no app route yet (Kundli/
  Horoscope/Chat tab) are still not offered as destinations — deferred.

### Minor timing bugs fixed (app)
- `notifications/notifications_tab.dart`: tapping a notification with a plain
  route deeplink ('/store', '/recharge', 'asktro://…') now follows it (was a dead
  tap; only remedy/chat worked).
- `tools/janam_kundli_screen.dart`: waits briefly for the profile stream before
  deciding — a signed-in user no longer sees a spurious "Please sign in" flash.
- `tools/horoscope_screen.dart`: waits for the real birth date and corrects the
  zodiac sign (was locking to Aries if opened before the profile loaded); a manual
  sign pick is respected and never overridden by a late profile emission.

Verified: functions + admin `tsc --noEmit` clean. Flutter analyze pending on Mac.

### Deferred to Phase 5
Visual rendering QA of promos/onboarding on multiple screen sizes (needs a device).

---

## v2 Phase 4 — AI cost controls + real/AI home sections (5 Sept 2026)

### AI cost controls (config/global — change LIVE, no app update)
In `ai/replyEngine.ts` `onAiChatMessage`, before any Gemini/chart work:
- **`aiEnabled`** (bool; default/absent = on). Set **`false`** to stop ALL AI
  replies instantly — kills the Gemini bill. The user gets a polite "AI is
  resting, try a human astrologer" note instead of silence.
- **`aiDailyMessageCap`** (number; 0/absent = **unlimited**). Per-user daily free
  AI message cap; when hit, the user is told to come back tomorrow / consult a
  human. Counter stored on `users/{uid}.aiUsage {date,count}`, resets daily (UTC).
Both are plain fields on the `config/global` Firestore doc — edit in the console
or portal; no deploy, no app update. Default behaviour unchanged (AI free +
unlimited) until the founder decides to cap/kill.

### Home: real astrologers spotlighted, AI clearly separate
- `repositories.dart`: `watchTopHuman()` + `watchTopAI()` (filter `isAI`).
- `home_feed.dart`: top rails are now **"Talk to a Real Astrologer"** (human,
  paid — shown FIRST; `hideWhenEmpty` so it doesn't appear until real humans are
  added from the portal) then **"AI Astrologers · Free to chat"**; "Rising Stars"
  stays mixed below. AI cards already carry the required **AI badge** (unchanged).
- `_AstroCarousel` gained a `hideWhenEmpty` flag (whole rail renders nothing —
  header included — while empty).

### Notes
- Sweeper ghost-active hardening: now LOW risk — with the AI free short-circuit
  advancing `lastTickAt`, every active session has a tick marker so `billStaleActive`
  catches stale ones; the old ghosts were legacy and the cleanup script handles
  them. A null-`lastTickAt` reaper branch is deferred (would need a new index).
- Security: covered by the pre-flip audit — rules enforce zeroed money on create +
  notChanging on update; dev dummy-gateway is emulator-locked; Mall is
  Razorpay-direct; recharge is idempotent with a dead-letter + reconcile.

Verified: functions `tsc --noEmit` clean. Flutter analyze pending on Mac.

---

## Backlog / future maintenance (NOT for this v2 release)
- **Node.js 20 runtime upgrade** (Cloud Functions): Node 20 deprecated 30 Apr 2026,
  decommissioned 30 Oct 2026. Bump the functions runtime (e.g. Node 22) + redeploy.
  Backend-only — NO app update. Do before Oct 2026.
- **Trailing-comma lint cleanup** — ✅ DONE (5 Sept 2026). Ran `dart fix --apply
  --code=require_trailing_commas` in `apps/customer` (54 fixes / 10 files),
  verified with `flutter analyze` (0 errors, down to 7 harmless cosmetic infos),
  committed + pushed to `claude/asktro-session-handoff-o1ggo8`. Also fixed a
  stray accidental terminal-command paste in `lib/preview.dart` (restored from
  the clean repo copy — it was a local-only Mac corruption). Remaining 7 infos
  (unnecessary_import / curly_braces / prefer_const in
  `chat_consultation_screen.dart`) are also auto-fixable via `dart fix` if we
  want a fully clean analyze later; harmless.

## Backlog (added 5 Sept 2026) — app size reduction (a FUTURE version)
- **Enable R8/ProGuard code shrinking + upload the deobfuscation (mapping) file.**
  Goal: reduce the per-user DOWNLOAD size (v2 is ~72 MB new-install) — founder
  wants smaller downloads for users at scale. Also gives readable native crash
  reports. NOT done in v2 on purpose (enabling shrinking hastily before a launch
  can break things). Do it CAREFULLY in a later app update: set `minifyEnabled`
  (+ shrinkResources) in `apps/customer/android/app/build.gradle`, add proper
  `-keep` rules, test the full app end-to-end (Razorpay, Agora, Firebase, deep
  links), then upload the `mapping.txt` with the release. App change → needs an
  app update. Pair with the Node 20 runtime bump already listed above.

## Next task (founder-requested) — Delete astrologer from the portal
Add a **Delete astrologer** action in the admin portal (Astrologer Management),
so no script is needed. Needs: (1) a new admin-only callable `deleteAstrologer`
(firestore.rules keep astrologer delete server-only) that removes the doc (+ its
private/financials subdoc); (2) a Delete button + confirm dialog in
`apps/admin/.../astrologers` (list card or Edit form). Deploy the new function
(NEW callable → needs the Cloud Run invoker grant) + redeploy the portal.
Interim: `firebase/functions/scripts/deleteSeedHumanAstrologers.js` handles bulk
removal by script.

## Pending for NEXT BUILD (fold in before final submission) — added 5 Sept 2026
- **"View all" now filters by rail kind.** The Verified rail and "New
  Astrologers" rail previously both opened the same "All Astrologers" directory
  (humans + AI mixed). Fixed: Verified → View all shows HUMANS only; New
  Astrologers → View all shows AI only; Rising Stars stays MIXED. Files:
  `apps/customer/lib/data/repositories.dart` (search() gained `humansOnly`/
  `aiOnly`), `apps/customer/lib/features/search/search_screen.dart` (passes them
  through), `apps/customer/lib/features/home/home_feed.dart` (`_AstroCarousel`
  gained the flags; Verified rail `humansOnly:true`, New rail `aiOnly:true`).
  Committed + pushed to `claude/asktro-session-handoff-o1ggo8`. NOT yet built to
  a device — verify in the next AAB. (Home rails themselves are already live via
  Firestore snapshots, so newly-added verified astrologers appear instantly — no
  code change needed for "instant show-up".)

## Backlog (added 5 Sept 2026) — per-message push to the ASTROLOGER (backend-only)
**What:** During a LIVE consult, when the CUSTOMER sends a chat message, the
astrologer gets NO push if their phone is locked / app closed. Only the customer
side gets per-message nudges today (`onChatMessageNudge` pushes `customerId`
only). Confirmed by testing on the founder's phone (5 Sept 2026).

**Already works (verified):** astrologer FCM token registration, notification
permission, and delivery — the "New consultation request" push arrives even with
the astrologer phone LOCKED and app CLOSED (via `createConsultation` → a
`notifications` doc with `userId: astrologerId` → `onNotificationCreated`).

**Fix (deferred, NOT a launch blocker — backend-only, NO app update needed):**
extend `firebase/functions/src/notifications/chatNudge.ts` to also nudge the
astrologer when `senderId === customerId` and the astrologer is "away" — mirror
the existing customer branch (throttle + max-nudges). Needs an astrologer-side
"away" signal: check for an `astrologerLastTickAt`/presence field on the consult
(from `presence_heartbeat.dart`/`tickConsultation`); if none exists, either add
one or push on every customer message with the existing throttle. Write a
`notifications` doc with `userId: astrologerId`, `type: 'chat_message'`,
`deeplink: asktro://chat/<consultationId>` (or consultation deeplink). Deploy
`onChatMessageNudge` alone — can ship anytime, even after launch.

## v2 calls (5 Sept 2026) — VOICE on, VIDEO hidden (founder decision)
**Correction to an earlier wrong note:** Agora is NOT removed. The app-level
pubspecs say "agora removed" but it was MOVED to the shared package:
`packages/shared_flutter/pubspec.yaml` → `agora_rtc_engine: ^6.6.3` (6.x has a
proper Android namespace; both apps get the engine transitively). The full call
path is built END-TO-END:
- Engine: `packages/shared_flutter/lib/src/services/call_engine.dart` (join/leave,
  mic/camera, events) + `call_video_view.dart`.
- Token: `firebase/functions/src/agora/token.ts` (`generateAgoraToken`, exported
  in index.ts; 1-hour TTL; distinct uids customer=1/astrologer=2; needs secrets
  `AGORA_APP_ID` + `AGORA_APP_CERTIFICATE`).
- Channel: `createConsultation.ts` sets `agoraChannel` for voice/video.
- Customer UI: `call_consultation_screen.dart` (ringback → join → billing).
- Astrologer UI: `incoming_call.dart` (ring) + `astrologer_consultation_screen.dart`
  (accept → join → `accept()` activates billing when audio connects).

**Founder decision (5 Sept 2026):** v2 ships with VOICE calls ON, VIDEO hidden.
Set in `apps/customer/lib/app/feature_flags.dart`: `kCallsEnabled = true`,
`kVideoEnabled = false`. Every Voice button gated on `kCallsEnabled && !a.isAI`,
every Video button on `kVideoEnabled && !a.isAI` (profile + directory card).

**Voice calls: MEDIA + AUDIO work; a ~10s AUTO-disconnect is still OPEN (5 Sept 2026).**
What's PROVEN good: Agora Analytics (analytics-lab.agora.io) Call Search shows the
test channels (`asktro_…`) with **PCU 2 / ACU 2 (both users joined)**, durations up
to **3 min 38 s**, **0% audio freeze**, and the founder confirmed **both sides could
hear each other and talk**. All app/creds verified correct end to end: App ID
`431bbf9bef6746128fa56474dd3e88bb` (matches Agora "Default Project"), App
Certificate matches exactly, token fetch/parse fine, join options fine, secrets set.
STILL OPEN: with **both phones untouched on a table**, the call **auto-disconnects
at ~10s on its own** (NOT the user hanging up — do not assume that). Note Agora also
logged some calls at 19–52s and one 3m38s, so the cutoff is not a hard 10s every
time — looks intermittent. Root cause NOT yet found; needs FACTS from the
consultation doc (status/endReason/activatedAt/endedAt/billedSeconds/pausedAt/
networkStatus) and/or Cloud Functions logs (tickConsultation / sweepStaleSessions /
endConsultation) around a failing call — do not guess.
Separately FIXED (a display bug, not the disconnect): my diagnostic had set
`errorMessage='Conn: connectionStateConnecting…'` and never cleared it, so a LIVE
call still showed "connecting". Cleaned up `call_engine.dart`:
`onConnectionStateChanged` clears `errorMessage` on `connectionStateConnected`,
`onUserJoined` clears it too, only a real `connectionStateFailed` shows a message,
verbose diagnostic callbacks removed.
HYGIENE: the Agora App Certificate value appeared in chat during diagnosis — rotate
it in the Agora console + re-set `AGORA_APP_CERTIFICATE` + redeploy
`generateAgoraToken` later.

**Video — future phase:** re-enable `kVideoEnabled` once video is tested end to
end. App change → needs an app update.

## Pre-submission MUST-VERIFY (added 5 Sept 2026)
- **Google Sign-In end-to-end on the PRODUCTION-signed build:** tap "Continue with
  Google", pick an account, and confirm it (a) logs in, (b) fetches name + email +
  photo, and (c) creates/links the profile correctly (no duplicate/broken user).
  Google Sign-In needs the OAuth client's SHA registered for EACH signing key:
  Play app-signing SHA (prod) + upload SHA. Verify on the real release/track build,
  not a debug APK.
- **Voice call holds (no ~10s drop) on two devices** with billing running — see the
  calls section above. Gate the final build on this.
- **Testing note (production-safe):** the DEBUG keystore SHA-1/SHA-256 is being
  added to Firebase so debug APKs can do phone-OTP / Google login. Multiple
  fingerprints per app are supported and only the matching build uses each — this
  does NOT affect or risk the production app. (Phone OTP on an unregistered debug
  build falls back to a reCAPTCHA web flow that errors "missing initial state" —
  that was the debug login failure seen 5 Sept 2026, not an app bug.)
