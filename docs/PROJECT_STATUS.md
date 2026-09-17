# Asktro — Current Status (single source of truth)

> **Future session: read this FIRST.** It is the catch-up file. Whenever the
> founder returns after days/weeks/months, this doc tells you exactly where we
> are. Keep it updated as things change — treat it as the running log of truth.
>
> _Last updated: 2026-09-17._

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

## 3b. INCIDENT (2026-09-18) — AI gave only the fallback line to every user

**Symptom:** during the live Meta campaign (~60–100 downloads/day), every AI
astrologer reading returned the guard fallback `REFUSAL_MESSAGE` ("Ek minute,
aapki kundli thoda aur dhyaan se dekhta hoon.") — greetings worked, readings did not.

**Two stacked root causes (confirmed via Cloud Logging `llmGenerate`):**
1. **Gemini prepay credit went negative** → calls failed. Fixed by topping up
   credits (₹2500) + should enable auto-reload.
2. **The reading model was failing.** `provider.ts` DEFAULT_MODELS use `-latest`
   aliases: `reading: gemini-pro-latest` resolved to **Gemini 3.1 Pro**, whose
   **Tier-1 daily cap is only 25 requests/day** → 429 after 25 readings. Then
   model swaps to `gemini-2.0-flash` / `gemini-2.5-flash` returned **404 – model
   no longer available** (Google retired the 2.x line; error told us to use
   `gemini-3.6-flash`).

**Fix (live, no redeploy):** set `config/global.aiModels = {router, filler,
reading: 'gemini-3.6-flash'}` via a firebase-admin script on the Mac. Confirmed
readings work again. Gemini 3.6 Flash on Tier 1 = **10,000 RPD / 1,000 RPM / 2M
TPM** (plenty), pricing $0.75in/$3.75out per 1M (promo, doubles Jan 2027). Spend
is tiny (₹669/90 days). No spend cap was set.

**Durable follow-ups (NOT yet done):**
- [ ] **Update `provider.ts` DEFAULT_MODELS to `gemini-3.6-flash`** (all tiers)
      and redeploy, so code + config agree and clearing the config can't re-break it.
- [ ] Optionally route `router`/`filler` to a flash-lite for cost.
- [ ] Enable Gemini **auto-reload** so credit can't hit zero mid-campaign.
- [ ] Add a real reading FALLBACK MODEL (try a backup model before showing the
      refusal line) so one model's outage can't blank every reading.
- [ ] Pre-marketing checklist: verify model availability + Tier-1 RPD headroom
      before any ad push (this is the "load/quota test" that was pending).
- [ ] Cost controls to set: trim free minutes if needed; set `aiDailyMessageCap`
      so a single user can't burn unlimited free chat.

## 3c. Portal audit (2026-09-18) — findings + status

Full read-only audit of all 41 portal screens vs what the live app/functions write.
- **Data is real:** every count, live tile, per-user detail, and action button is
  correctly wired to production. The **Reports page = true revenue source of truth.**
- **✅ FIXED + DEPLOYED:** Customer Management dropped customers active after IST
  midnight (bucketed by UTC day + per-event +5:30 shift). Now buckets by real
  India days (`users/page.tsx` istDayStart/resolveIndiaRange). Verified live
  (paid customer "Sinsing" reappeared).
- **✅ Blank trend charts — RESOLVED (2026-09-17).** They read from the
  `dailyStats` rollup; `aggregateDailyStats` never fired because its Cloud
  Scheduler job was missing (see 3d). History was backfilled by a one-off script;
  now the job runs every 2 min and keeps them current.
- **⏳ Timezone unification:** dashboard cards + Reports still bucket by **UTC**
  (aligned with the rollup), so "today" starts 05:30 IST. Flip the rollup
  `dayBucket` + `dateRange.ts` to IST together (medium risk — re-labels historical
  buckets; do with a backfill).
- **⏳ Scale liabilities (not urgent):** `users/page.tsx` streams the whole `users`
  collection (OOM risk as it grows → needs server-side pagination like
  UsersActivityTable); Conversion/Paid/Unpaid cards cap at 5000 users; Recharges
  caps at 500 rows.

## 3d. RESOLVED (2026-09-17) — Cloud Scheduler was completely empty; ALL timed jobs were dead

**Symptom:** the "12 active consultations" tile showed ghost/orphaned sessions
that never cleared; revenue charts never auto-updated. Investigation found
**Cloud Scheduler had ZERO jobs** — meaning none of the timed background
functions had ever fired.

**Root cause (systemic):** every `firebase deploy` ended with HTTP **409
"unable to queue the operation"** and aborted *before* the scheduler-job-creation
step. So although the function code deployed, its Cloud Scheduler job (and, for
brand-new functions, the function itself) was never created. This had been
happening on **all ~70 functions** for a long time — the founder confirmed
"it never ends with a clean success." The 409 was traced to an **outdated
`firebase-tools` CLI** on the Mac (NOT a permissions problem — "requires
authentication" is the CORRECT secure state for scheduled/event functions and
they must NOT be made public).

**Fix:** `npm install -g firebase-tools@latest` on the Mac. First redeploy after
the upgrade completed **cleanly, no 409**, and the scheduler job appeared.

**All 7 scheduled functions now have live Cloud Scheduler jobs** (deployed
one-by-one via a `caffeinate` loop):
| Function | Schedule | Purpose |
|---|---|---|
| sweepStaleSessions | every 1 min | clears ghost/orphaned "active" sessions |
| reconcileFailedCredits | every 5 min | recovers a recharge if payment captured but wallet credit failed |
| reconcileFailedStoreConfirms | every 5 min | same, for store purchases |
| aggregateDailyStats | every 2 min | keeps revenue/charts auto-updating |
| resumeStuckBroadcasts | every 10 min | restarts a stalled notification broadcast |
| purgeOldChatData | every 6 hrs | retention cleanup (flag-gated OFF) |
| purgeOldRecords | every 24 hrs | retention cleanup (flag-gated OFF) — was "**create**", i.e. never deployed before |

**Consequences (auto, no further action):** ghost consultations get swept within
~1 min; charts self-update; captured-but-uncredited payments auto-recover.
**Only `onSchedule` functions were ever affected** — live-app functions (onCall,
event triggers) use different infra and were always fine (proven by the app
working). **Lesson for future deploys: keep `firebase-tools` current.**

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
  line-by-line audit; ~~3 scheduled functions~~ (DONE — all 7 timed jobs live, see 3d);
  `onChatImageUploaded` IAM; earnings backfill (only when astrologer app ships);
  welcome-bonus anti-farming; load test.

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
