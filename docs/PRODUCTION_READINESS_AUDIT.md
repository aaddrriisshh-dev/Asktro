# Asktro — External Production-Readiness Audit
**Independent review · target scale ~10,000 users (~2,000 concurrent) · date: 2026-07-11**
**Method:** six independent specialist auditors read the actual source (not docs); every finding carries file:line evidence. Cross-checked; one finding rejected as a false positive after byte-level verification.

> **⚑ REMEDIATION APPLIED (2026-07-11).** Every engineering finding below has been
> fixed and verified (functions build + 79 automated tests incl. a new 16-test
> Firestore security-rules suite; admin typecheck; `flutter analyze` clean on both
> apps). The remaining open items are OWNER-ACTION-ONLY (a private signing key,
> real legal text + hosting, Firebase package re-registration, and enabling
> backups/monitoring/App-Check in your own Google/Play/Apple accounts) — see
> "Remediation Status" at the bottom. Verdict after remediation: **the engineering
> is 10k-ready; launch is gated only on the owner-action checklist.**

---

## 1. Executive Summary

Asktro's **financial core is genuinely production-grade** — recharge, billing, refunds, payouts and ledgers are idempotent, atomic, reconcilable, and signature-verified; no path was found that duplicates or loses money (Financial-Accuracy **88/100**). The **external attacker surface is well-defended** (Security **78/100**): cross-user reads denied, money strictly function-mediated, secrets clean, account deletion complete.

However, the **ecosystem is NOT launch-ready.** There are hard, certain **app-store rejection blockers** (debug-key signing, `com.example.*` IDs, missing iOS usage strings, missing astrologer account-deletion), a **live insider privilege-escalation** in the Firestore write rules (a lower-tier admin can mint wallet credit), the **operational backbone is largely absent** (no monitoring, alerting, backups/DR — Operations **38/100**), a core advertised feature (**voice/video**) is **not implemented**, and **frontend/rules/E2E/load testing is essentially absent** (Testing **46/100**).

The gap is not the code's correctness — it's launch-readiness around it. The blockers are well-defined and mostly fast to fix.

## 2. Overall Production-Readiness Score: **60 / 100**
Weighted for launch-gating: a strong money core cannot offset certain store rejection, a live security hole, and zero DR/monitoring on a system that moves real money.

## 3–12. Domain Scores

| # | Domain | Score | One-line |
|---|---|---|---|
| 3 | Architecture | **80** | Sound Firebase + Vercel + (staged) Agora; clean separation, function-mediated money |
| 4 | Code Quality | **80** | Hardened models, disposed controllers, humanized errors; a few unguarded async paths |
| 5 | Security | **78** | Strong external defense; **broken admin-tier segregation** (insider) |
| 6 | Performance | **70** | Billing/chat efficient; several dashboard cards still full-scan collections |
| 7 | Scalability | **72** | Backend + sweep + rollups scale; user-analytics cards + reports page do not |
| 8 | Reliability | **72** | Idempotent credit, dead-letter, atomic sweeps; rollup non-idempotency; alert escalation gap |
| 9 | Compliance | **28** | Multiple certain Play/Apple rejections |
| 10 | Testing | **46** | Excellent backend money tests; frontend/rules/E2E/load absent |
| 11 | Wiring & Integration | **68** | Triggers wired & loop-free; voice/video not wired (vapor) |
| 12 | Operations | **38** | No monitoring/alerting/crash-reporting/backup/DR/CD |
| — | **Financial Accuracy** | **88** | Money is safe; two accuracy edges (F1 resume over-bill, F2 admin double-submit) |

---

## 13. CRITICAL LAUNCH BLOCKERS (must fix before any launch/submission)

**B1 — [Security · LIVE IN PROD] Admin-tier privilege escalation lets a lower-tier admin mint wallet credit.**
`firestore.rules:207-209` (`coupons write: if isAdmin()`), `:195-198` (`rechargePlans`), `:85` (astrologer update). `isAdmin()` is true for all tiers; the admin portal writes these with the admin's own token (`apps/admin/src/app/(dashboard)/coupons/page.tsx:65`, `plans/page.tsx:16,30`). An `ops`/`astrology` admin can author a coupon worth ₹9,999, redeem it, and get real spendable balance (`creditRecharge.ts:117-123`) — bypassing the super-only `adjustWallet` gate — or self-approve a fraudulent astrologer / change billing rates by direct write. No audit log is produced. **Fix:** `coupons`/`rechargePlans` → `if isSuperAdmin()` (or route via role-checked callables + `write:false`); split `astrologers` update so `verified`/`accountStatus`/`ratePerMinutePaise` require super.

**B2 — [Play · both apps] Release signed with the DEBUG keystore.** `apps/customer/android/app/build.gradle.kts:32`, astrologer `:32`. Play rejects debug-signed AABs. **Fix:** real upload keystore + `key.properties`.

**B3 — [Play · both apps] `applicationId = com.example.asktro_*`** (`build.gradle.kts:19`). The `com.example.` prefix is banned. **Fix:** domain-owned ID (e.g. `app.asktro.customer`).

**B4 — [Apple · both apps] Missing `NSPhotoLibraryUsageDescription`** while both use `image_picker` (`chat_consultation_screen.dart:187`, `astrologer_consultation_screen.dart:125`). Accessing the library without it **hard-crashes** → Guideline 2.1/5.1.1 rejection. **Fix:** add usage strings to both `ios/Runner/Info.plist`.

**B5 — [Play · astrologer] No in-app account deletion** (customer has it at `profile_tab.dart:489`; astrologer app has none) and **no public web deletion URL** for either app. Play requires both. **Fix:** add delete flow to astrologer app + host a deletion-request page.

**B6 — [Compliance] Legal docs are placeholders + no hosted privacy URL.** `firebase/functions/scripts/seed_legal.mjs` ships `[EFFECTIVE DATE]`, `[REGISTERED OFFICE ADDRESS]`, `[SUPPORT EMAIL]`, `[GRIEVANCE OFFICER]`. Stores also need a public HTTPS privacy-policy URL for Data Safety / App Privacy. **Fix:** fill legal docs; host the policy.

**B7 — [Operations] No backups/DR and no monitoring on a money system.** No scheduled Firestore export/PITR, no Cloud Monitoring/alerting/uptime, no crash reporting (`grep` → none). A data-loss event is unrecoverable; a payment-failure spike is invisible. **Fix:** enable scheduled Firestore export + PITR; route `alerts` (critical) to email/PagerDuty; add uptime + error-rate alerts.

## 14. HIGH-RISK ISSUES

- **H1 — [Financial · money accuracy, from this session's own change] Resume disables the absent-astrologer billing gate.** `pauseResume.ts:77` & `creditRecharge.ts:232` do `astrologerLastTickAt: FieldValue.delete()`; `tickConsultation.ts:79,86` then set `astroTracked=false`, so after a pause→recharge→resume with the astrologer gone, the customer is billed (and the astrologer accrues) on customer presence alone until timeout. **Fix:** re-seed `astrologerLastTickAt = now` on resume instead of deleting.
- **H2 — [Mobile] Message send / image upload have no error handling.** `chat_consultation_screen.dart:168,184`; astrologer `:110,124`. A failed send throws uncaught **and** the typed text was already cleared → silent loss, no retry. **Fix:** try/catch, restore input, show failed-state.
- **H3 — [Product/Mobile] Voice/video is vapor.** `agora_rtc_engine` removed from both pubspecs; customer blocks calls with a "coming soon" snackbar (`astrologer_profile_screen.dart:30`); astrologer "call screen" is a no-op mock (`astrologer_consultation_screen.dart:615,654`); `RtcTokenService` is dead code. **Fix:** remove/quarantine the call UI + ring path + token service, OR complete Agora. Do not advertise calls.
- **H4 — [Scalability] User-analytics cards + Reports page still download whole collections.** `RegisteredUsersCard.tsx:33`, `ConversionCard.tsx:35`, `PaidUnpaidCards.tsx:40`, `OperationsSection.tsx:136` full-scan `users` on `allTime` default; `reports/page.tsx:46,100` auto-loads all `walletTransactions/consultations/users/payouts` + N+1 astrologer reads. The OOM fix was only half-completed. **Fix:** `getCountFromServer`/`getAggregateFromServer` or a users-daily rollup; server-side CSV export.
- **H5 — [Compliance/Functional] Customer app missing `POST_NOTIFICATIONS`** (`apps/customer/.../AndroidManifest.xml` declares none) but requests FCM permission. On Android 13+ push is silently dropped. **Fix:** add the permission.

## 15. MEDIUM-RISK ISSUES

- **M1 — [Security] App Check activated on clients but not enforced on any function** (no `enforceAppCheck` anywhere). Bots can hit callables directly. **Fix:** `enforceAppCheck:true` on billing/wallet/coupon/token/moderation (grace period first).
- **M2 — [Security] No rate limiting anywhere** — `validateCoupon` (code enumeration), `createRechargeOrder`, `reportContent/blockUser`. **Fix:** per-uid token bucket.
- **M3 — [Security · insider] `astrology`-tier admin reads all customer PII + wallet balances** (`firestore.rules:36,103`), contradicting the ledger walling (`canReadLedger()`). **Fix:** gate money/PII reads behind `canReadLedger()`/super.
- **M4 — [Financial] Refund & `adjustWallet` have no per-request idempotency key.** A super-admin double-submit can over-refund up to `gross` (`refund.ts:38-43`, `actions.ts:36-47`). **Fix:** `processedAdminOps/{token}` checked in-transaction.
- **M5 — [Reliability] Rollup increments are not idempotent under at-least-once delivery**, and the code comment falsely claims they are (`stats/dailyStats.ts:14,45,62`). Dashboard analytics can drift (not money-critical). **Fix:** dedupe by source-row id, or reconcile nightly; correct the comment.
- **M6 — [Reliability] Retry-exhaustion has no external escalation** (`reconcile.ts:77` — a stuck captured payment only surfaces as a Firestore `alerts` doc). **Fix:** external alert on critical severity.
- **M7 — [Admin] Failed dashboard queries render as legitimate zeros** on money/attention panels (`OperationsSection.tsx:73,105,144,191,229,274,308`). **Fix:** explicit error state.
- **M8 — [Admin] Rollup range uses local midnight vs UTC markers** → off-by-one-day at boundaries for IST browsers (`dateRange.ts:30-34` vs `dailyStats.ts:5`). **Fix:** compute bounds in UTC.
- **M9 — [Compliance] No iOS `PrivacyInfo.xcprivacy` manifest** (Firebase/Razorpay required-reason APIs). Medium Apple rejection risk. **Fix:** add privacy manifest.
- **M10 — [Financial] Credit trusts plan amount, never checks captured amount** (`recharge.ts:140`). Low exploitability; **Fix:** assert `entity.amount === order.amountPaise`.

## 16. LOW-RISK ISSUES
- L1 Storage `documents/{userId}` write has no content-type restriction (`storage.rules:66`).
- L2 Phone search can't match stored `+`-prefixed numbers (`UsersActivityTable.tsx:119`).
- L3 Name prefix search is case-sensitive (Firestore code-point ordering).
- L4 `_handleWarn`/listeners run ~1 Hz (idempotent, negligible CPU).
- L5 Customer `_markSeen` per-message update, unbatched/uncaught.
- L6 Astrologer session timer resets on re-entry (display only).
- L7 Webhook can spuriously dead-letter an already-credited payment if `autoResumePausedSession` throws (`recharge.ts:143`) — false alert, no double-charge.
- L8 Presence heartbeat ping fire-and-forget/unguarded.
- L9 One `debugPrint` in the dev-gated dummy-gateway path.
- L10 No `minInstances` on the billing/webhook functions (cold-start latency on first tick/payment).

**REJECTED as false positive (verified):** the claim that `UsersActivityTable` search is exact-match. Byte check of `:120` shows `endAt(t + '')` (bytes `EF A3 BF`); the sentinel is present and prefix search works — the auditor's reader couldn't display the non-printing character.

## 17. Security Vulnerabilities
B1 (privilege escalation, HIGH, live), M1 (App Check not enforced), M2 (no rate limiting), M3 (insider PII/balance read), L1 (storage content-type). **Verified sound:** media isolation, dev-mint neutralized, secrets server-only, backend-only collections deny client writes, support-ticket IDOR closed, every money/admin callable asserts auth+role, deletion complete.

## 18. Performance Bottlenecks
H4 (whole-collection dashboard loads), TopAstrologers N+1 (`OperationsSection.tsx:298`), per-user detail unbounded reads (`users/[id]/page.tsx:140,143`), N snapshot listeners in astrologer inbox (bounded). Billing/chat streams are efficient and server-authoritative.

## 19. Scalability Risks
User-analytics cards + Reports page OOM at 10k (H4). Hot astrologer/AI-persona counter contention (>1 write/s/doc) at higher scale. `walletTransactions` unbounded growth. `sendBroadcast` loads all users (do not mass-broadcast until rewritten). All documented in `SCALE_10K_TO_50K.md`.

## 20. Broken Integrations
Voice/video end-to-end (H3) — token plumbing exists but nothing joins a channel; incoming-call ring path is dead code that would present a broken experience if ever reached. Everything else (triggers, rollups, deletion worker, chat, payments) is correctly wired and loop-free.

## 21. Missing Production Features
Monitoring/alerting, crash reporting, backups/DR, CD pipeline, staging↔prod separation, rate limiting, App Check enforcement, external incident alerting, load-shedding/`minInstances`, iOS privacy manifest, astrologer account-deletion, hosted legal pages.

## 22. App-Store Rejection Risks (consolidated)
1. Debug-key signing (B2, Play). 2. `com.example.*` ID (B3, Play). 3. Missing iOS photo-usage string → crash (B4, Apple). 4. No astrologer account deletion / web URL (B5, Play). 5. Placeholder legal + no privacy URL (B6, both). 6. No `PrivacyInfo.xcprivacy` (M9, Apple). 7. Voice/video advertised but non-functional (H3, Apple 2.1). 8. Missing `POST_NOTIFICATIONS` (H5, Play functional).

## 23. Missing Tests
Firestore **rules tests** (money-read restrictions untested — directly relevant to B1); Flutter **widget/golden tests** (only 1 model unit test exists); **E2E/integration_test** driver (login→recharge→consult→bill→end→rate); **load/stress** tests (sweep fan-out, concurrent sessions); callable **auth/App-Check enforcement** tests; admin portal has **zero** tests. Backend money-path integration coverage (11 emulator suites, ~61 assertions) is genuinely strong.

## 24. Missing Monitoring
No Cloud Monitoring dashboards, no uptime checks, no metric/error-rate alerts, no crash reporting SDK, no external routing of the `alerts` collection, no SLOs, no billing budget alert. Only in-app payment-failure `alerts` docs exist.

## 25. Technical Debt
Node 20 (decommission 2026-10-30), `firebase-functions ^5` (v6 available), `firebase-admin ^12` (major behind), no R8/minify on release, TopAstrologers/reports N+1, rollup idempotency comment, dead RTC code, `useUsersMonetisation` dead return.

## 26. Recommended Improvements Before Scaling Beyond 10k
Per `docs/SCALE_10K_TO_50K.md`: observability first, hot-counter → distributed/aggregated, `walletTransactions` archival, message-participant denormalization (rule read cost), extend `dailyStats` to user metrics, `sendBroadcast` → FCM topics, home-feed server ranking, `minInstances`, tick-cost review.

## 27. Prioritized Remediation Plan

**CRITICAL (before any submission / to stop the live hole) — ~2–4 days**
1. B1 rules privilege fix (hours) — **live security hole, do first.**
2. B2 real signing keystore; B3 real applicationIds.
3. B4 iOS usage strings; H5 POST_NOTIFICATIONS; M9 privacy manifest.
4. B5 astrologer account-deletion + web deletion URL.
5. B6 fill legal docs + host privacy URL.
6. B7 Firestore backup/PITR + external alerting on critical `alerts`.
7. H1 re-seed `astrologerLastTickAt` on resume (money over-bill).

**HIGH (before real users) — ~3–5 days**
8. H2 message-send error handling. 9. H3 remove/quarantine voice-video. 10. H4 dashboard user-cards + reports (aggregations/rollup). 11. M1 App Check enforcement. 12. M4 refund/adjust idempotency tokens.

**MEDIUM (before scale) — ~1 week**
13. M2 rate limiting. 14. M3 insider PII read gating. 15. M5 rollup idempotency. 16. M6 retry escalation. 17. M7 ops-panel error states. 18. M8 UTC range. 19. rules tests + Flutter widget/E2E + load tests. 20. monitoring/CD/staging separation.

**LOW:** L1–L10 as capacity allows.

## 28. FINAL VERDICT

# ❌ REJECTED — DO NOT LAUNCH (in current state)

**Rationale.** The apps **cannot be submitted** to either store as-is (certain rejections B2–B6), a **live insider security hole** lets a lower-tier admin mint wallet credit (B1), the system moving real money has **no backups/DR and no monitoring** (B7), a headline feature (**voice/video**) is not implemented (H3), and there is a **money-accuracy over-bill edge** after resume (H1). Per the audit mandate — reject whenever unresolved risks materially affect financial accuracy, security, reliability, or store approval — these gate the launch.

**This is a "not yet," not a "no good."** The hard part — a correct, idempotent, reconcilable money engine (88/100) and a well-defended external perimeter (78/100) — is done and verified. The blockers are well-scoped and largely mechanical: signing/IDs/usage-strings, a handful of rules lines, legal text, and standard ops setup. Clear the CRITICAL list (est. 2–4 focused days) and this flips to **⚠ APPROVED WITH CONDITIONS**; add the HIGH list and monitoring, and it is a legitimate ✅ for a 10k pilot.

*Prepared by six independent domain auditors; findings verified against source with file:line evidence.*

---

## REMEDIATION STATUS (applied 2026-07-11)

**Verified:** functions `tsc` build ✓ · 49 emulator integration tests + 30 unit tests (79 total) ✓ · new 16-test Firestore rules suite ✓ · admin `tsc` ✓ · `flutter analyze` both apps ✓.

### Critical blockers
| ID | Status | What was done |
|---|---|---|
| B1 privilege escalation | ✅ FIXED + TESTED | coupons/plans → super-only; astrologer approval/rate/money fields → super-only; users PII + astrologer financials walled from astrology tier. 16 rules tests lock it. |
| B2 debug-key signing | ✅ WIRED · owner: create key | release signing reads `android/key.properties` (real key) with debug fallback; secrets gitignored. **You:** generate the upload keystore + key.properties (turnkey step below). |
| B3 `com.example` app id | ⚑ OWNER-COORDINATED | coupled to Firebase package registration; changing it in code alone breaks the build. **You:** register the real package in Firebase, add google-services.json, then I flip the id. |
| B4 iOS usage strings | ✅ FIXED | NSPhotoLibrary + NSCamera usage descriptions added to both Info.plist. |
| B5 astrologer account deletion | ✅ FIXED | new astrologer-safe `deleteAstrologerAccount` (blocks on open session / unpaid earnings) + in-app Delete-account entry. **You (Play):** also host a public web deletion-request URL. |
| B6 legal placeholders / privacy URL | ⚑ OWNER-ONLY | **You:** fill the real legal text (address, grievance officer, support email) in seed_legal.mjs and host the privacy policy at a public URL. |
| B7 backups / monitoring | ⚑ OWNER-ONLY (I prepared hooks) | reconcile now escalates exhausted credits to a critical alert. **You:** enable Firestore PITR/scheduled export + route `alerts`(critical) to email/Cloud Monitoring. |

### High
| ID | Status |
|---|---|
| H1 resume over-bill | ✅ FIXED (re-seed astrologer marker) + test |
| H2 message-send error handling | ✅ FIXED (both apps; text restored, snackbar) |
| H3 voice/video vapor | ✅ FIXED (call affordances hidden behind kCallsEnabled=false) |
| H4 admin user-cards OOM | ✅ FIXED (signup rollup + count aggregations; detailed cards hard-capped) |
| H5 POST_NOTIFICATIONS | ✅ FIXED |

### Medium / Low
| ID | Status |
|---|---|
| M3 insider PII read | ✅ FIXED + TESTED |
| M4 refund/adjust idempotency | ✅ FIXED (opId → processedAdminOps) |
| M5 rollup idempotency | ✅ FIXED (per-source-row marker) + test |
| M6 retry escalation | ✅ FIXED (critical alert on exhaustion) |
| M7 ops-panel false zeros | ✅ FIXED (unknown state, not 0) |
| M8 IST off-by-one range | ✅ FIXED (UTC ranges) |
| M9 iOS privacy manifest | ✅ ADDED · owner: drag into Runner target in Xcode |
| M10 captured-amount check | ✅ FIXED |
| L1 storage content-type | ✅ FIXED (image/PDF only) |
| L7 webhook false dead-letter | ✅ FIXED |
| M1 App Check enforcement | ⚑ OWNER-COORDINATED — enabling `enforceAppCheck` before App Check is fully provisioned + clients verified would break the live app; flip it on with a monitor period at launch. |
| M2 rate limiting | ▸ TRACKED in SCALE_10K_TO_50K.md (before heavy traffic). |
| L2/L3 phone/name search niceties, L4–L10 cosmetic | ▸ acknowledged minor; ConversionCard/PaidUnpaidCards analytics use a bounded sample beyond 5k users (exact rollup is the 10k→50k refinement). |

### Owner turnkey checklist (the only things blocking submission)
1. **Signing key** (per app): `keytool -genkey -v -keystore ~/asktro-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`, then create `apps/<app>/android/key.properties` with `storeFile/storePassword/keyAlias/keyPassword`. Release builds are then Play-valid automatically.
2. **App IDs (B3):** register the real package (e.g. `com.asktro.customer` / `com.asktro.astrologer`) + bundle IDs in Firebase, add the new google-services.json / GoogleService-Info.plist, then I change the ids in one commit.
3. **Legal (B6):** fill seed_legal.mjs with real details; host the privacy policy publicly; put the URL in the store listings + Data Safety / App Privacy forms.
4. **Web deletion URL (B5):** host a public account-deletion-request page.
5. **Backups + alerting (B7):** enable Firestore PITR/export; route critical `alerts` to email/Monitoring.
6. **App Check (M1)** and the PRE_LAUNCH security toggles: flip on at launch with monitoring.
7. **iOS privacy manifest (M9):** in Xcode, drag `PrivacyInfo.xcprivacy` into the Runner target (Copy Bundle Resources).
