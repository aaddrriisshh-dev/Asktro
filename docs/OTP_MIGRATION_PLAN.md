# OTP cost migration — WhatsApp-first (kills the ₹6.69/OTP Firebase leak)

**Problem (real data, Sept 2026):** Firebase Phone Auth = "SMS messages sent in
Region IN", 148 SMS = ₹989.85 → **₹6.69 per OTP.** Not abuse, not resends — just
Firebase's India SMS price. Unsustainable before scaling ads.

**Target:** WhatsApp OTP **₹0.115** (no DLT) with SMS fallback. ₹990 → ~₹20–50.
**~95–98% cut.**

## Architecture (keep Firebase as the user system)

Only *who sends the code* changes. Firebase Auth still owns the user/uid.

1. App: phone entered → calls backend `sendOtp(phone)`.
2. Backend: generate 6-digit code → store **hashed** in Firestore with expiry
   (5 min), attempt count, resend cooldown → send via **WhatsApp auth template**;
   on WhatsApp failure / no-WhatsApp → **fallback to SMS** (MSG91, later).
3. App: code entered → calls backend `verifyOtp(phone, code)`.
4. Backend: verify (match + not expired + attempts < 5) → look up EXISTING
   Firebase user by phone (reuse their uid so wallet/history is kept) or create
   one → mint a **Firebase custom token** (`admin.auth().createCustomToken(uid)`)
   → return it.
5. App: `signInWithCustomToken(token)` → logged in exactly as today. Everything
   downstream (uid, Firestore rules, user docs) is unchanged.

## What we need

- **WhatsApp Business Platform (Cloud API)** — Meta Cloud API direct (cheapest,
  no aggregator markup) OR a simple aggregator (AiSensy/Interakt) for ease.
  Needs a **dedicated business number** (not a personal WhatsApp) + an approved
  **authentication template** (Meta approval, hours–days, no DLT).
- **2 Cloud Functions:** `sendOtp`, `verifyOtp` (we already run functions).
- **Firebase Admin custom token** (already available in functions).
- **App Check + rate limits** on `sendOtp` (we now own the endpoint, so WE must
  stop abuse: cap per phone + per IP + per device, cooldown between sends).
- **SMS fallback (Phase 2):** MSG91/Gupshup + **DLT registration** (Pvt Ltd
  qualifies; ~3–10 days: register entity/PEID, header "ASKTRO", OTP template).

## Phasing (launch cheap fast, perfect later)

- **Phase 1 — WhatsApp primary + keep Firebase SMS as fallback.**
  Most users have WhatsApp → pay ₹0.115. The few without → fall back to the
  current Firebase SMS (still ₹6.69 but only for a small tail). **~90% savings
  immediately, no DLT wait.**
- **Phase 2 — replace the Firebase fallback with MSG91 + DLT** → the tail drops
  to ₹0.15 too. Final blended cost ≈ **₹0.15–0.20/OTP**.

## Security (important — we own the send endpoint now)

- Hash the code at rest; never store plaintext.
- Expiry 5 min; max 5 verify attempts; resend cooldown (30–60s) + daily cap per
  number.
- App Check enforced on both callables.
- Per-IP + per-number rate limits (reuse the existing `enforceRateLimit`).

## Effort / timeline

| Piece | Effort |
|---|---|
| Backend `sendOtp`/`verifyOtp` + WhatsApp API + custom token + rate limits | ~2–3 days |
| App login/OTP screens → call backend + `signInWithCustomToken` | ~1–2 days |
| WhatsApp number + template approval (parallel) | ~2–5 days |
| DLT + MSG91 SMS fallback (Phase 2) | ~3–10 days |

**App + backend change → rides a build AFTER 3.0.1** (not today's AAB).
**Priority #1 before scaling ads.**

## Cost after (per 148 OTPs, today's volume)

- Firebase now: **₹990**
- Phase 1 (WhatsApp + Firebase tail): **~₹50–100**
- Phase 2 (WhatsApp + MSG91 tail): **~₹20**

## Decisions for founder

1. WhatsApp: **Meta Cloud API direct** (cheapest) vs an aggregator (easier)?
2. Dedicated WhatsApp business number to use?
3. Phase 1 now, Phase 2 (DLT) after — agreed?
