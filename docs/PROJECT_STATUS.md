# Asktro — Current Status (single source of truth)

> **Future session: read this FIRST.** It is the catch-up file. Whenever the
> founder returns after days/weeks/months, this doc tells you exactly where we
> are. Keep it updated as things change — treat it as the running log of truth.
>
> _Last updated: 2026-09-16._

---

## 1. Where the product is RIGHT NOW

- **v3 is LIVE.** Customer app `3.0.0 (versionCode 9)` is published on Google
  Play **Production at 100% rollout** — verified live. This is the current
  shipped version.
- **Backend:** all ~66 Cloud Functions on nodejs22; Firestore rules + indexes
  deployed. Stable.
- **Google login:** fixed for all users (the app's real Play-signing SHA-1
  `34:51:37:B6:…` is registered in Firebase). Server-side, no rebuild needed.
- **Pricing:** chat **₹11/min**, voice **₹25/min**. Welcome signup bonus lands
  in `chatBonusBalance` (chat-only credit), shown on the profile card (v7+).

## 2. What shipped in v3 this cycle

- Two-way support (customer ↔ admin): reply/close/reopen + `customerReplySupportTicket`
  deployed; portal **alert bell** + support console live (Vercel); app notification
  badge + tap-to-open in v9.
- AI astrologers **labelled "(AI)"** in their names (26 updated; tag at the END,
  never the front). Editable anytime in the portal. No rebuild needed (names read live).
- Legal (Privacy/Terms/Disclaimer/Account-deletion): **unchanged from v2**,
  website already current.
- Billing verified: per-second, server-authoritative; on-screen/phone-call
  interruptions keep billing correctly (not a leak).

## 3. On the branch, waiting for the NEXT app build (v10)

- **Home-tab reset on fresh mount** — (`home_shell.dart`). Fixes a testing-only
  quirk where switching Gmails without restarting the app left the old bottom-tab
  position in memory, so a fresh login could land on Profile instead of Home.
  **Real new users don't hit this.**
- **Home Pop-up Studio (welcome_reward) fully portal-customizable** — app now
  reads new fields from `homeSections/popup`: two-tone headline
  (titleWord1/titleWord2), Total Payment breakdown (gstRatePct, breakupRows,
  showBreakup, totalOverridePaise), background sky themes (bgTheme) and particle
  styles (particleStyle). Portal side (`apps/admin` Home Pop-up Studio) is built
  and pushed. **Portal deploy makes the studio usable immediately and does NOT
  break the current live pop-up** (old fields still drive v9). BUT the NEW
  controls only render to users after the v10 app build ships — v9 ignores them
  and shows the defaults. Old controls (amounts, plan, message, image) work live
  now.

## 4. Founder decisions on the record

- Welcome popup "fades on a stray tap" → founder **chose NOT to fix** (declined).
- Rollout was **straight to 100%** (founder's explicit choice, not staged).
- Meta/Facebook: founder sent the single **production key hash** + app icon
  (key hash is public, not a secret; does not break login).

## 5. Open / parked items (non-blocking)

- **Astrologer app** (`in.asktro.astrologer`) Android developer verification:
  **parked** at the "sign & upload an APK" step. Deadline **30 Sept 2026**. App
  is not distributed, so not urgent.
- **Play advisories** (future deadlines, not blockers): code obfuscation/shrink
  by **Feb 2027**; migrate off `play-services-safetynet`; edge-to-edge (Android 15);
  large-screen resizability. Bundle into a maintenance build.
- **Post-launch backlog** (see `scratchpad`/tracker history): analytics-drawer
  "Manage →" deep-links; portal `welcome_reward` accurate preview; sidebar pages
  line-by-line audit; 3 scheduled functions (aggregateDailyStats,
  resumeStuckBroadcasts, purgeOldRecords); `onChatImageUploaded` IAM; earnings
  backfill (only when astrologer app ships); welcome-bonus anti-farming; load test.

## 6. How we deploy (never forget)

- **Functions (from the Mac):** service-account key at
  `~/Projects/Asktro/firebase/functions/serviceAccountKey.json`, deploy
  **one function at a time**. New callables also need a Cloud Run invoker grant.
- **Admin portal (Vercel, `apps/admin`):** NOT git-connected → **PULL FIRST**
  on the Mac, then `vercel --prod`. Deploying without pulling ships stale code.
- **General rule:** the assistant's work lives on GitHub; the Mac is a separate
  copy. Before ANY deploy, the Mac must have pulled the exact code being deployed.

## 7. How the founder wants to work

- **ONE step at a time.** Short, plain-words replies. Give the actual required
  info — concise but complete; don't strip out the real concern.
- Extreme care not to break the live app.
