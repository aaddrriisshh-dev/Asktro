# ASKTRO

Premium **astrology consultation** platform — connect users with verified human
astrologers over **chat, voice, and video** at a flat **₹9/min**. Server-authoritative
billing: the wallet, timer, pricing, bonuses, coupons, referrals, and refunds are
all enforced in Cloud Functions. Clients only display state.

> No horoscopes, kundli, matchmaking, tarot, or AI consultations in v1 — consultation only.

## Monorepo layout
```
apps/customer      Flutter customer app
apps/astrologer    Flutter astrologer app
apps/admin         Next.js + React admin portal (App Router, TypeScript)
packages/shared_flutter   shared Dart: design system, models, DI, services
firebase/functions        Cloud Functions (TypeScript) — all business logic
firebase/*.rules,*.json    Firestore/Storage rules, indexes, Remote Config
docs/                      ROADMAP, ARCHITECTURE, DATA_MODEL, BILLING_ENGINE, SETUP_CHECKLIST
```

See **`docs/ROADMAP.md`** for the phased plan and live status, and
**`docs/SETUP_CHECKLIST.md`** for the owner accounts/keys you need to supply.

## Values the owner must supply
Nothing here blocks development — the build runs against `.env.example`
placeholders. Feed real values in per phase (details in `docs/SETUP_CHECKLIST.md`):

| What | Where it goes | Unblocks |
|---|---|---|
| App ids (`com.asktro.customer/astrologer`) | Flutter android/ios config | build |
| Firebase project + web config | `apps/admin/.env.local`, Flutter config | Auth/Firestore/Functions |
| `google-services.json` / `GoogleService-Info.plist` | Flutter `android`/`ios` folders | native builds |
| Razorpay Key ID | client checkout | recharge |
| Razorpay Key Secret + Webhook Secret | **Functions config only** | recharge |
| Agora App ID | client | voice/video |
| Agora App Certificate | **Functions config only** | voice/video |

## Local development

### Cloud Functions (Node 20)
```bash
cd firebase/functions
npm install
npm run build      # tsc typecheck / compile
npm test           # jest unit tests (billing math)
```
Emulator suite (needs Firebase CLI + JDK):
```bash
firebase emulators:start   # auth, firestore, functions, storage on default ports
```

### Admin portal (Next.js)
```bash
cd apps/admin
npm install
cp ../../.env.example .env.local   # then fill NEXT_PUBLIC_FIREBASE_* values
npm run dev
```

### Flutter apps (needs Flutter SDK ≥ 3.x)
```bash
cd apps/customer   # or apps/astrologer
flutter pub get
flutter run
```
`packages/shared_flutter` is consumed via a path dependency; no publish step.

## Security
Per-role Firestore/Storage rules; wallet/timer/billing fields are function-write-only.
Razorpay signatures verified server-side with idempotent callbacks. Agora tokens
minted in a Cloud Function. Secrets live only in Functions config — never in the repo.
