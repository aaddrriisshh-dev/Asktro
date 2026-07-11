# AskTro — Scale & Architecture Audit (10k users) — 2026‑07‑10

Independent CTO pass focused on: will it crash at 10k, ratings across verticals,
and what to fix next. Method: 3 parallel adversarial investigations (scale/crash,
correctness re‑verify of the day's fixes, design/architecture) + first‑hand reads.
This is a companion to `AUDIT.md` (the money/trust audit) and `PRE_LAUNCH.md`.

## Ratings

| Vertical | Rating | Investment‑grade? |
|---|---|---|
| Backend code quality (Cloud Functions) | **8.5 / 10** | Yes — strongest part |
| Data model (Firestore, ledgers, rules) | **8 / 10** | Yes (docs stale) |
| Flutter apps (customer/astrologer/shared) | **7 / 10** | Yes, with a hardening punch‑list |
| Admin portal (Next.js) | ~~6.5~~ → **8 / 10** | Unbounded reads removed (pagination/aggregation/rollup) |
| Security model (rules/storage/auth) | **8.5 / 10** | Yes |
| Overall architecture (Firebase + Agora) | **8 / 10** | Yes |
| **Scalability to 10k** | ~~7~~ → **9 / 10** | Periphery (admin, sweep, deletion) now bounded; core already scaled |
| **Blended** | ~~7.8~~ → **~8.4 / 10** | Yes — money core weighted highest |

*(Struck ratings are the original audit snapshot; the arrow shows the value after
this session's scale‑hardening fixes.)*

## Will it crash at 10k registered users?

**The billing backend will NOT crash.** The tick/create/end path is stateless and
horizontally scalable (~8,000 in‑flight capacity vs ~60–100 tick calls/s needed at
300–500 concurrent sessions). `config/global` is read‑cached; writes spread across
per‑session docs; money is protected by server‑time billing + the 15s clamp + the
sweep. Load model: ~2–3k DAU, ~300 concurrent paid sessions base / ~500 stress.

**But three things fail before the core does** *(all three now FIXED — see the
Verdict section for the closing changes; the diagnosis below is the original
audit record):*

1. **P1 — Admin portal is the first crash (data‑volume‑gated, not concurrency).**
   Unbounded `getDocs` buffer millions of docs into one browser tab:
   `RevenueCard.tsx:35‑41` + `OperationsSection.tsx:99‑104` scan a 30‑day
   `walletTransactions` window (~7–14M docs at 10k), `UsersActivityTable.tsx:48‑49`
   and `SessionsConsole.tsx:26,36` scan the entire `consultations` collection.
   The tab OOMs (~1–2M docs ≈ 2–4 GB) **within days–~2 weeks** of sustained traffic,
   and each load bills 1M+ Firestore reads. **This is the single most likely first failure.**

2. **P1 — The sweep degrades the marketplace at ~200–400 concurrent.**
   `sweepStaleSessions` is a single scheduled instance running 5 jobs sequentially
   with per‑doc transactions in a `for…await` loop (`sweepSessions.ts:76,113,166`),
   under the v2 scheduler's 60s default timeout (no `timeoutSeconds` override).
   `billStaleActive`+`expirePaused`+`expireWaiting` at `limit(200)` each ≈ 48–72s →
   during a correlated disconnect (carrier blip, forced app update) the 60s timeout
   kills the run **before `reconcileAvailability`/`reconcileStaleOnline`** → astrologers
   stuck `available:false` and ghost‑online accumulate. Billing itself stays correct
   (clamped), so this degrades the marketplace, it doesn't lose money.

3. **P1 — `deleteAccount` can time out and half‑delete (GDPR/DPDP).**
   `adminAndDeletion.ts:132` loads all of a user's consultations (no limit) and
   sequentially deletes messages/typing/Storage per consultation + 6 more passes,
   under the 60s callable timeout. A heavy user times out → `auth.deleteUser` never
   runs → account left half‑deleted, login still valid, erasure incomplete.
   (Today's completeness fix increased the work per account, so this got sharper.)

**Individual‑user crash (any scale):**
- **P1 — Flutter mid‑session crash on a money field type.** `packages/shared_flutter/lib/src/models/consultation.dart:96‑102` uses `x as int` on money/time fields. The day the backend emits a Firestore double (e.g. `900.0`), the cast throws inside the live `StreamProvider` and tears down the consultation screen mid‑call. The safe `(x as num).toInt()` pattern is already used for `rating` in the same file — just not for money. **Highest‑priority correctness fix.**

## Other findings this pass

- **P2 — Agora uid collision.** `agora/token.ts:37` `numericUid = typeof agoraUid === 'number' ? agoraUid : 0`. If the client omits a distinct uid, both participants join as uid 0 → one kicks the other → calls silently fail to connect.
- **P2 — Hot popular‑astrologer / AI persona doc.** Every settle increments `astrologers/{id}` + `private/financials` (`endConsultation.ts:132‑136`, `sweepSessions.ts:141‑145`). A hot AI persona (unlimited concurrent chats) completing >1 session/sec exceeds Firestore's ~1 write/s/doc soft limit → contention on that reader.
- **P2 — No `minInstances`.** Every money‑critical callable cold‑starts (~1.5–3s) when idle; tail‑latency spikes during the evening ramp. Money is safe (resilient by design); UX buttons hang.
- **P2 — Admin "live" views aren't live** (`SessionsConsole.tsx:35`, `ActiveConsultationsCard.tsx:36` are one‑shot `getDocs`, not `onSnapshot`).
- **P2 — Admin role gating is 100% client‑side** (`(dashboard)/layout.tsx:44‑49`); no server middleware. Rules are the only real gate.
- **P3 — Resume paths don't re‑seed presence markers.** `resumeConsultation`/`autoResumePausedSession` reset `lastTickAt` but not `customerLastTickAt`/`astrologerLastTickAt` (unlike activation), so billing briefly stalls after a resume. Self‑corrects; never over‑bills. (Regression from today's symmetry change.)
- **P3 — Multi‑partial refund ~1 paise wallet/bonus drift** (`refund.ts:55‑57`). Cosmetic; total refund exact.
- **P3 — Read boundary untyped.** `snap.data()!` is `any`; `types.ts` is decorative and has drifted (`refundedPaise`, `chatBonusBalance`, `chatGraceUsed` undeclared).
- **P3 — No warehouse/BigQuery export.** All reporting is live Firestore reads.
- **P3 — Earnings‑credit logic duplicated** across `endConsultation.ts` and `sweepSessions.ts`.
- **P3 — `DATA_MODEL.md` stale** (config defaults + ~8 consultation fields out of date).

## Cost at 10k
~$400–800/mo mid case, ~$1–1.5k heavy. Dominant driver: Firestore writes from the
10s × 2‑party billing tick (3 writes/tick), then Firestore reads from the unbounded
admin dashboards. `walletTransactions` grows forever (retained by design → needs TTL/archival).

## Correctness re‑verify of today's fixes — HELD
Presence gate, single‑tick clamp, session lock, refund split, and webhook resolution
were adversarially re‑verified: no over‑billing, no double‑charge, no stuck lock, no
broken idempotency; ledger reconciles with `pendingPayout` in all traced cases. Only
the two P3 follow‑ups above (resume markers, paise drift) — both customer‑favorable.

## Verdict — production‑ready for 10k?

**The financial core is production‑ready.** It's the best‑engineered part and it
scales. But `PRE_LAUNCH.md` as written (store/legal/security) is **not sufficient
for 10k** — these scale items must be ADDED and done first:

**Must‑fix before 10k (ordered):**
1. ✅ **DONE** — Flutter money‑field cast crash (`consultation.dart` + all models):
   every unsafe `as int` on a money field → `(as num).toInt()`; double‑parse test added.
2. ✅ **DONE** — Admin dashboards no longer download whole collections. Users table
   paginates server‑side (Firestore cursors) + reads denormalized `usageSeconds`
   (no consultations scan) + `getCountFromServer` total + server prefix search;
   sessions console split into bounded live/completed queries; operations counts/
   sums use `getCountFromServer` / `getAggregateFromServer`; revenue & consultation‑
   activity charts read a per‑day `dailyStats` rollup (triggers `rollupWalletTxn` /
   `rollupConsultation`). Nothing unbounded reaches the browser. (Users/astrologers‑
   bounded cards left as direct reads — fine at ≤10k.)
3. ✅ **DONE** — Sweep sharded: each job drains its batch in bounded‑parallel chunks
   (`forEachLimited`, 40 concurrent txns), the 5 jobs run concurrently, `timeoutSeconds`
   300, scan ceilings 200/300 → 500.
4. ✅ **DONE** — `deleteAccount` split into a fast synchronous critical phase (revoke +
   disable login, strip PII, enqueue) + an idempotent background worker
   (`processAccountDeletion`, 540s) that drains content then deletes the Auth user.
5. ✅ **DONE** — Agora uid derived from role (customer=1, astrologer=2) — collision‑proof.
6. Hot astrologer/AI counter → distributed counter or event‑sourced aggregation. ~1–2d
   *(deferred — only bites at viral scale, not 10k)*
7. `minInstances: 1` on money‑critical callables — cold‑start latency. ~0.25d
   *(LAUNCH‑time setting — see PRE_LAUNCH; costs 24×7 with zero users)*
8. ✅ **DONE** — Resume presence re‑seed (`resumeConsultation` + `autoResumePausedSession`);
   proportional wallet/bonus refund split; `types.ts` + `DATA_MODEL.md` refreshed
   (`usageSeconds`, `chatBonusBalance`, `chatGraceUsed`, `refundedPaise`, `deletionState`,
   `dailyStats`, `accountDeletions`).

**Status:** all must‑fix items for a 10k pilot are done except #6 (viral‑scale only)
and #7 (a launch‑time toggle). The core was already production‑ready; the admin
console OOM, the sweep degradation, and the half‑delete risk — the three operational
failure modes this audit flagged — are now closed. **Ready for a 10k pilot** once the
pending function + index + rules deploy lands (see the deploy runbook).
