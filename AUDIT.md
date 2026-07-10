# AskTro — Independent Adversarial Production-Readiness Audit

_External-auditor pass. Every finding cites `file:line` or a command + its real output. Where I could not execute (Flutter on a device, live Razorpay/Firebase, real load), it is stated in "What I Could Not Verify" — not inferred. The prior in-repo audit was preserved at `docs/AUDIT_v1_prior.md`; this file is an independent re-audit and does not reuse its conclusions._

Method: 5 parallel code investigations + first-hand builds/tests in a sandbox. I personally re-verified every P0 and the headline P1s against source before listing them.

---

## FINDINGS (sorted by severity)

| # | Sev | Finding | Evidence (`file:line`) | Reproduction / proof |
|---|-----|---------|------------------------|----------------------|
| P0-1 | **P0** | **Customer is billed to wallet-zero for an absent session.** Billing liveness is keyed on `lastTickAt`, which `applyTick` refreshes on **either** party's tick, and **both** apps tick every 10s. Only astrologer presence is tracked; there is no customer-liveness gate. If the customer force-quits/backgrounds while the astrologer app stays open, the astrologer's heartbeat keeps `lastTickAt` fresh, `billStaleActive` never fires, and the meter drains the absent customer's wallet until balance-exhaustion. | `billing/tickConsultation.ts:154` (stamps `lastTickAt` for any caller); `billing/sweepSessions.ts:66` (`billStaleActive` keys on `lastTickAt`); astrologer heartbeat `astrologer_consultation_screen.dart:48`; no customer `presence` doc exists anywhere | Trace: customer app killed → customer tick stops → astrologer tick every 10s → `lastTickAt` never ages past 45s → session stays `active` → `applyTick` charges each tick. No code path pauses on customer absence. |
| P0-2 | **P0** | **Committed super-admin password for the live project.** `Asktro@2026` is hard-coded and creates 3 live `adminRole: super` accounts that control `adjustWallet` / `processPayout` / `refundConsultation`. The portal (`asktro-admin.vercel.app`, internet-reachable) is email+password only, no MFA. | `firebase/functions/scripts/seed_admins.mjs:28` (`DEFAULT_PASSWORD = 'Asktro@2026'`), `:22-24` (super accounts); `docs/PENDING.md:30,173` assert the accounts exist on the live project with this password; `apps/admin/src/app/login/page.tsx` email/password only | `grep -n "Asktro@2026" firebase/functions/scripts/seed_admins.mjs docs/PENDING.md` → 3 hits. Money callables gate only on `adminRole==='super'`; a session with these creds moves money. |
| P0-3 | **P0** | **Money-settlement paths have no tests, and the money-MOVING integration tests do not run in the default suite.** Per this audit's own rule, absence of a test on a money path is Critical. `endConsultation` (astrologer earnings credit), `sweepSessions` (dropped-call/force-quit settle), `refund.ts` (clawback), and `processPayout` are untested. `jest.config.js` `testMatch: ['**/*.test.ts']` excludes every `*.itest.ts`. | `firebase/functions/jest.config.js` testMatch; no `endConsultation.*test.ts`, `sweepSessions.*test.ts`, `refund.*test.ts`, `actions.*test.ts` exist | `cd firebase/functions && npx jest` → **2 suites / 26 tests, all pure math** (engine rounding + razorpay signature). No money-movement test executes in `npm test`. The 3 `*.itest.ts` require an emulator + `firebase-tools` and are outside the default run. |
| P1-1 | **P1** | **Razorpay webhook can capture payment yet never credit and never dead-letter (scenario j).** The webhook reads `payload.payment.entity.notes` for `userId`/`planId`; Razorpay does **not** copy order notes onto the payment entity, so these are typically empty. It never falls back to the authoritative `rechargeOrders/{orderId}` doc it wrote at order creation. When the client dies before `verifyRecharge`, the webhook branch is skipped, it only `logger.warn`s, and `recordFailedCredit` (which lives only in `creditRecharge`'s catch) never fires. Money captured, wallet never credited, no alert. Contradicts the function's own docstring (`recharge.ts:7-8`) and comment (`recharge.ts:48`). | `wallet/recharge.ts:124-128` (reads `entity.notes`), `:132` (skips unless all present), `:146` (`logger.warn` only); authoritative doc exists at `recharge.ts:49-55` and is **never** read by the webhook | Code path is definitive (I read `recharge.ts` in full); the only unverified link (Razorpay's note-copy behavior) is in "Could Not Verify." If empty in prod, this escalates to **P0**. |
| P1-2 | **P1** | **Uncapped elapsed in the live tick path over-bills a frozen/backgrounded client.** `computeTick` bills `elapsedMs = nowMs − lastTickAtMs` with no upper clamp. Only the *sweep* path caps the gap (`STALE_BILL_SETTLE_MS = 15_000`). A client suspended by the OS for ~90s that foregrounds and fires one tick before the every-60s sweep pauses it bills the full 90s of dead air at once. | `billing/engine.ts:88` (`elapsedMs = Math.max(0, nowMs - lastTickAtMs - ...)` — no upper bound), sweep clamp at `billing/sweepSessions.ts:59,85`; grace 45s + 60s sweep leaves a real window | Verified: read `engine.ts:78-116`; live `applyTick` (`tickConsultation.ts:56`) passes raw `nowMs`, no clamp. |
| P1-3 | **P1** | **"Delete my account" is materially incomplete (DPDP §12 / GDPR Art. 17).** `deleteAccount` never touches `reports` (free-text complaint PII up to 1000 chars keyed to the uid), `consentRecords`, `alerts` (uid embedded in messages), `userBlocks` (+ uid in others' `blocked` arrays), or `referrals`, and leaves `referralCode`/`referredBy` on the anonymized doc (re-identification link). | `auth/adminAndDeletion.ts` — `grep -nE "reports\|referrals\|consentRecords\|userBlocks\|referralCode\|referredBy" auth/adminAndDeletion.ts` → **0 hits**; `reports` rows carry PII per `moderation.ts:84-93` | Verified by grep (0 references). Erasure retains user-authored PII after "deletion." |
| P1-4 | **P1** | **A customer can open two simultaneous paid sessions (phantom-insert race).** The "no open session" guard is a transactional *query*, which Firestore does not protect against phantom inserts; two concurrent `createConsultation` calls both read empty and both create, draining one wallet across two meters. No unique-key lock on `customerId`. | `billing/createConsultation.ts:127-136` (transactional query, `.limit(1)`), no `customerId` lock doc | Two near-simultaneous calls each pass the empty-read check; both `tx.set` distinct consultation docs. |
| P2-1 | P2 | **Admin portal loads unbounded collections in the browser.** Every analytics card does full-collection or unbounded-range `getDocs` with no `.limit()`. `walletTransactions` is the fastest-growing collection (~6 rows/min/active session). At 10k–20k users these queries stream millions of docs into a tab. | `apps/admin/src/components/UsersActivityTable.tsx:47-49` (`getDocs(collection(db,'users'))` + full `consultations`), `RevenueCard.tsx:35-41`, `OperationsSection.tsx:99-104,144,191,236,280,310`, `SessionsConsole.tsx:26,36`, `ActiveConsultationsCard.tsx:36,46` | Unbounded read billing + browser OOM/timeout on open at scale. |
| P2-2 | P2 | **Ghost-online window up to ~4 minutes.** Heartbeat 90s, staleness cutoff 180s, sweep every 60s → worst case ~240s during which a crashed astrologer stays `onlineStatus:true`. Customers create `waiting` sessions no one can accept; each strands the customer ~90s before `expireWaiting`. | `presence_heartbeat.dart:33` (90s), `sweepSessions.ts:197` (`STALE_ONLINE_MS = 3*60*1000`), `:30` (60s sweep), `createConsultation.ts:70` (checks only `onlineStatus`) | Compute: 180 + 60 = 240s ghost window. |
| P2-3 | P2 | **The single 1-min sweep has N+1 fan-outs and hard `limit()` ceilings; surplus is silently deferred.** `reconcileStaleOnline`/`reconcileAvailability` do one per-astrologer read in a loop; `billStaleActive`/`expirePaused` cap at `limit(200/300)`. Past those rates the excess survives multiple sweeps and (coupled with P1-2) gets over-billed on reconnect. First systematic incorrect bill ≈ **2,000–4,000 concurrent sessions**. | `sweepSessions.ts:208` (per-astrologer `presence` get), `:231-236` (per-astrologer query), `:72,109,162` (`limit`) | Justified: 200 disconnects/min ceiling ÷ ~5–10% per-minute churn ≈ 2k–4k concurrent. |
| P2-4 | P2 | **Support-ticket IDOR.** Any signed-in user can create tickets bearing another user's `customerId` and append messages to **any** ticket thread — no ownership check on create. (Bonus: the thread *read* rule only checks `customerId`, so an astrologer can never read their own ticket.) | `firebase/firestore.rules:252` (`allow create: if isSignedIn()`), `:256` (`allow create: if isSignedIn()`), `:255` (read checks only `customerId`) | Verified: `sed -n '248,266p' firebase/firestore.rules`. |
| P2-5 | P2 | **No App Check enforcement and no rate limiting on any callable.** `setGlobalOptions` sets no `enforceAppCheck`; zero `enforceAppCheck` in `functions/src`; zero throttle code. A scripted non-app client calls every function freely — `validateCoupon` is an unthrottled enumeration oracle; `createRechargeOrder` mints unbounded live orders; OTP/login rely on Firebase defaults only. | `firebase/functions/src/index.ts:12-18`; `git grep enforceAppCheck functions/src` → 0; `git grep -iE "rate.?limit|throttle" functions/src` → 0; oracle at `coupons/validateCoupon.ts:26-53` | Grep proves absence. |
| P2-6 | P2 | **Special-category chat is plaintext and retained indefinitely by default.** No app-level encryption of chat text/images; retention purge is OFF and window = 0 ("keep forever") by default. Birth/health/relationship transcripts sit in cleartext beyond Google's default envelope, forever. | `chat_consultation_screen.dart:174-177` (plaintext `'text'`); `common/config.ts:18` (`chatRetentionDays: 0`), `:23` (`retention: false`); `ops/retention.ts` no-ops unless flagged | `grep -riE "encrypt\|cipher\|aes"` across Dart+TS → nothing. |
| P2-7 | P2 | **Image NSFW auto-scan is OFF and unprovisioned.** `imageModeration` is absent from `DEFAULT_CONFIG.featureFlags`, and `@google-cloud/vision` is a non-literal dynamic import that is not a dependency. Every chat image lands as `status:'pending'` for manual review with no SLA/alert. Thin surface for Apple UGC 1.2 / Play UGC. | `moderation.ts:175` (flag check), `:177-181` (dynamic import), `:208` (pending); `config.ts:19-24` (no `imageModeration` flag) | The trigger records; it does not detect. |
| P2-8 | P2 | **Apple IAP policy risk — iOS launch-blocking.** AI astrologers (`isAI:true`) are digital services; consultation credit for them is funded via the Razorpay gateway in-client, not IAP. Apple Guideline 3.1.1 requires IAP for digital goods — concrete rejection vector. | `apps/customer/lib/features/wallet/recharge_screen.dart` (Razorpay), `seed_ai_astrologers.mjs:99` (`isAI:true`); `grep in_app_purchase apps/customer` → 0 | Decision, not a code bug, but blocks the iOS store. |
| P2-9 | P2 | **No in-app disclaimer and no age gate.** No "for entertainment / not a substitute for professional advice" text on any consultation screen (only inside seeded Terms, which still has `[EFFECTIVE DATE]`/`[GRIEVANCE OFFICER]` placeholders). DOB is collected but never used to gate <18 (DPDP §9 children's data; Apple 5.x fortune-telling). | `grep -riE "entertainment\|disclaimer\|under 18\|age.?gate" apps/*/lib` → 0; DOB at `user_profile.dart:49` | Verified: grep returns nothing in app UI. |
| P2-10 | P2 | **`sendBroadcast` paid-user segment throws at runtime.** For `paid_users` it builds `where('totalRecharge','>',0).orderBy('__name__')`; Firestore rejects ordering by `__name__` after a range on a different field. The paid-user broadcast segment is broken. | `notifications/sender.ts:168` | `unpaid_users` (`==`) works; `paid_users` (`>`) → `FAILED_PRECONDITION`. |
| P2-11 | P2 | **No backups.** No Firestore scheduled export / PITR / backup schedule anywhere in the repo. A bad backfill or the incomplete `deleteAccount` has no recovery path. | `grep -riE "exportDocuments\|backupSchedule\|pitr\|scheduled export"` repo → 0 | Absence. |
| P3-1 | P3 | **No error tracking on Cloud Functions or the admin portal.** Crashlytics is wired only in the two Flutter apps; functions and admin have Cloud Logging only. | `apps/customer/lib/main.dart:37-39`, `apps/astrologer/lib/main.dart:35-37` (Crashlytics); `grep sentry apps/admin` → 0; none in `functions/src` | 2 of 4 surfaces blind to errors. |
| P3-2 | P3 | **No correlation/session IDs threaded through logs.** Tracing one consultation or payment across functions requires hand-matching `refId`s. | `grep -i "correlationid\|requestid\|traceid" functions/src` → only a comment at `pauseResume.ts:4` | Absence. |
| P3-3 | P3 | **Alerts are write-only.** `alerts`/`failedWebhookCredits` docs are written for failed credits, refunds, moderation — but the only consumer is the admin UI. No email/Slack/pager. Failed payments, stuck sessions, and ledger drift never actively notify a human. | `wallet/reconcile.ts:50`, `admin/refund.ts:119`, `moderation.ts:96`; `grep -iE "sendgrid\|nodemailer\|slack\|pagerduty" functions+admin` → 0 | Absence. |
| P3-4 | P3 | **Hand-run, unversioned, one-way migrations.** Backfill scripts require a service-account key; idempotency is ad hoc per script; no framework, no version ledger, no down-migrations. | `firebase/functions/scripts/backfill_privacy.mjs`, `create_customer_profile.mjs`, `reset_wallet.mjs` | — |
| P3-5 | P3 | **Admin tier is not enforced server-side.** `setUserStatus`/`setAstrologerStatus`/`resolveOpsItem`/support actions gate only on `assertRole(req,'admin')` (any tier). An `astrology`-tier token can block/delete any customer. Tier separation is UI-only. | `admin/actions.ts` (setUserStatus/setAstrologerStatus), `admin/ops.ts` (resolveOpsItem); tiers UI-side in `apps/admin/src/lib/roles.ts` | Money actions *are* super-gated; this is intra-admin scope creep. |
| P3-6 | P3 | **Astrologers self-edit trust-signal fields directly in Firestore.** Rules block only money/verify/rate fields; `experience`, `name`, `about`, `expertise`, `profilePhoto`, `responseTimeSec` are client-writable, and the app writes them, bypassing the admin `updateAstrologer` review path. An astrologer can set `experience: 99` straight to the customer-facing directory. | `firestore.rules:85-91` (blocked set omits these); `astrologer_repository.dart:100-103` (`set(patch, merge)`) | — |
| P3-7 | P3 | **Refund converts bonus/grace-funded spend into real withdrawable wallet money.** `refund` credits `walletBalance += totalCharged`, but `totalCharged` includes seconds paid from `bonusBalance`/`chatBonusBalance`/grace. A session paid entirely from free credit, when refunded, becomes spendable cash. | `admin/refund.ts:41` (`gross = totalCharged`), `:70-73` (`walletBalance +=`); bonus-funded seconds at `tickConsultation.ts:118-122` | Admin-gated but incorrect accounting. |
| P3-8 | P3 | **Astrologer ledger doesn't reconcile after a payout-cleared refund shortfall.** When earnings were already paid out, `refund` writes a single `refund_reversal` but decrements earnings and pending by different amounts; the signed `astrologerLedger` sum then diverges from `pendingPayout` by the shortfall. | `admin/refund.ts:89-90,95`; reconciliation claim at `wallet/ledger.ts:56-58` | Shortfall alert exists (`refund.ts:118-126`) but the trail no longer reconciles. |
| P3-9 | P3 | **Pause drops up to ~10s of unbilled active time (revenue leak).** `pauseConsultation` sets `status:'paused'` without a final `applyTick`; on resume `lastTickAt` resets to now. The active seconds since the last heartbeat are lost. | `billing/pauseResume.ts:31-40`, reset at `:71` | Bounded, customer-favorable, systematic undercharge. |
| P3-10 | P3 | **Consent gaps.** The signup-path consent row records only `policyVersion`+`source` (infers agreement from doc creation, doesn't persist `termsAccepted`/`privacyAccepted`); no server-side re-consent enforcement on version bump; no breach-notification process (DPDP §8(6)). | `auth/onUserCreate.ts:74-79`; `auth/consent.ts:19`; no breach code anywhere | Explicit consent capture *does* exist on the login gate — this is the residual. |
| P3-11 | P3 | **Deploy is fragile and manual; no IaC.** Secrets must be set before the first deploy; Cloud Run Invoker must be granted by hand per new callable; `onChatImageUploaded` is region-pinned to `us-east1` vs `asia-south1`; `firebase deploy` chronically returns HTTP 409 "unable to queue" (helper scripts exist solely for this). | `README.md:70-87`, `firebase/functions/scripts/grant_public_invoke.mjs`, `list_operations.mjs`, `moderation.ts:159` | Observed first-hand this session: repeated 409s on function updates. |
| P3-12 | P3 | **`reconcileStaleOnline` corrupts the `available` flag and churns disabled astrologers.** It unconditionally sets `available:true` when forcing offline (including for one holding the exclusive call lock), and neither reconcile skips `disabled`/soft-deleted astrologers, flipping `available` back to `true` every minute on dead accounts. | `sweepSessions.ts:212`, `:238`; soft-delete at `createAstrologer.ts:189` | Audit noise + flag corruption. |
| P3-13 | P3 | **Consultation-request push is fire-and-forget.** One FCM send, no retry/ack; the only fallback is a foreground Firestore listener. A killed astrologer app with a stale/absent token silently misses the request, which ages out in 90s. | `notifications/sender.ts:16,35`; foreground fallback `astrologer_repository.dart:111-118` | — |
| P4-1 | P4 | **No shared schema; the TS `ConsultationDoc` is already stale.** `graceGranted`, `graceGrantedAt`, `chatCreditEligible` are written by the functions but not declared in the interface; the Dart model reads `graceGranted`. Writes go through `Record<string,unknown>`, so TS never catches drift. | `common/types.ts:44` (interface, missing fields); written at `tickConsultation.ts:156`, `createConsultation.ts` (chatCreditEligible); read at `consultation.dart:104` | `grep graceGranted common/types.ts` → not declared (verified). |
| P4-2 | P4 | **Silent `?? default` on every cross-boundary read; unknown enum → `waiting`/`pending`.** A backend field rename degrades invisibly; an unrecognized status renders a live/paused session as `waiting` in the customer UI, with no telemetry on the fallback. | `consultation.dart:90-113`, `enums.dart:21-22,37-38` | — |
| P4-3 | P4 | **`reportContent` doesn't verify the reporter is a participant.** Any signed-in user can file reports against any `reportedId`/`consultationId`, each spawning an `alerts` doc → report/alert spam. | `moderation.ts:72-93` | — |
| P4-4 | P4 | **The astrologer app (6,657 LOC, the money-receiving side) and the admin portal (6,758 LOC, incl. refund trigger) have zero tests.** | `find apps/astrologer -name '*_test.dart'` → none; `find apps/admin -name '*.test.*'` → none | Verified first-hand. |
| P4-5 | P4 | **Customer directory gates astrologers only client-side.** `watchOnline` filters solely on `onlineStatus==true`; a pending/suspended-but-online astrologer appears in the rail. Backend `createConsultation` does enforce approval, so it's a display/trust gap, not a money hole. | `repositories.dart:29-37`, `astrologer_card.dart:97,104,111` | — |
| P4-6 | P4 | **Razorpay client has no timeout/retry bound.** On a gateway *timeout*, `createRechargeOrder` throws before writing the `rechargeOrders` binding doc, so each client retry mints a fresh, un-idempotent order (orphan unpaid orders accumulate). Bounded in money terms only because *credit* is idempotent downstream. | `wallet/razorpay.ts:49-56`, order write at `recharge.ts:49` (after the throw point) | — |

**Counts: P0: 3 · P1: 4 · P2: 11 · P3: 13 · P4: 6 — total 37.**

---

## Phase 0 — Inventory (reproduced first-hand in this sandbox)

| Surface | Stack | Source LOC | Test files | Test cases | Build | Tests |
|---|---|---|---|---|---|---|
| Cloud Functions | TS / Firebase Functions v2 | 4,944 | 5 | 33 (26 unit + 7 emulator) | ✅ `tsc` clean | ✅ 26 unit + 7 emulator pass |
| Admin portal | TS / Next.js | 6,758 | 0 | 0 | ✅ `tsc --noEmit` clean | — none exist |
| Customer app | Dart / Flutter | 11,499 | 1 | 2 | ✅ `flutter analyze` clean | ✅ 2 pass |
| Astrologer app | Dart / Flutter | 6,657 | 0 | 0 | ✅ `flutter analyze` clean | — none exist |
| shared_flutter | Dart | 2,248 | 0 | 0 | ✅ (via apps) | — |

Total ~32,100 source LOC · 35 test cases · 107 assertions. Coverage is concentrated in the billing arithmetic and near-zero elsewhere. Secret scan (`git grep` over 343 commits): no `rzp_live`/`sk_live`/private keys; only public Firebase client config + `.env.example` placeholders — clean except the admin password (P0-2). Flutter builds needed an undocumented `pub get` and run only with a root warning.

## Scenario matrix (Phase 1)

| Scenario | State | Citation |
|---|---|---|
| (a) drop at 4:59/5:00 | Handled, **untested (P0-3)** | `sweepSessions.ts:61-100` |
| (b) wallet hits zero mid-session | Handled + tested | `engine.ts:106-116`, `applyTick.itest.ts:26-58` |
| (c) astrologer loses network 40s | **Partial** — customer keeps paying (P0-1) | `sweepSessions.ts:66` |
| (d) user backgrounds app | Handled (settle+pause), untested | `sweepSessions.ts:75-99` |
| (e) user force-quits | **Unhandled if astrologer app stays open (P0-1)** | `tickConsultation.ts:154` |
| (f) refund after payout cleared | Handled, **untested (P0-3)**, reconciliation weak (P3-8) | `refund.ts:64-66,118-126` |
| (g) two simultaneous paid sessions | **Unhandled** (P1-4) | `createConsultation.ts:127-136` |
| (h) client clock 90s ahead | Handled — server time only | `tickConsultation.ts:182` |
| (i) two servers process same end | Handled — Firestore serializes, loser no-ops | `endConsultation.ts:40-49` |
| (j) gateway success then crash | **Broken** (P1-1) | `recharge.ts:124-146` |

## What holds up (stated plainly, so the report is honest)

- **Elapsed time is 100% server-computed.** No client-supplied duration is trusted anywhere. Scenario (h) is a non-issue.
- **The wallet ledger is append-only** and every balance mutation shares a transaction with its ledger write — no charged-but-unrecorded interleaving found.
- **Cumulative rounding is correct and tested** (`engine.test.ts:186-258`, invariant `totalCharged == round(pps × billedSec)`).
- **Recharge credit is genuinely idempotent** — dedupe on `paymentId` + per-order guard, dead-lettered + retried every 5 min ×10 (`creditRecharge.ts:33-56`, `reconcile.ts:68-77`). The webhook *entry* is broken (P1-1), but once `creditRecharge` is reached it is solid.
- **Firestore rules are tight:** clients cannot write any money/session doc; no cross-user read of PII, chat, ledger, or another astrologer's earnings; price/commission are server-snapshotted and never re-read from the client.
- **Agora tokens** are server-minted, channel-scoped, TTL 3600s.
- **No admin-vs-app write race** — all session mutations funnel through the same transactional callables.
- **CI runs on every push** (functions build + jest + emulator money tests + admin typecheck + flutter analyze).

---

## What I Could Not Verify

- **Whether Razorpay populates `payment.entity.notes` in the live `payment.captured` webhook.** The code defect (reads payment-entity notes, never falls back to the `rechargeOrders` doc) is certain; whether it fires in prod depends on Razorpay's behavior, which I could not execute (no live keys — docs confirm test keys only). If notes are empty, P1-1 is P0.
- **Whether the committed admin password was rotated on the live project.** The credential is committed and docs say the accounts exist with it; rotation status is unknown. P0-2 assumes worst case (unrotated).
- **Live load / true concurrent-session ceiling.** No load test was run. The ~2k–4k "first systematic incorrect bill" figure (P2-3) is derived from the sweep `limit()` ceilings and assumed churn, not observed.
- **Flutter on a real device / release build.** Analyze + the one widget test ran; no on-device run, no release build, no push-delivery test.
- **Live Firestore backup/PITR settings.** The repo has none; the project console setting was not inspected.
- **App-store review outcome.** IAP/disclaimer/age-gate findings are policy-derived, not an actual submission.
- **The 3 `*.itest.ts` "pass" reflects the emulator, not production Firestore.**

---

## Phase 8 — Independent verdict (written before reading his notes)

**Counts: P0: 3 | P1: 4 | P2: 11 | P3: 13 | P4: 6**

**Completion, honestly assessed: ~70%** — measured against "a production marketplace handling real money at 20,000 users," not a demo. The billing *engine* itself is ~90% (server-authoritative, transactional, cumulative, idempotent recharge — genuinely good). The envelope around it — settlement-edge correctness, money-path tests actually running, operational visibility, data-deletion completeness, scale, and store/legal compliance — is ~55%. Blended ~70%.

Five questions, no hedging:

1. **Would you put your own ₹10,000 through this today?** Qualified yes — but only because I'd never force-quit mid-session or lose signal. A normal user will, and P0-1/P1-2 can over-bill them.
2. **Would you let 10,000 strangers put money through it next month?** No. P0-1 over-bills, P1-1 can swallow real payments silently, the money-settlement paths are untested, the admin password is committed, and there is no error tracking or backups.
3. **If a user is billed incorrectly, can the operator prove what happened from the logs and ledger?** Partially. The ledger is append-only and replayable, but with no correlation IDs, no functions error tracking, and write-only alerts, proving a specific dispute means hand-matching `refId`s across Cloud Logging.
4. **Is this a product, or a demo that has never met an adversary?** A real product on the happy path — but its adversarial seams (force-quit billing, phantom concurrent sessions, support IDOR, committed creds) show it hasn't fully met one.
5. **Single defect most likely to cost real money in week one?** **P1-1 — the webhook credit gap.** A user pays, the app dies before `verifyRecharge`, and the webhook — the designed safety net — silently fails to credit with no dead-letter and no alert. It loses the customer's money *and* nobody is notified.

**Verdict: PILOT-READY** — real money, ≤100 users, close supervision, named risks. Not production-ready for 20k.

One sentence: A genuinely well-built server-authoritative billing core wrapped in an envelope that still has three money/trust P0s, so it can safely take real money only under supervision at pilot scale, not at launch volume.

**Shortest honest path to PRODUCTION-READY (ordered P0 kills + the week-one P1):**
1. Rotate the admin password, purge it from `seed_admins.mjs` + `docs/PENDING.md`, add portal MFA (P0-2) — **0.5 day.**
2. Add a customer-liveness gate so an absent/force-quit customer stops the meter — don't let the served party alone refresh `lastTickAt`; pause when only one party ticks (P0-1) — **2 days.**
3. Clamp elapsed in the live `applyTick` path, mirroring `STALE_BILL_SETTLE_MS` (P1-2) — **0.5 day.**
4. Fix the webhook to resolve `userId`/`planId` from `rechargeOrders/{orderId}`, and add a double-fire/out-of-order test (P1-1) — **1 day.**
5. Write and CI-gate the missing money tests: dropped-call settle, `endConsultation` earnings, refund clawback, payout double-issue; fold `*.itest.ts` into the default gate (P0-3) — **2–3 days.**

≈ **6–8 developer-days** to clear the P0s + the week-one P1. That reaches a **production candidate**; the P2 legal/scale set (portal pagination, IAP, disclaimers, backups, App Check, image scan) must still close before 20k.

---

## Phase 9 — Diff against the developer's pending list (`docs/OUTSTANDING.md`, `PENDING.md`)

### A. On his list AND found by me (he knows)
- Portal pagination / scale sharding (his P2-3/scale) = my **P2-1/P2-3**.
- In-callable rate limiting (his P2-6) + App Check (his §E) = my **P2-5**.
- Error tracking on portal + functions (his P3-2) = my **P3-1**.
- Apple IAP decision (his P1-10) = my **P2-8**.
- Chat-image NSFW auto-scan off (his §E) = my **P2-7**.
- Fragile deploy / Node-22 churn (his §D) = my **P3-11**.

### B. On his list, NOT independently surfaced by me (he's ahead of me, or I under-weighted)
- **`config/global.devPaymentsEnabled` is currently ON** (his §E: "kills the dev money-mint; it's ON now"). This is a **live P0** — `simulateRechargeSelf` lets a user credit their own wallet while the flag is on. My security pass classified the dev functions as "PASS (flag kill-switch)" without checking the flag's live value. **He is right; I under-weighted it.** Flip it OFF before any real user touches the system.
- Legal content placeholders, iOS APNs, Agora live keys, release keystore, store accounts, Razorpay live keys — correctly on his list; I confirmed the code-side symptoms but he owns these account/config gates.
- UX polish (typing indicator, banner placements, app-icon, safe-card staleness, voice-notes UI) — on his list; I did not hunt these and cannot dispute them.

### C. Found by me, NOT on his list — the unknown unknowns (ordered by severity)
1. **P0-1 — Customer billed to zero for an absent/force-quit session** (no customer-liveness gate).
2. **P0-2 — Committed live super-admin password.** In `PENDING.md` as "test accounts," never flagged as a security risk.
3. **P0-3 — Money-settlement paths untested + money `itest`s excluded from default `jest`.** His list marks "money-path integration tests" done; they exist but don't run in the standard gate, and `endConsultation`/refund/payout/sweep are untested.
4. **P1-1 — Razorpay webhook captures-but-doesn't-credit + no dead-letter.** His list treats the webhook/dead-letter as done.
5. **P1-3 — Incomplete account deletion** (`reports`, `consentRecords`, `alerts`, `referrals`, residual `referralCode`). His list treats delete-account as done.
6. **P1-4 — Two simultaneous paid sessions (phantom-insert race).**
7. **P1-2 — Uncapped elapsed in the live tick path.**
8. **P2-4 — Support-ticket IDOR.**
9. **P2-2 — Ghost-online ~4-min window** persists despite his P2-7 "presence heartbeat done."
10. **P2-10 — `sendBroadcast paid_users` query throws.**
11. **P2-11 — No backups.**
12. **P2-9 — No in-app disclaimer / no age gate.**
13. **P3-5 — Admin tier not enforced server-side.**
14. **P3-6 — Astrologers self-edit trust-signal fields directly.**
15. **P3-7 / P3-8 — Refund converts free credit to cash; ledger doesn't reconcile after payout-cleared refund.**
16. **P3-9 — Pause drops ≤10s unbilled.**
17. **P3-12 — `reconcileStaleOnline` corrupts `available` / churns disabled astrologers.**
18. **P4-1/P4-2 — Stale TS `ConsultationDoc`; silent `?? default` enum fallback to `waiting`.**

### Did his pending list, on its own, give an accurate picture of distance from production?

**No.** `OUTSTANDING.md` presents the residual as deploy steps, account/config gates, scale-later items, and UX polish — under the banner "all P0 + every security/legal/correctness P1 done." But the audit found **3 undiscovered P0s and 4 P1s that are live money/auth/legal correctness defects**, not ops or polish. His list implies ~90% ("just ship it"); the honest figure is ~70%. **Off by roughly 20 percentage points — and, more importantly, wrong in kind:** he believes the remaining distance is non-correctness work, when the most dangerous items left are undiscovered money bugs.
