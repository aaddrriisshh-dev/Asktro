# Asktro — Pre-Launch Plan (single source of truth)

_Last updated: 2026-07-20._

**Why this doc exists.** The older tracking docs (`AUDIT.md`, `OUTSTANDING.md`,
`MASTER_TODO.md`, `WHATS_LEFT.md`, `PRODUCTION_READINESS_AUDIT.md`,
`PRE_LAUNCH.md`) were written on different dates and **contradict each other** —
`AUDIT.md` lists money/auth bugs as _open_ that the newer docs + the completed
engineering work have since _fixed & deployed_. This file reconciles them into
one honest checklist. When in doubt, this doc wins.

**Bottom line:** the scary P0/P1 money & auth bugs are **fixed** (money-path
tests, webhook dead-letter, billing caps, full account-deletion, rules
hardening, append-only ledger, etc. — all shipped this cycle). What remains is
mostly **legal/store content, ship mechanics (keystore/accounts/IDs), a couple
of auth toggles, and ONE authoritative live-money test** — plus the **iOS
payments decision** below.

Status legend: 🔴 blocker · 🟡 verify (claimed fixed) · 🟢 done · ⏸️ deferred

---

## 0. Deployment status — 2026-07-20 (what is LIVE right now)  🟢

The full backend batch is **deployed and verified in production**. This settles a
lot of the checklist below.

- **Cloud Functions: 66/66 deployed** ✅ — verified against `index.ts` via
  `firebase functions:list` (all `asia-south1` except `onChatImageUploaded` in
  `us-east1` and the v1 `onAuthUserCreate`). Nothing left undeployed. This batch
  re-deployed the **17 changed** functions one-at-a-time (the bulk deploy 409s on
  this project until the Node-20→22 bump); the other 49 were already live.
  - Included: **Phase 0 security** (admin-tier gates, astrologer self-edit
    lockdown, token/session revocation, PII read-scoping), **Phase 1 money**
    (sub-second remainder, promo-farm close, coupon rate-limit, store-order
    dead-letter + NaN reject), the **per-tick transaction consolidation**, and
    **Phase 2 #45/#49** (AI persona out of the settlement txn; sendBroadcast
    hardening) + store-confirm reconcile.
- **Firestore + Storage rules: deployed** ✅ — Phase 0/1/3 hardening live
  (astrologer self-edit lockdown, money-read scoping, store coupon/redemption
  gates, remedies-update allowlist, storage content-type allowlists).
- **Admin portal (Vercel): deployed** ✅ — `asktro-admin.vercel.app` rebuilt,
  including the live-sessions realtime fix.
- **#38 dead-air overcharge fix — DEPLOYED (2026-07-20)** ✅ — `tickConsultation` /
  `endConsultation` / `sweepStaleSessions` redeployed; a dropped/backgrounded party
  can no longer be billed past their last confirmed heartbeat (healthy sessions
  unchanged). 143 unit + 65 integration tests green.
- **Customer app: rebuilt & tested on-device (2026-07-20)** ✅ — runs on the new
  `in.asktro.customer` package with phone + Google auth + data intact, plus the
  login redesign (real Google logo, dedicated Disclaimer page, passive consent).
  A store-uploadable **release** build still needs the keystore (§2.C).

### The "scattered transactions" (`−2, −1, −3, −5…`) fix — LIVE ✅
The confusing per-tick rows are **gone for new sessions.** The wallet still debits
live every ~10s tick, but the **customer-facing ledger row is now written once at
settlement** as a single line — e.g. *"chat consultation · 12m … −₹108"*
(`tickConsultation.ts:158`, `endConsultation.ts:168`, both deployed). It is a
**backend** fix (no app rebuild needed) and it is **independent of the AI-persona
work** — that item was separately deferred. Note: **old** consultations keep their
existing scattered history; only sessions from 2026-07-20 onward show the clean row.

---

## 1. iOS payments / Apple IAP decision  🔴 DECISION NEEDED (not code yet)

**The rule (Apple Guideline 3.1.1):** anything that's a **digital good/service
consumed inside the app** must be sold through **Apple's In-App Purchase (IAP)**,
on which Apple takes **15–30%**. You **cannot** use an outside processor
(Razorpay/Stripe/etc.) for digital content on iOS. IAP is not a card type — it's
Apple acting as checkout, charging whatever the user has on their Apple ID (in
India: **UPI**, cards incl. RuPay, net-banking, Apple Pay, carrier billing,
Apple balance), then paying you monthly minus the cut.

**What that means for us — by category:**

| What we sell | iOS accepts | Status |
|---|---|---|
| **Asktro Mall — physical products** | **Razorpay** (Apple *forbids* IAP for physical goods) | ✅ fine as-is |
| **Live 1:1 human astrologer** (realtime) | **Razorpay** allowed under Guideline **3.1.3(e)** (person-to-person realtime services) | ✅ likely fine |
| **AI astrologer** (software, no human — a *digital* service) | **Apple IAP only** (UPI/card *through Apple*, 15–30% cut) | ⚠️ the actual constraint |

The wrinkle is our **single-wallet** model: users recharge one wallet via
Razorpay and spend it on both human and AI. Apple scrutinizes wallets that let
you buy credit externally then spend it on digital content.

**Recommendation — launch Android-first.**
- **Android (Google Play) with Razorpay, exactly as built** → ship now. Most
  Indian astrology apps (AstroTalk, Astroyogi) are Android-dominant for this
  exact reason.
- **iOS — decide later**, pick one when we get there:
  1. Add **Apple IAP** for iOS wallet recharge (accept 15–30%; build StoreKit), **or**
  2. On iOS, sell **only human consultations + physical Mall via Razorpay**
     (both allowed) and make **AI free / hidden on iOS** — sidesteps IAP entirely.

**This does NOT block launch** — it blocks *iOS AI monetization*, not the app.
_Caveat: not legal advice; confirm against Apple's guidelines / someone who has
shipped an Indian consultation app on iOS before the iOS submission._

---

## 2. Pre-launch blockers  🔴

### A. Legal / store-rejection (owner content + a little code)

> **FILLED + LIVE IN-APP (2026-07-20)** — the legal content is no longer a draft.
> All placeholders are filled with the **real company details**: Asktro Tech
> Private Limited, registered office **B-76 Sector 64, Gautam Buddha Nagar, Noida,
> UP 201301**, Grievance Officer **Sanjay Tyagi / grievance@asktro.in**,
> support@asktro.in, effective **20 July 2026**, jurisdiction **Noida**. Four pages
> — Privacy, Terms, **Disclaimer** (new), Account-Deletion — are:
> - **Published to the in-app CMS** (`cms/privacy|terms|disclaimer`) → live in the
>   app now via `seed_legal.mjs --yes`; editable in the portal `/cms` without an app
>   update.
> - **Delivered as filled HTML** (`docs/legal/*.html`) to the owner to forward to
>   the web developer for hosting.
>
> **What's LEFT (owner):** (1) developer **hosts** the 4 pages at `asktro.in/privacy`,
> `/terms`, `/disclaimer`, `/account-deletion`; (2) wire the URLs → Play Data Safety
> + Apple App Privacy + Play → App content → Data deletion; (3) a **legal-counsel
> review** pass (recommended, not blocking) — esp. Terms refund (§6) + liability
> (§10) vs. Indian consumer law + DPDP.

- [x] **Legal placeholders filled with real values** — DONE (2026-07-20) in
  `seed_legal.mjs` + all `docs/legal/*.html`; grievance officer aligned with the
  live Razorpay website (Sanjay Tyagi / grievance@asktro.in).
- [x] **In-app legal pages live** — Privacy + Terms + Disclaimer published to the
  CMS; login shows tappable Terms/Privacy/Disclaimer links + a compact
  age/entertainment consent line (AstroTalk-style passive consent).
- [ ] 👤 **Host the 4 filled pages** (`docs/legal/*.html`) at public URLs, then wire
  into Play Data Safety + Apple App Privacy + Play account-deletion. Files ready.
- [ ] 👤 **Legal-counsel review** (recommended, not a launch blocker).
- [x] **In-app "for entertainment purposes" disclaimer + <18 age gate** —
  DONE + **now in the rebuilt customer app** (2026-07-20): login gate reads "I am
  18 or older and agree to…" (required for phone + Google/Apple), plus a visible
  astrology guidance/entertainment disclaimer. Verify on-device by signing out to
  reach the login screen.
- [x] **Chat-image NSFW auto-scan** — DONE + LIVE (2026-07-21): `onChatImageUploaded`
  runs Cloud Vision SafeSearch, auto-deletes + flags adult/violence/racy, alerts
  admins; Vision API enabled on the project and the portal Trust & Safety toggle is
  ON (green). Manual review queue remains as the fallback.
- [x] **AI astrologer reads client photos** — DONE + DEPLOYED (2026-07-21):
  `onAiChatMessage` now does a vision read (palm/face/kundli/object) and replies in
  character instead of ignoring images; safety left ON for image reads so an
  explicit photo is blocked, not described. (Palm-line *accuracy* is a later
  vision-prompt tuning pass.)
- [x] **Chat image upload UX** — DONE (2026-07-21, app-only): camera/gallery choice,
  staged preview + uploading spinner, sends only on tap (was auto-firing on pick).
- [ ] **iOS: Apple IAP decision** (see §1).

### B. Auth / security
- [x] **Admin password rotated** — DONE (2026-07-20) via `seed_admins.mjs` hidden
  prompt (updateUser + revokeRefreshTokens + emailVerified); login confirmed.
- [ ] **Purge the old literal (`Asktro@2026`) from git history** — password is
  rotated so the risk is **defused**, but the literal still lives in repo history
  (`seed_admins.mjs`, `docs/PENDING.md`). Low urgency now; scrub when convenient.
- [x] **Portal MFA/2FA is BUILT** — DONE (2026-07-20): login MFA challenge
  (`login/page.tsx`) + a `/security` TOTP enrollment page. **Activation deferred** —
  it needs a one-way GCIP upgrade + each admin to enroll. Turn on before real money
  flows at scale; the code is ready and shipped in the portal build.
- [ ] **Enable App Check enforcement** on money/cost callables. CORRECTION
  (2026-07-21): this is NOT a mere toggle — there is currently **no**
  `enforceAppCheck` on any callable in `firebase/functions/src` (client attestation
  is initialised but non-enforcing, see `apps/customer/lib/main.dart`). Enforcing
  it is a CODE change (add `enforceAppCheck: true` per callable) that must ship
  ONLY AFTER Play Integrity / App Attest is provisioned and a real attesting build
  is in users' hands — otherwise every recharge/chat call is rejected and the app
  is dead on arrival. Sequence: provision on console → ship attesting build →
  watch App Check metrics in monitor → then enforce + redeploy.

### C. Ship mechanics (owner tasks — literally cannot ship without)
- [ ] **Android release keystore** + `key.properties` (currently debug-signed).
- [x] **Package IDs off `com.example.*`** — DONE + verified on-device (2026-07-20):
  `in.asktro.customer` / `in.asktro.astrologer` (Android applicationId + iOS bundle
  IDs). Both apps re-registered in Firebase with debug SHA-1/256 fingerprints and
  fresh `google-services.json`. Verified: both build & reach login on the new IDs;
  customer confirmed phone + Google auth + data intact. NOTE: `google-services.json`
  is gitignored (re-download from Firebase console if ever needed on a fresh clone);
  the internal Android `namespace` stays `com.example.*` (invisible, harmless).
- [ ] **Google Play ($25) + Apple Developer ($99/yr) accounts.**
- [ ] **iOS APNs push** — Apple Dev account, `.p8` key → Firebase, plist +
  capabilities, real-device test.

### D. The one money task still open
- [ ] **Authoritative live money + commission reconciliation test** on a real
  chat *and* a real call: rate metered == rate shown == astrologer's cut; 3-way
  reconcile (customer debit / astrologer credit / platform cut). The newest doc
  still calls this "the critical item." Everything else money-wise is fixed &
  tested — this is the final confirmation.

---

## 3. Verify — claimed fixed, worth one clean pass  🟡

These are marked done in the engineering task list (#1–29) and `PRE_LAUNCH.md`,
but `AUDIT.md` predates the fixes. Run the money integration tests once green and
move on:
- Customer billed to wallet-zero for absent/force-quit session (liveness gate).
- Razorpay webhook captures payment but never credits (dead-letter + reconcile).
- Uncapped elapsed over-bills a backgrounded client (elapsed clamp).
- Two simultaneous paid sessions (phantom-insert race / lock).
- Refund accounting + astrologer ledger reconciliation after payout.
- Full account deletion (reports, consentRecords, referrals, residual code).

---

## 4. Deferred — safe to punt (NOT launch blockers)  ⏸️

- **Scale-later** (only bite ~5k+ concurrent / ~100k users): sweep sharding,
  distributed counters off hot astrologer doc, broadcast → FCM topics (do NOT
  mass-broadcast until rewritten), `walletTransactions` archival, server-side
  "top rated" ranking, raise `maxInstances`.
- **AI cost / margin audit** — measure the Gemini 3-tier burn vs the ₹9/min
  price. Do **before scaling paid AI usage** (important, but not a launch gate).
- **Persona verticals** (25–30 AI astrologers with tradition/tone knobs) — Phase 4.
- **Memory-recall rebalance** (last-chat vs remedy context) — after multi-user testing.
- **Node 20 → 22** runtime — hard deadline **2026-10-30** (also cures deploy-409),
  not a launch gate.
- **UX polish**: ~~portal live-session views → `onSnapshot`~~ **DONE (2026-07-20)**,
  astrologer typing indicator, banner placements 2–5, safe-card staleness, customer
  app-icon regen, 2px RenderFlex overflow (astrologer, non-fatal).
- **Voice notes in chat** — undecided; do NOT build without go-ahead.

### 4a. Four "non-launch-blockers" reviewed 2026-07-21 — POST-LAUNCH, deliberately not done now

The founder asked whether these are _"not required right now"_ or _"may cause a
problem if we touch them now."_ Honest CTO read on each — none are launch gates:

| # | Item | Why deferred | Not-needed vs risky-now |
|---|---|---|---|
| 47 | Server-side **home rollup** (aggregate the home feed on the backend) | Only bites at thousands of concurrent users; the current per-widget reads are fine at launch scale. | **Both** — not needed now **and** it's an untestable refactor of the home screen that could break a working surface right before launch. |
| 48 | Server-side **astrologer search** | Our catalogue is tiny (dozens, not thousands); client-side filtering is instant. | **Both** — no value at this size **and** touching discovery now risks regressions in a working flow. |
| 50 | **Gemini prompt caching** | Gemini already does **implicit caching for free**, and our prompts are likely **below the explicit-cache minimum token count**, so a manual cache layer probably saves ₹0. | **Not needed** — low risk, just no payoff yet. Revisit inside the §4 AI cost/margin audit. |
| 44 | **Stats sharding** (distributed counters on `dailyStats`) | Only matters at very high write volume; today's rollup triggers are nowhere near a hot-doc contention limit. | **Not needed** — low risk, purely premature at current volume. |

Net: revisit 47/48 only when concurrency actually climbs; fold 50 into the AI
cost audit; 44 waits for real write volume.

---

## 5. Batches shipped this cycle  🟢

### 5b. Audit-fix + deploy batch (2026-07-19 → 20) — DONE & DEPLOYED
See §0. Phase 0 security + Phase 1 money + per-tick transaction consolidation +
Phase 2 #45/#49, all 66 functions verified live, rules deployed, portal deployed.
App-side changes (login disclaimer/age-gate, Mall hero instant-load + portal image
auto-compressor, blog image caching, signOut Google-session clear, displayed-vs-
billed rate label) are **committed** and go live on the **next customer-app build**
(§5c). Store-review audit refreshed (`docs/STORE_REVIEW.md`); legal drafts in
`docs/legal/` (review/host still owner-side).

### 5c. Customer app rebuild — DONE & TESTED ON-DEVICE (2026-07-20)
Built and run on-device on the new `in.asktro.customer` package: phone + Google
auth working, data intact, login redesign visible (real Google logo, Disclaimer
page, passive consent). Package IDs (§2.C) now DONE; the only remaining ship gate
for a **store upload** is the release keystore. Billing consolidation + #38 are
backend and already live regardless of the app build.

### 5a. Design/portal/retention batch (2026-07-18) — DONE
- Asktro **Mall hero** — full redesign, full-bleed, purple outline, subtle 3D
  lift, auto-fit-any-image (reads real aspect ratio).
- Portal **Asktro Mall hero editor** (`homeSections/storeHero`: image + copy).
- Portal **Home Pop-up manager** (`homeSections/popup`: paid/unpaid targeting,
  themes, image, ₹77 preset). _Uploads to `banner_images/` (has Storage rule)._
- Portal **AI Remedy conversations** collapse in the history list.
- Trust banner, home rails, popup delay, banner-popup fix, portal menu colors.

**Reminder:** the AI reply engine **is built & deployed** (greetings, memory,
billing, rate-limit) — `docs/AI_ASTROLOGER_ENGINE.md` is stale where it says
"not built."

---

## 6. Recommended sequence

1. ~~Ship the audit-fix batch (functions + rules + portal).~~ **DONE (2026-07-20)** —
   66/66 functions live, rules + portal deployed. **Customer app build is the only
   ship step left for this batch** (§5c).
2. **Code review + security review** of the diff (already caught 1 real bug —
   the `promo_images` upload folder).
3. Knock out **§2 blockers** — legal content + URLs, keystore/IDs/accounts, auth
   toggles — most are owner tasks that run in parallel.
4. Run the **§2.D live money reconciliation test** — the one thing that gates
   charging real money.
5. **Android-first launch.** iOS follows once §1 is decided.
6. Before scaling spend: the **AI cost/margin audit** (§4).
