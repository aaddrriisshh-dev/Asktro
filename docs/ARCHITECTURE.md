# ASKTRO — Architecture

## Monorepo layout
```
asktro/
├── apps/
│   ├── customer/      Flutter customer app (feature-first, clean arch)
│   ├── astrologer/    Flutter astrologer app
│   └── admin/         Next.js + React admin portal (App Router, TS)
├── packages/
│   └── shared_flutter/  shared Dart: models, theme/design system, DI,
│                        service interfaces, repositories, utils
├── firebase/
│   ├── functions/     Cloud Functions (TypeScript) — all business logic
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── storage.rules
│   └── remoteconfig.template.json
└── docs/
```

## Layers (Flutter, both apps)
Feature-first + clean architecture:
```
lib/
├── main.dart
├── app/                 app widget, router, bootstrap, DI wiring
├── core/                (mostly re-exported from shared_flutter)
└── features/<feature>/
    ├── data/            data sources (Firebase), DTOs, repository impls
    ├── domain/          entities, repository interfaces, use cases
    └── presentation/    controllers/notifiers, screens, widgets
```
- **State management:** Riverpod (compile-safe DI + reactive state).
- **DI:** Riverpod providers; Firebase instances injected so they can be faked in tests.
- **Repository pattern:** domain depends on interfaces; data layer implements
  them against Firestore/Functions. Presentation never touches Firebase directly.
- **Error handling:** `Result<T>` / typed `Failure`s; no raw exceptions to UI.
- **Cross-cutting:** logging, `AnalyticsService`, `CrashReporter` (Crashlytics)
  as interfaces in `shared_flutter`.

## Shared package (`shared_flutter`)
Design system (Part 2), immutable models (Freezed-style hand-written or
`json_serializable`), service **interfaces**, and Firestore path constants.
Both apps depend on it via path. Money helpers live here (paise ↔ rupee) so
customer and astrologer format identically.

## Backend
- **Firestore** is the datastore + realtime transport (listeners for wallet,
  chat, timer, online status, notifications).
- **Cloud Functions (TS)** hold *all* money/time logic (see BILLING_ENGINE.md).
  Callable functions for client actions; HTTPS webhook for Razorpay; scheduled
  sweep for stale-session safety; Firestore triggers for rating/earnings rollups.
- **Storage** for profile/banner/chat/voice/verification assets, per-folder rules.
- **Remote Config** mirrors `config/global` for instant client-side reads of
  price/min-wallet/warn-times/flags without an app update.
- **FCM** for push (topics: users, astrologers, marketing, low-balance, etc.).
- **Crashlytics + Analytics** wired in both apps.

## Admin portal
Next.js App Router + TypeScript + Firebase JS SDK. Auth via Firebase with admin
custom claims; role-based route guards. Reads Firestore directly for views;
**all mutations that touch money/status go through Cloud Functions** so the
audit log and rules stay authoritative. Server-side pagination & filtering.

## Security model
- Auth custom claims: `astrologer{approved}`, `admin{adminRole}`; default = customer.
- Firestore/Storage rules scoped per role; balance/timer/billing fields are
  **function-write-only** (deny all client writes).
- Razorpay signature verification + idempotency; secrets only in Functions config.
- Agora tokens minted server-side; App Certificate never ships to clients.
- Every admin mutation writes an immutable `auditLogs` entry.

## Environments / config
- No secrets in the repo. `.env.example` documents every value; real values
  come from `docs/SETUP_CHECKLIST.md` and go into Functions config / app config
  files (`google-services.json`, `GoogleService-Info.plist`, admin `.env.local`).
- Firebase **emulator suite** (Auth, Firestore, Functions, Storage) is the local
  verification harness; jest unit tests cover billing math.
