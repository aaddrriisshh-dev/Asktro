# ASKTRO — Adversarial Production-Readiness Audit

External investor due-diligence pass. Findings are evidence-cited (`path:line` or a command that was run). Where behaviour could not be executed (no Flutter SDK, no device, no live Razorpay/Agora keys, no Firestore emulator in this environment), it is called out in **"What I Could Not Verify"** rather than inferred silently.

Repo state audited: branch `claude/asktro-session-handoff-o1ggo8` @ `6bd3fa7`. Backend built clean (`npm run build` PASS), backend tests pass (`npx jest` → 22/22), admin portal typechecks clean (`npx tsc --noEmit` exit 0). The two Flutter apps (~19,800 Dart LOC) could **not** be built or analysed — no SDK present.

---

## FINDINGS (severity-sorted)

### P0 — Money or Trust

| # | Finding | Evidence | Reproduction |
|---|---|---|---|
| P0-1 | **No automated test covers any money-*moving* transaction.** Only the two pure, I/O-free modules are tested (`engine.ts` tick math, `razorpay.ts` HMAC). Every function that mutates Firestore balances in a transaction is untested: `creditRecharge`, `applyTick`, `endConsultation`, `pauseResume`, `sweepSessions`, `processPayout`, `adjustWallet`, `validateCoupon`, `referral`. | `npx jest` → only `src/billing/engine.test.ts` + `src/wallet/razorpay.test.ts` run. Test-to-code ratio ≈ **0.8%** (232 test LOC / ~29,780 product LOC). | Run `npx jest`; observe 2 suites, both pure modules. Per the audit rubric, *absence of a test for a money path = Critical*. |
| P0-2 | **"Delete my account" does not delete the sensitive data**, while the UI tells the user it was "permanently" removed. `deleteAccount` scrubs only `users`, `customerProfiles`, `notifications` (capped 500), and the Auth user. It **never touches** `consultations`, `consultations/{id}/messages` (the health/relationship/money free-text chat), `remedies`, `walletTransactions`, `astrologerCustomers` markers, or Storage `chat_images`/`voice_notes`. The docstring claims it "anonymizes historical consultations" — the code never references `consultations`. | `adminAndDeletion.ts:63-98` (only 4 targets); residual collections never referenced. In-app claim: `profile_tab.dart:444` "permanently removes your profile and data". Astrologer retains read of the retained messages via `firestore.rules:137-139`. | DPDP 2023 §12 / GDPR Art. 17 erasure failure **+** consumer misrepresentation. Read `deleteAccount` top-to-bottom; enumerate collections holding the uid; note which are deleted. |

### P1 — Breaks under real use

| # | Finding | Evidence | Reproduction |
|---|---|---|---|
| P1-1 | **Two of four session-recovery sweep jobs throw at runtime (missing composite indexes) → paused sessions never settle; call requests never expire → astrologer permanently locked.** `expirePaused` queries `status==paused && pausedAt<=cut` (needs `status+pausedAt`); `expireWaiting` queries `status==waiting && createdAt<=cut` (needs `status+createdAt`). Neither index exists in the repo. The sweep's try/catch only logs, so they fail silently every run. A `paused` session (balance exhausted or network-loss pause) is never ended → never settled, astrologer earnings never credited; a never-accepted call request keeps `available:false` forever (and `reconcileAvailability` treats a still-`waiting` call as "genuinely busy" and skips freeing it). | `sweepSessions.ts:70-73, 109-112, 39-45, 157`. Committed `consultations` indexes verified: `customerId+createdAt`, `astrologerId+createdAt`, `astrologerId+status+createdAt`, `customerId+status+createdAt`, `status+lastTickAt` — **no `status+pausedAt`, no standalone `status+createdAt`** (`firestore.indexes.json`). | Confirmed by cross-referencing query shapes vs `firestore.indexes.json`. Caveat: an index may have been created out-of-band in the Firebase console (not committed) — **must be checked against the live project**. |
| P1-2 | **Billing continues through a dropped/disconnected call — user pays for dead air.** Billing = elapsed *server* time; there is no counterparty-presence gate and no reconnect auto-pause. `config.reconnectTimeoutSec` (45s) is defined and portal-editable but **never read** by any code. If the customer or astrologer loses network / backgrounds / force-quits, the session stays `active` and `billStaleActive` keeps billing wall-clock time every ~60s until exhaustion. The client heartbeat **discards** the tick `Result`, so a failing tick triggers no client pause/retry/UI signal. | `tickConsultation.ts:56,178` (server time), `sweepSessions.ts:49-63` (bills stale active), `consultation_controller.dart:83-86` (Result discarded), `reconnectTimeoutSec` defined `config.ts:11` / unused (grep). Astrologer liveness is a manual boolean with no heartbeat: `astrologer_repository.dart:17-20`. | Scenario matrix: "astrologer 40s network loss" = **unhandled/over-bills**; "user backgrounds/force-quits" = **partial/over-bills**; "call drops at 4:59" = **partial/over-bills**. |
| P1-3 | **Commission is computed differently depending on how a session ends → incorrect payout.** `endConsultation` uses the per-astrologer commission **snapshotted on the session**; `sweepSessions.expirePaused` credits earnings using the **current global** `config.commissionPercent`. Same session → different astrologer payout depending on whether the user pressed "End" vs. it timed out. | `endConsultation.ts:95-97` (`c.commissionPercent`) vs `sweepSessions.ts:82` (`config.commissionPercent`). | Set a session snapshot commission ≠ global, end via sweep vs manual; earnings differ. |
| P1-4 | **A captured Razorpay payment can be permanently lost with no reconciliation.** The webhook is the documented "authoritative fallback that credits even if the client dies." But on any `creditRecharge` error it logs and **returns HTTP 200** ("ack anyway to avoid retry storms"). If Firestore has a transient blip during the webhook AND the client already died, Razorpay never retries and the money is never credited. No dead-letter, no reconciliation job, no alert. | `recharge.ts:131-140` (200 on failure), `recharge.ts:7-8` (fallback claim). No reconciliation code exists (grep). | Customer pays, gets nothing, nobody is notified. |
| P1-5 | **Every signed-in user can read every astrologer's `earnings`, `pendingPayout`, and your `commissionPercent`.** These money fields sit on the public `astrologers/{id}` directory doc (only email/phone were moved to `private/`). Rule allows any signed-in read of the whole doc. | Rule `firestore.rules:76` (`allow read: if isSignedIn()`); fields written on main doc `createAstrologer.ts:82-84`, incremented `endConsultation.ts:113-117`; parsed client-side `astrologer.dart:98-101`. | Any authed user: `firestore.collection('astrologers').get()` → every astrologer's lifetime earnings + your commission table. |
| P1-6 | **A fake-money-minting function is deployed to production.** `devSimulateRecharge` (exported `index.ts:59`) is gated only by `assertRole('admin')` and writes wallet + `totalRecharge` increments and an immutable ledger row `kind:'recharge'` — **indistinguishable from a real Razorpay recharge** and inflating the revenue/conversion analytics. No kill-switch. Any admin (or a compromised admin token) mints unlimited credit. Sibling `simulateRechargeSelf` (any authed user) is gated only by the mutable flag `config/global.devPaymentsEnabled` (see P2-2). | `devTools.ts:15,44-48`, `index.ts:59`; `simulateRechargeSelf` `devTools.ts:71-88`, `index.ts:63`. | Call `devSimulateRecharge` as any admin. |
| P1-7 | **No refund path exists anywhere.** `refund` appears only as an unused `TxnKind` union member and an unused `pendingRefund` field. A manual `adjustWallet` refund debits the customer but does **not** claw back the astrologer's already-credited `earnings`/`pendingPayout`. | grep `refund` → `types.ts:17`, `onAuthUserCreate.ts:44` only. | "Refund after payout cleared" = **unhandled**. |
| P1-8 | **Consent is collected but never recorded.** The login "I agree to Terms & Privacy" checkbox gates the button but is **local UI state only** — never written to Firestore. No consent timestamp, policy version, or artifact exists. No defensible lawful basis for processing special-category birth+health data. | `login_screen.dart:23,146-154` (`_agreed` local); `onAuthUserCreate.ts:33-49` + user model carry no consent field. | DPDP §6 requires recorded, verifiable consent. |
| P1-9 | **Zero content moderation** on a two-sided, paid, per-minute chat + image channel. No report-user, block-user, profanity/NSFW filter, or image scanning. | grep `moderat|nsfw|report.?user|block.?user|content.?filter|safeSearch|detectLabels` across all surfaces → no matches. Images uploaded straight to Storage `chat_consultation_screen.dart:192`. | Apple UGC 1.2 / Play UGC rejection risk + safety liability. |
| P1-10 | **Apple IAP exposure.** Wallet credit is sold via Razorpay and then spent on in-app per-minute digital consultations. Apple 3.1.1 requires IAP for in-app digital credit; the prepaid consumable wallet is the exposed part. | `recharge_screen.dart:5,54-57,137` (Razorpay) → billing engine spends it. | Likely App Store rejection. |

### P2 — Breaks under scale (and lesser money/quality defects)

| # | Finding | Evidence |
|---|---|---|
| P2-1 | **Concurrent-paid-session ceiling ≈ 5,000, then bills delay/drop.** Each active paid session writes 1 `walletTransactions` ledger row per ~10s tick = 0.1 writes/s/session; Firestore ~500 writes/s/collection (worsened by the monotonic `createdAt` auto-index hotspot) → **500 ÷ 0.1 = ~5,000 concurrent paid sessions**. Within ~1 order of magnitude of the "20k users" target. Compute (`concurrency:80 × maxInstances:100` = 8,000 in-flight) is *not* the first limit. | `tickConsultation.ts:121-131`, `index.ts:16-17`, `consultation_controller.dart:67`. |
| P2-2 | **`simulateRechargeSelf`** (free self-credit for any authed user) is one Super-Admin config write away from live abuse. `devPaymentsEnabled` defaults off but is a mutable flag, not a build exclusion. | `devTools.ts:71-88`, `firestore.rules:238`. |
| P2-3 | **Portal loads whole collections with no bound** → dies at 20k. `useCollection('users')` is a live `onSnapshot` over all users (pagination only `.slice()`s an already-fully-loaded array); `UsersActivityTable` full-scans `users` **and** `consultations`; `SessionsConsole` reads every consultation of a type ever; `reports` exports whole collections. | `users/page.tsx:54` + `hooks.ts:33-42`; `UsersActivityTable.tsx:48-49`; `SessionsConsole.tsx:36`; `reports/page.tsx:100-103`. |
| P2-4 | **N+1 / sequential fan-out in the sweep.** `reconcileAvailability` issues a per-astrologer `.get()` (up to 300/min); `billStaleActive`/`expirePaused`/`expireWaiting` run one `runTransaction` per doc sequentially, ~40-60s to clear 200 — filling the 1-min window. Sweep is hard-capped at 200/300 per run, so a backlog >200 stale sessions is never drained. | `sweepSessions.ts:142-162, 58-62, 55/72/111/146`. |
| P2-5 | **Per-tick rounding overcharges customers on rates not divisible by 60.** `chargeForSeconds = round(pricePerSecond × elapsedSec)` runs per ~10s tick; rounding accumulates. Default ₹9/min (15p/s) is exact (0 impact), but per-astrologer `ratePerMinutePaise` is unconstrained → e.g. ₹10/min = ~0.2% systematic overcharge. | `money.ts:35-38`, `engine.ts:81`, `createConsultation.ts:94-97`. |
| P2-6 | **No rate-limiting / App Check on any callable.** `validateCoupon` returns distinct `COUPON_NOT_FOUND` vs `COUPON_INACTIVE` → brute-force enumeration oracle, unthrottled. `createRechargeOrder` = unbounded live order creation. OTP throttling is 100% Firebase defaults (nothing in-code). | grep `enforceAppCheck|ratelimit|throttle` → none; `validateCoupon.ts:23`. |
| P2-7 | **"Ghost online."** Astrologer presence is a manual boolean with no heartbeat / `onDisconnect` / TTL. A crashed or network-dropped astrologer app shows "online" forever; `createConsultation` trusts the stale bit and creates sessions no one accepts. | `astrologer_repository.dart:17-20`, `createConsultation.ts:61`, `repositories.dart:30`. |
| P2-8 | **Admin sub-tiers are UI-only for reads.** `canSeeMoney` = super-only in React, but Firestore lets *any* admin read `walletTransactions`, `astrologers` earnings, `auditLogs`. An "Astrology-tier" admin can reconstruct all revenue/commission the UI hides. (Sensitive *writes* ARE server-enforced.) | `roles.ts:48-50`, `layout.tsx:42-48` (UI) vs `firestore.rules:163,249,253`. |
| P2-9 | **Silent field-contract break:** functions write `startTime`/`endTime`; the Dart model reads `startTimeMs`/`endTimeMs` (never written) → always `null`. No live consumer yet, but any future "session duration" feature reads null. | Writer `createConsultation.ts:148-149`, `types.ts:48-49`; reader `consultation.dart:100-101`. |
| P2-10 | **Astrologer earnings have no ledger / double-entry.** `earnings`/`pendingPayout` are bare counters; `writeLedger` is never called for an astrologer. Nothing append-only to reconcile a payout against if a counter drifts. | `endConsultation.ts:113-117`, grep `writeLedger`. |
| P2-11 | **Customer ledger running-balance doesn't reconcile for chat-credit sessions.** Ledger `balanceBefore/After = wallet0 + combinedBonus`, where `combinedBonus` folds in the *separate* `chatBonusBalance` field → won't tie to `walletBalance + bonusBalance`. | `tickConsultation.ts:66-67,126-128`. |
| P2-12 | **Recharge dedupe is per `paymentId`, not per `orderId`.** Two distinct captured payments on one order would credit twice; relies on Razorpay's one-capture-per-order guarantee, no server guard. | `creditRecharge.ts:33-44`. |
| P2-13 | **No app-layer encryption** of chat logs / birth data (default Firestore-at-rest only), while onboarding markets "Every consultation is private, encrypted and completely secure." | grep `encrypt|aes|kms` → none; `onboarding_screen.dart:21`. |
| P2-14 | **No retention / auto-purge** of chat logs or PII (no TTL/scheduled purge). Data kept forever. | grep `onSchedule|TTL|expire|purge` → only Agora/config TTLs. |
| P2-15 | **Per-user broadcast fan-out** writes up to 200k notification docs, each firing `onNotificationCreated` (1-2 reads + FCM) → up to 200k trigger invocations/broadcast for paid/unpaid/list segments. (all-users/astrologers correctly use a topic.) | `sender.ts:156-198,16`. |
| P2-16 | **Hot astrologer doc + monotonic index hotspots.** A popular astrologer's concurrent chats ending in the same second exceed ~1 write/s/doc on `earnings`/`available`; `walletTransactions.createdAt` monotonic index hotspots at ~500/s. | `endConsultation.ts:113-122`, `firestore.indexes.json`. |
| P2-17 | **Notifications deletion capped at 500** (single non-looping batch) — a heavy user's notifications beyond 500 are never deleted. | `adminAndDeletion.ts:83`. |

### P3 — Operationally blind

| # | Finding | Evidence |
|---|---|---|
| P3-1 | **No structured logging / correlation IDs** anywhere in the backend; error handling is raw `console.error` in 5 files. Cannot trace a payment across callable + webhook. | grep `functions.logger|correlationId|traceId|requestId` → none. |
| P3-2 | **No error tracking on the money-handling admin portal or Cloud Functions.** (Crashlytics *is* wired in both Flutter apps — `customer/lib/main.dart:28-30`, `astrologer/lib/main.dart:26-28`.) | grep `sentry|datadog|bugsnag` in `apps/admin` / functions → none. |
| P3-3 | **No alerting** on failed payments, stuck sessions, or ledger drift. Failed webhook credits (P1-4) are silent. | No alerting code anywhere. |
| P3-4 | **No CI, no git hooks.** `.github/workflows/` absent; `.git/hooks` only `*.sample`. Nothing runs `tsc`/`jest`/`eslint`/`flutter analyze` on push. | `ls .github/workflows` → not found. |

### P4 — Quality

| # | Finding | Evidence |
|---|---|---|
| P4-1 | **A non-author cannot deploy by following the README.** README says `firebase deploy --only functions` but never mentions `firebase functions:secrets:set` for the 5 `defineSecret` values a v2 deploy requires; it defers to `docs/SETUP_CHECKLIST.md`. Deploy of `createRechargeOrder`/`verifyRecharge` fails on missing secrets. | `common/secrets.ts:4-8`, README. |
| P4-2 | **The only Flutter "test" asserts `1 + 1 == 2`** — an explicit placeholder testing nothing about the product. | `apps/customer/test/widget_test.dart:9`. |
| P4-3 | Dead `'finance'` admin-role branch in money guards (`ADMIN_ROLES` has no `finance`). Not a vuln. | `admin/actions.ts:17,66` vs `admins.ts:18`. |

---

## WHAT I COULD NOT VERIFY

- **The two Flutter apps (~19,800 Dart LOC)** — no Flutter/Dart SDK in this environment (`which flutter` empty). Could not build, run, `flutter analyze`, or exercise any client-side wallet/checkout/consultation UI at runtime. The majority of the codebase is verified by source-reading only.
- **The two-simultaneous-sessions TOCTOU (P0-candidate).** `createConsultation`'s open-session guard is an in-transaction *query* with no shared document write across two *different* astrologers (`createConsultation.ts:117-127`). Whether Firestore's admin-SDK transaction acquires a range/phantom lock that blocks a concurrent insert cannot be determined from source. **If it does not, a user can open two concurrent billable sessions — that would be P0.** Resolve with a deterministic lock doc (`activeSessionLocks/{customerId}`) or a Firestore-emulator concurrency test.
- **Missing-index sweep failures (P1-1)** are established from `firestore.indexes.json` vs query shapes; I did not execute the queries to capture the live `FAILED_PRECONDITION`. If `status+pausedAt` / `status+createdAt` were created out-of-band in the console, those jobs run. **Check the live project's index list.**
- **Live Firestore/Razorpay behaviour** — no emulator, no live keys: webhook replay, concurrent-recharge serialization, and the ledger/tick/payout race safety are reasoned from the code (each writer reads a shared doc forcing optimistic conflict), not measured.
- **Backups (Firestore PITR / scheduled exports), App Check console enforcement, API-key restrictions, and CMEK** — Google Cloud console settings, not repo artifacts. No backup/export code exists in the repo; live-project state is unknown.
- **Privacy-policy / terms content** — served from Firestore `cms/{page}`, not the repo; existence/adequacy unverified.
- **Deploy procedure beyond the README** and any `docs/` status content — deliberately not read until Phase 9.

---

## PHASE 8 — VERDICT (written before reading his notes)

**Counts:** P0: **2** | P1: **10** | P2: **17** | P3: **4** | P4: **3**  *(plus 1 unverified P0-candidate: the two-session TOCTOU)*

**Completion, honestly assessed: ~60%** — measured against "a production marketplace handling real money for 20,000 users," **not** a demo. The core recharge→bill→settle→payout engine is genuinely well-built (server-authoritative time, idempotent credits, HMAC-verified webhooks, wallet-can't-go-negative, ownership-checked callables, default-deny rules). But it is surrounded by: zero money-path tests, a legal-erasure failure, no content moderation, no operational visibility, a ~5,000-concurrent-session scale ceiling, and two silently-broken session-recovery jobs. Those are not polish; they are the difference between "the math is right" and "we can run this on strangers' money."

**The five questions:**
1. **Would I put my own ₹10,000 through it today?** Cautiously yes for a single supervised recharge-and-chat — the core credit/bill path is idempotent and server-authoritative and would very likely bill me correctly.
2. **Would I let 10,000 strangers put money through it next month?** **No.** Scale ceiling within 1× of target, two broken recovery jobs, over-billing on disconnect, no moderation, and a legal-erasure failure.
3. **If a user is billed incorrectly, can the operator prove what happened?** **Partially.** The customer ledger is append-only and replayable, but with no correlation logging, no astrologer-side ledger, and a ledger that conflates three balance buckets, a contested payout or bucket-split dispute cannot be fully reconstructed.
4. **Product, or a demo that never met an adversary?** A **real product at the core** — the money engine has met adversaries (signature verification, idempotency, ownership checks are all present and correct). The **edges have not** — deletion, moderation, disconnect-billing, scale, and operations are unhardened.
5. **Single defect most likely to cost real money in week one?** **P1-2 — billing continues through a dropped/disconnected call.** Week-one customers will pay for dead air after a call drops or their network blips, producing refund demands, chargebacks, and "it charged me after it disconnected" one-star reviews — the fastest real-money, real-reputation leak.

**Verdict: PILOT-READY.**
> One sentence: *AskTro is a genuinely-built product with a sound core money engine that is safe for a closely-supervised pilot of ~100 real-money users, but is not production-ready for 20k strangers until its erasure, moderation, disconnect-billing, session-recovery, and test gaps are closed.*

**Shortest honest path to PRODUCTION-READY (ordered P0/P1 kill-list, dev-day estimates):**
1. Money-path integration tests against the Firestore emulator (recharge idempotency, applyTick buckets/grace, endConsultation, payout cap, two-session race) — **4–6 d** *(kills P0-1, resolves the TOCTOU)*
2. Make `deleteAccount` actually erase every collection + Storage object (or hard-delete the uid's data) — **1–2 d** *(P0-2)*
3. Add the two missing composite indexes (or confirm live) so paused/waiting recovery works — **0.5 d** *(P1-1)*
4. Counterparty-presence + reconnect auto-pause so a disconnected call stops billing — **2–4 d** *(P1-2)*
5. Fix `expirePaused` to use the session-snapshot commission — **0.5 d** *(P1-3)*
6. Webhook reconciliation job + failed-payment alerting; stop returning 200 on unrecoverable credit failure without a dead-letter — **2–3 d** *(P1-4, P3-3)*
7. Move `earnings`/`pendingPayout`/`commissionPercent` off the public astrologer doc — **0.5 d** *(P1-5)*
8. Remove/prod-gate `devSimulateRecharge` + `simulateRechargeSelf` — **0.5 d** *(P1-6, P2-2)*
9. Real refund path that reverses astrologer accrual — **2–3 d** *(P1-7)*
10. Content moderation: report/block + image scan (Cloud Vision SafeSearch) — **3–5 d** *(P1-9)*
11. Record consent (timestamp + policy version) + retention policy — **1–2 d** *(P1-8, P2-14)*
12. Structured logging + correlation IDs + portal/functions error tracking — **2–3 d** *(P3-1/2)*
13. Portal pagination + aggregate counter docs; shard the ledger/counters for the scale ceiling — **3–5 d** *(P2-1/3/4)*
14. Apple-IAP decision (IAP vs. carve-out vs. web-only recharge) — **variable**

Total to a defensible production bar: **~4–6 focused developer-weeks**, dominated by tests, deletion/erasure, disconnect-billing, moderation, and observability.

---

## PHASE 9 — DIFF AGAINST HIS PENDING LIST

Read after the verdict, against `docs/MASTER_TODO.md`, `PRE_LAUNCH.md`, `PENDING.md`, `WHATS_LEFT.md`, `SERVER_SCALING_AND_COSTS.md`.

### A. On his list AND found by me (he knows)
- App Check not enforced (his: PRE_LAUNCH "flip at launch"; mine: P2-6). ✔
- Portal loads all users / unbounded listeners; portal "live" views static; raise `maxInstances`; hot astrologer doc; single-sided heartbeat; sweep sharding (his: MASTER_TODO §F + SERVER doc; mine: P2-1/3/4/16). ✔ — his scale section is genuinely accurate.
- Voice/video not built; iOS push setup; Razorpay live keys pending (his: MASTER_TODO §A/B/D; mine: context, not defects). ✔
- Notifications-in-bell / banner / seen-typing / notification-icon polish (his: §H/I). ✔ (minor)

### B. On his list, NOT found by me (either he's right or I missed it)
- **Banner placements 2–5 don't render; banner priority not settable; chat "seen"/"typing" dead; astrologer notification icon mismatch; customer app-icon regen; Android release keystore; legal-doc content.** I did not independently surface these — they are real, but they are UX-completeness / launch-prep items, not runtime defects, and my adversarial pass (money/security/scale/legal) did not target them. **He is right about these; I did not miss a defect, we had different scopes.** The keystore and legal-doc items are genuine launch blockers he correctly tracks.

### C. Found by me, NOT on his list ← **THE REPORT (unknown unknowns), severity-ordered**
1. **P0-1 — no money-*moving* tests** (his docs praise the tested engine but don't flag that the transactional wrappers are untested).
2. **P0-2 — `deleteAccount` leaves chat/remedies/transactions/images intact while claiming permanent deletion** (his docs list the *customerProfiles* scrub we added, but not the far larger residual corpus or the false in-app claim).
3. **P1-1 — two sweep recovery jobs throw on missing indexes; paused sessions never settle; astrologers lock permanently.**
4. **P1-2 — billing continues through disconnect / dropped call (no presence gate; `reconnectTimeoutSec` dead).**
5. **P1-3 — commission differs between manual-end and sweep-end paths.**
6. **P1-4 — captured payment can be silently lost (webhook 200-on-failure, no reconciliation).**
7. **P1-5 — astrologer earnings/commission world-readable.**
8. **P1-6 / P2-2 — `devSimulateRecharge` / `simulateRechargeSelf` money-printers shipped to prod.**
9. **P1-7 — no refund path at all.**
10. **P1-8 — consent never recorded; P1-9 — zero content moderation; P1-10 — Apple-IAP exposure.** (His docs mention "legal docs" but not consent-capture, moderation, or the IAP structural risk.)
11. **P2-5 — rounding overcharge on custom per-minute rates.**
12. **P2-7 — ghost-online presence; P2-9 — startTime/endTime null contract; P2-8 — admin sub-tier read leakage; P2-10/11/12 — astrologer ledger absent, bucket-conflated customer ledger, per-payment (not per-order) dedupe.**
13. **P3-1..4 — no correlation logging, no portal/functions error tracking, no alerting, no CI.**

**Did his pending list, on its own, give an accurate picture of how far from production this system is? — No.** His docs are strong on *scale* and *security-hardening* (that section is accurate and honest) and correctly track launch-prep, but they present the remaining work as "features + launch paperwork + scale-later" on top of an ~85–90%-done base, and rate the build A‑. The independent pass found **2 P0s and 10 P1s he does not list** — a legal-erasure failure, untested money movement, silently-broken session recovery, disconnect over-billing, and no moderation. **His list understated the distance to production by roughly 25–30 percentage points** (his implicit ~85–90% vs. the audited ~60%). The gap is not incompetence — it is the predictable blind spot of self-review: he hardened what he thought about (security, scale) and did not adversarially test the failure edges, the legal surface, or his own "done" claims.
