# ASKTRO — Build Roadmap & Status Checklist

> **Living document.** Updated as each slice lands. `[x]` done & verified,
> `[~]` in progress, `[ ]` not started. "Verified" means: TypeScript compiles
> / emulator test passes for backend; Dart analyzes cleanly for Flutter;
> `next build`/`tsc` passes for admin.

Astrology **consultation** platform. Server-authoritative billing at **₹9/min
= ₹0.15/sec**. Clients only display state — never compute money or time.

---

## Environment note (this build environment)

- ✅ Node 22 / npm 10 available → Cloud Functions (TS) can be compiled & unit-tested here.
- ❌ No Flutter/Dart SDK → Flutter source is written to spec but compiled by the owner locally.
- ❌ No Firebase CLI → emulator runs are done by the owner; rules/indexes/config are authored here.

Every phase below is written so the owner can `flutter pub get` / `firebase deploy`
without code changes once keys from `docs/SETUP_CHECKLIST.md` are supplied.

---

## Phase 0 — Foundation, docs & scaffold
- [x] Monorepo directory structure
- [x] `docs/ROADMAP.md` (this file)
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/DATA_MODEL.md` (Firestore collections, Part 7)
- [x] `docs/BILLING_ENGINE.md` (consultation/timer/wallet design, Part 4)
- [x] `docs/SETUP_CHECKLIST.md` (owner accounts/keys guide → phase unlock map)
- [x] `.env.example` (all keys, placeholders only)
- [x] `firebase.json`, `.firebaserc` template
- [x] Root `README.md` (owner-supplied values list, run instructions)
- [x] Root tooling: `.gitignore`

## Phase 1 — Design system (`packages/shared_flutter`)
- [x] Package scaffold (`pubspec.yaml`, analysis_options)
- [x] Color palette, spacing, radii, shadows, typography (Poppins)
- [x] `AsktroTheme` (light, swappable for future dark)
- [x] Buttons: primary (gradient, loading, disabled, scale-tap), secondary, destructive
- [x] Cards (white + gradient), chips, badges (verified/online/label), avatars (initials fallback)
- [x] Skeleton/shimmer loaders (self-contained), empty & error state widgets, loading overlay
- [x] Glass low-balance dialog (blur, spring), animated wallet counter
- [x] Shared Dart models (UserProfile, Astrologer, Consultation, RechargePlan, Banner, Txn, Notification, enums)
- [x] Shared service interfaces (Consultation, Wallet, RtcToken, Analytics, Crash, Logger)
- [x] Result/Failure types + money helpers (paise↔₹, timer formatting)
- [ ] Inputs (search bar, OTP field) — built in app feature layers
- [ ] DI container — Riverpod, wired per-app in Phase 4/5

## Phase 2 — Firebase backend: data model, rules, indexes
- [x] `firestore.rules` (per-role: user/astrologer/admin)
- [x] `storage.rules` (per-folder scoping)
- [x] `firestore.indexes.json` (all composite indexes from Part 7)
- [x] `remoteconfig.template.json` (price, min wallet, warning times, flags)
- [x] Functions project scaffold (TS, eslint, tsconfig, jest)

## Phase 3 — Consultation / wallet / billing Cloud Functions (CORE)
- [x] Wallet model + atomic transaction/ledger helpers
- [x] `createConsultation` (checks online/available/wallet, atomic session create)
- [x] Server timer + `tickConsultation` heartbeat (₹0.15/sec elapsed-time deduction)
- [x] `sweepStaleSessions` scheduled safety net (late heartbeat + paused timeout)
- [x] `activateConsultation`, `pauseConsultation` / `resumeConsultation`
- [x] Low-balance level detection (L1 ~2min, L2 ~30s, L3 exhausted)
- [x] `endConsultation` (final charge, receipt, astrologer net earning, counts)
- [x] `createRechargeOrder`/`verifyRecharge`/`razorpayWebhook` (signature verify, idempotent, bonus)
- [x] `validateCoupon`, referral reward (first-recharge, both wallets)
- [x] `rateConsultation` (avg rating recompute)
- [x] `generateAgoraToken` (RTC token builder)
- [x] Notification sender (FCM trigger + admin broadcast fan-out)
- [x] `onCustomerSignup`, `setUserRole`, `deleteAccount`
- [x] Admin actions: `adjustWallet`, `processPayout`, `setAstrologerStatus` (audit-logged)
- [x] Fraud guards (single active session, no negative wallet, dup-callback idempotency)
- [x] Jest unit tests: billing math + Razorpay signature (22 passing)
- [ ] Emulator integration tests (owner-run; needs Firebase CLI + JDK)

## Phase 4 — Customer app (Flutter)
- [x] App scaffold, DI wiring (Riverpod), routing (go_router), Firebase init + Crashlytics
- [x] Splash → onboarding (3 pages) → login (phone OTP/Google/Apple) → OTP
- [x] Home (greeting by time, search entry, banner carousel, 4 astrologer rails)
- [x] Search screen (name/language/expertise)
- [x] Astrologer profile + sticky consultation bar (chat/voice/video)
- [x] Consultation entry checks → createConsultation → navigate
- [x] Chat screen (realtime messages, bubbles, timer header, low-balance/paused/recharge/end)
- [x] Voice/Video call (Agora token + engine, mute/speaker/switch/end, timer)
- [x] Backend-driven timer header + heartbeat controller, low-balance dialog, paused sheet
- [x] Recharge screen (Razorpay checkout → verify → success), auto-resume on recharge
- [x] Wallet tab (animated balance, transaction history)
- [x] Consultation history tab
- [x] Notifications tab (unread badge), profile tab (referral, logout, delete account)
- [x] Data layer: repositories + service impls (RPC over Cloud Functions)
- [ ] Favourites/follow UI, help & support screens, offline banner — follow-up slice
- [ ] Media in chat (image/voice notes), typing/read receipts — follow-up slice
- [ ] `flutter analyze`/`flutter build` verification (owner-run; no Flutter SDK here)

## Phase 5 — Astrologer app (Flutter)
- [ ] Scaffold, login (approval gating), account-status screens
- [ ] Dashboard (online toggle, quick stats)
- [ ] Incoming request popup (accept/decline, timeout→missed)
- [ ] Active consultation screen (chat/voice/video, session earnings)
- [ ] Quick replies
- [ ] Earnings (graphs), payout request
- [ ] Consultation history, ratings, performance insights
- [ ] Profile edit (admin-approval where applicable), availability, notifications

## Phase 6 — Admin portal (Next.js + React, TS)
- [ ] Scaffold (App Router, TS, Firebase JS SDK, role-based auth)
- [ ] Dashboard KPIs + charts + live activity
- [ ] User management, Astrologer management + add astrologer
- [ ] Banner, recharge plan, bonus, coupon, referral management
- [ ] Global pricing + consultation settings
- [ ] Wallet management, payout management
- [ ] Support panel, push notifications, CMS, offers
- [ ] Reports (PDF/Excel/CSV), analytics, immutable audit log

## Phase 7 — Cross-cutting: notifications, analytics, offers/coupons/referrals
- [ ] FCM topics + client token registration
- [ ] Analytics events wired across all apps
- [ ] Offers/coupons/referrals end-to-end verified

## Phase 8 — Polish & QA
- [ ] Empty/loading/error states everywhere
- [ ] Billing edge-case test matrix (Part 4 testing requirements)
- [ ] Accessibility pass (touch targets, contrast, screen readers)
- [ ] Performance (pagination, image caching, 60fps)
- [ ] Final README/owner runbook

---

## Status log
- **2026-07-02** — Phase 0 started: scaffold + ROADMAP created.
- **2026-07-02** — Phase 0 done (all docs + root config committed).
- **2026-07-02** — Phase 2 done (Firestore/Storage rules, indexes, Remote Config).
- **2026-07-02** — Phase 3 done: full Cloud Functions billing engine, wallet,
  recharge, coupons, referrals, ratings, Agora, auth, notifications, admin.
  Typechecks clean (`tsc`), 22 unit tests passing. Next: Phase 1 design system.
- **2026-07-02** — Phase 1 done: shared_flutter design system + models + interfaces.
- **2026-07-02** — Phase 4 core done: customer app end-to-end vertical — auth →
  home/browse/search → profile → chat/voice/video consultation with live
  server-driven billing, low-balance/recharge/resume, end + rating, wallet,
  history, notifications, profile/delete. Written to spec; Flutter compile is
  owner-run (no SDK in this environment). Follow-up: favourites, chat media,
  offline banner, help/support screens.
