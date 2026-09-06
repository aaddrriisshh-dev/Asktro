# Asktro v2 — Submission Plan (consolidated 6 Sept 2026)

Single source of truth for everything left before submitting v2 to Google Play.
Owners: **You** = founder/dev · **Claude** = code/scripts I do.

## ✅ Done & verified
- Voice-call drop **fixed** (router was recreated every ~10s during billing, tearing
  down the call screen) — verified on device: holds past 10s, audio both ways, meter correct.
- Chat + per-minute billing verified.
- "View all" rail filter (Verified=humans, New=AI, Rising Stars=mixed).
- Trailing-comma cleanup · offline birth-place atlas · legacy wallet bonus zeroed ·
  fake human astrologers removed + 4 real added.
- Policy docs written & dated (Terms / Privacy / Disclaimer / Account-deletion).
- Money-safety / AI-free gating / Razorpay — independently audited clean.
- "App felt slow" = **debug build only**; no real perf bug.

## 🔧 App code fixes — THIS build (Claude)
1. **AI shown honestly** — for AI only, remove fake experience / rating / reviews /
   followers / "Asktro Verified" on rail tiles, list cards, profile, and chat.
   Keep name, photo, specialties, languages, AI badge, "Free · Instant · Available".
   Always-available kept (it's true). Human astrologers unchanged.
2. **Add the AI badge inside the chat** + gate the chat "Asktro Verified" pill with `!isAI`.
3. **Group Pujas "Book Now" → "Coming Soon"** (Live Session already coming soon).
4. **Hide the fake "4.8★" default** on products (show stars only for real reviews).
- DROPPED (founder decision): call auto-pause on no-audio — don't absorb user-side
  connection issues (would cost the company/astrologers for a user's weak network).
- DEFERRED (low risk): remedies AI badge.

## 🛒 Mall — ship empty, stock later
- **Clear all seeded/demo store content** (products + fake testimonials + FAQs + banners).
  Empty store then shows the clean built-in state: "The store is being stocked —
  check back soon." No products = no cart/checkout = nothing for review to flag.
  (Claude provides a cleanup script.)
- **After approval:** add real products from the portal — they appear live (Firestore
  snapshots), the "being stocked" message auto-disappears, no app update / re-review.
- Confirmed low-risk vs Play: the empty state is intentional/polished, not broken.

## ⚙️ Backend / config / portal — verify before release
- **Verify live config/global money rules** (or money leaks): `minWalletToStartPaise`=1800,
  `freeChatMinutes`=3 (NOT 999999), `devPaymentsEnabled` off, AI cost controls
  (`aiEnabled`/`aiDailyMessageCap`). Claude gives a 1-command dump to check.
- **Confirm functions deployed** with v2 code: createConsultation, tickConsultation,
  onAiChatMessage, onNotificationCreated + sendBroadcast.
- **Redeploy the admin portal (Vercel)** — carries the notification CTA-picker (not live yet).
- **Confirm the 4 human astrologers' rates** are above the ₹9 base.

## 📋 Store listing / website / accounts
- **[GATE] Publish the 4 legal pages to the live site** BEFORE submitting (Google opens
  the privacy URL; the current live privacy is the old free-v1 version).
- **Google Sign-In check** on the real build (logs in + fetches name/email/photo).
- **Play Console:** financial-features declaration + Data Safety (Claude prepares the
  exact answers) + store listing/screenshots (don't headline "paid AI" — AI is free).
- **Rotate the Agora certificate** (hygiene — it appeared in chat). Backend-only.

## 🚀 Ship
- **[GATE]** Bump version → build final AAB → full smoke test → submit → staged rollout.

## 📦 Deferred to post-launch
- App-size / R8 shrinking · Node 20 runtime (before Oct 2026) · Delete-astrologer
  portal button · per-message astrologer push · remedies AI badge.
