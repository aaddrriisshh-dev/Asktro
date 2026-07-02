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
- [ ] Package scaffold (`pubspec.yaml`, analysis_options)
- [ ] Color palette, spacing, radii, shadows, typography (Poppins)
- [ ] `AsktroTheme` (light, swappable for future dark)
- [ ] Buttons: primary (gradient, loading, disabled, scale-tap), secondary
- [ ] Cards, chips, badges (verified/online), avatars
- [ ] Inputs: search bar, text field, OTP field
- [ ] Bottom sheets, dialogs (glass low-balance dialog)
- [ ] Skeleton/shimmer loaders, empty & error state widgets
- [ ] Animated wallet counter, confetti success, pulse
- [ ] Shared Dart models (User, Astrologer, Consultation, Wallet, Txn, etc.)
- [ ] Shared service interfaces (Auth, Wallet, Consultation, Repo contracts)
- [ ] DI container + Result/failure types + logging + analytics interface

## Phase 2 — Firebase backend: data model, rules, indexes
- [ ] `firestore.rules` (per-role: user/astrologer/admin)
- [ ] `storage.rules` (per-folder scoping)
- [ ] `firestore.indexes.json` (all composite indexes from Part 7)
- [ ] `remoteconfig.template.json` (price, min wallet, warning times, flags)
- [ ] Functions project scaffold (TS, eslint, tsconfig, jest)

## Phase 3 — Consultation / wallet / billing Cloud Functions (CORE)
- [ ] Wallet model + atomic transaction helpers
- [ ] `createConsultation` (checks online/available/wallet, atomic session create)
- [ ] Server timer + `tickBilling` (₹0.15/sec deduction, scheduled/heartbeat)
- [ ] `pauseConsultation` / `resumeConsultation`
- [ ] Low-balance level detection (L1 ~2min, L2 ~30s, L3 exhausted)
- [ ] `endConsultation` (final charge, receipt, history, refund unused)
- [ ] `rechargeWallet` (Razorpay signature verify, idempotent, bonus)
- [ ] `validateCoupon`, `applyReferralReward`
- [ ] `rateConsultation` (avg rating recompute)
- [ ] Agora token generation (RTC token builder)
- [ ] Notification sender (FCM)
- [ ] Fraud guards (single active session, no negative wallet, dup-callback)
- [ ] Jest unit tests for billing math + emulator integration tests

## Phase 4 — Customer app (Flutter)
- [ ] App scaffold, DI wiring, routing, Firebase init
- [ ] Splash → onboarding (3 pages) → login (phone OTP/Google/Apple) → OTP
- [ ] Home (greeting, search, banner carousel, astrologer rails)
- [ ] Search + filters
- [ ] Astrologer profile + sticky consultation bar
- [ ] Consultation entry checks → session
- [ ] Chat screen (realtime, typing, receipts, media, voice notes)
- [ ] Voice call (Agora) + wallet/session header
- [ ] Video call (Agora) + PiP/switch camera
- [ ] Timer header (backend-driven), low-balance popup, final warning, paused
- [ ] Recharge sheet (Razorpay) → resume same session
- [ ] Wallet page (animated balance, txns, coupons, referral)
- [ ] Consultation history, favourites/follow
- [ ] Notifications, profile/settings, help & support, delete account
- [ ] Offline handling, skeleton loaders, friendly errors

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
