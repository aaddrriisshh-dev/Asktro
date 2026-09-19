# Asktro — Current Status (single source of truth)

> **Future session: read this FIRST.** It is the catch-up file. Whenever the
> founder returns after days/weeks/months, this doc tells you exactly where we
> are. Keep it updated as things change — treat it as the running log of truth.
>
> _Last updated: 2026-09-17._

---

## 0. NEXT SESSION — top priorities (queued 2026-09-17 EOD)

Campaign is LIVE and working: **~70–80 new users/day** downloading directly from
the Meta ads. That surfaced real issues to tackle tomorrow. In priority order:

1. **AI reliability — DECISION + durable fix (the "AI crash").** During the
   campaign the AI readings went down (retired model + Tier-1 quota + prepay
   hitting zero — see 3b). It's patched live via config, but NOT hardened. Decide
   & implement: bake `gemini-3.6-flash` into `provider.ts` DEFAULT_MODELS +
   redeploy; add a **fallback model** so one model's outage can't blank every
   reading; enable Gemini **auto-reload**; a pre-campaign quota/headroom check.
   **Founder will bring screenshots of the loopholes.**

2. **Money-misuse leaks — TWO of them (customers getting value without paying):**
   - **(a) Free-minute farming** — reopening the same astrologer grants a fresh
     ~1-min free chat each time; farmed by 10–15 users (see 4b).
   - **(b) Replies WITHOUT billing** — founder has seen customers get 1–2
     astrologer replies with **no charge at all**. A chat/first-message billing
     gap (see 4d). Founder will try to send example sessions (hard to spot across
     80 users). Investigate the chat billing / session-start logic.

3. **Sahil ₹5 — remove from Revenue.** Founder confirmed Sahil is his own test,
   not a customer. So the ONLY real customer is **Sinsing (₹20)**. Pending: pull
   Sahil's ₹5 out of the dashboard math (Razorpay keeps the record for refund).

4. **For the founder's records:** he test-recharged **₹535** of real money across
   his own accounts (to reclaim from the company — cross-check Razorpay). Done.

5. **Unit economics — check yesterday's (Sep 17) Gemini cost.** ~50–70 real
   users came yesterday; only 1 paid (₹20), the rest used the free welcome credit
   (~28 free min each). Pull the exact Sep 17 Gemini ₹ (AI Studio → Billing →
   "Billing Account Cost for Gemini API", hover Sep 17) and compute cost-per-free-
   user vs revenue. NOTE: Sep 17 is inflated — the expensive Gemini 3 Pro model +
   failed retries ran during the outage before the switch to 3.6-flash, so it's a
   worst-case day, not steady state.

6. **Portal dashboard tiles: fix "Today = Yesterday" + not live.** The big card
   numbers (e.g. Registered Users) show the ALL-TIME total via `getCountFromServer`
   with no date filter, so they don't move when the Today/Yesterday preset changes
   (per-day figures only live in the chart). Cards also read once on open (not a
   live snapshot listener), so new signups don't appear until refresh. FIX: make
   the headline reflect new-signups-in-selected-period (from the rollup), and/or
   switch to a live listener. Confirm with founder which exact tile before editing.

Carry-over hardening (below, lower urgency): AI code-side (bake gemini-3.6-flash
into provider.ts + backup model); durable test-account exclusion in the live
rollup + money-held; portal scale caps; astrologer-app verification (deadline
30 Sep 2026). Gemini AI auto-reload: founder chose to keep OFF and manage
manually (has ₹1,813 credit buffer).

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

## 3e. Push-notification pop-up CTA + astrologer-list deep links (2026-09-18)

- **Pop-up button (CTA) now editable on EVERY push style (portal, LIVE after
  deploy).** The CTA label + deep-link were hidden for the Small center-card
  style, so a small pop-up was locked to the default "View offer" → main link.
  Moved into an always-visible "Pop-up button (CTA)" block in the broadcast
  composer; always sent. No app update needed — the app already reads
  `ctaText`/`ctaDeeplink` for any style (`home_shell.dart`). Pop-up only appears
  when a theme or image is set (a plain push just follows the link).
- **New deep-link targets: "New Astrologers (AI)" + "Verified Astrologers
  (real)".** Portal dropdown updated (live after deploy) BUT the app routes ship
  in **v10**: added `GoRoute /astrologers/verified` (SearchScreen humansOnly) and
  `/astrologers/new` (SearchScreen aiOnly) in `router.dart`. Until v10 is built,
  tapping those targets on the live app does nothing. All other deep-link targets
  (Home/Recharge/Offers/Mall/specific astrologer) already work live.

## 3f. V4 app build — consolidated pending list (next Flutter build)

Everything below needs a **new app build (V4 / next versionCode)**; none of it is
live until that build ships to Play. Portal-side pieces are already live.

- **Remove the Small (center-card) push pop-up style** (requested 2026-09-18).
  In the app, drop the `'small'` center-card render from `promo_popup.dart` /
  `home_shell.dart` so every push pop-up is Half or Full only. In the portal,
  remove the "Small only" option from `LandingControls` (DisplayMode). Do these
  together so no in-flight broadcast targets a removed mode.
- **Astrologer-list deep-link routes** — `/astrologers/verified` + `/astrologers/new`
  added to `router.dart` (see 3e); light up in V4.
- **Home-tab reset on fresh mount** + **Home Pop-up Studio new fields** (see §3).
- **Profile-setup data quality** — force the user to actually set a real DOB (the
  step defaults to 15 Jun 1995 and can be skipped) and validate the name field
  (see onboarding audit, 2026-09-17).
- **Delete the dormant "Explore More" onboarding code** (`onboarding_widgets.dart`)
  so it can never be re-enabled (already disabled; belt-and-suspenders).
- **AI hardening** — bake `gemini-3.6-flash` into `provider.ts` DEFAULT_MODELS +
  add a fallback model (see 3b). (Functions redeploy, not strictly an app build,
  but part of the same reliability push.)
- **Free-AI-reply gate (fixes 4b + 4d)** — root cause CONFIRMED (see 4b/4d):
  the AI reply engine answers the first message of every new AI chat *before any
  balance check*, so a user with ₹0 left gets one free reading per new chat they
  open (farmed across astrologers). Fix: in `ai/replyEngine.ts` (`onAiChatMessage`),
  before the chart/LLM work, compute spendable **exactly** as `createConsultation`
  does — `walletBalance + bonusBalance + (chatCreditEligible ? chatBonusBalance : 0)`
  using the session's stamped `c.chatCreditEligible` — and if spendable ≤ 0 **and**
  the one-time grace is already used (`user.chatGraceUsed === true`, or
  `config.graceMinutes` = 0), post a "recharge to continue" line via `writeAstro`
  and return instead of generating. Must still answer while welcome credit or the
  unused grace minute remain, so no legit new user is silenced. **Backend-only**
  (Cloud Function redeploy, no app build needed) — grouped into V4 at founder's
  request (2026-09-18). Touches AI chat replies only; human/voice/video, wallet,
  recharge, refund and the billing meter are untouched.

## 3g. RESOLVED (2026-09-18) — portal customer numbers reconciled & verified

Long push to make every customer number real and consistent. Now LIVE:
- **One definition everywhere** (`lib/customer.ts` `isRealCustomer`): a customer
  is NOT deleted and NOT `isTestAccount`. Applied to Registered Users, Paid/
  Unpaid, First-Recharge Conversion, and Customer Management. Incomplete/abandoned
  signups are KEPT (real sign-ups) and shown as a subset, not removed.
- **Same period metric everywhere**: by SIGN-UP date (`createdAt` in range), so
  the home Registered Users card and Customer Management "All Customers" always
  agree (Today == Today).
- **Fixed the over-count**: Paid/Unpaid + Conversion used `snap.size` (raw) for
  `total` while paid/converted were filtered → unpaid = raw − real dumped the
  18 deleted + 14 test accounts into "unpaid" (Unpaid 132 > Registered 118). Now
  `total = rowsAll.length` (filtered). **Founder verified Paid + Unpaid ==
  Registered on every filter.**
- Verify anytime: `scripts/audit_customer_counts.mjs` (read-only) prints the same
  REAL numbers straight from Firestore; `scripts/list_signups_by_day.mjs` lists a
  day's sign-ups with flags.
- Dashboard cards also gained a **live auto-refresh** (60s + on focus) with a
  visible "Refreshed Xs ago" badge; Customer Management is real-time (Firestore
  listeners).

## 3h. 3.0.1 crash-hardening (2026-09-19) — DONE ON BRANCH, needs app build

Live v3.0.0 crash-free was ~81% (small cold sample: ~35 brand-new Meta-ad
installs on Sept 18, cheap Androids on weak networks). Root theme of ALL
crashes: the app did something that can fail (network, login, file, permission,
cached file) with no safety net, so a failure became a fatal crash. 8 distinct
issues → fixed as 5 changes on `claude/asktro-session-handoff-o1ggo8` (app code;
takes effect only when 3.0.1 is built):

- **Fonts + cached-image (crashes 1, 6, 8)** — `main.dart`: reclassify Google-Fonts
  runtime-fetch failures and reclaimed-cache-file `PathNotFoundException` as
  NON-fatal (the app already survives them; they were mis-counted as crashes).
  Proper follow-up: bundle the 3 fonts (Cormorant Garamond, Noto Serif, Poppins)
  to remove the fetch entirely — needs the .ttf files added.
- **Signup auto-verify (crashes 2, 4, 5 — the critical one, 17+ users)** — the
  Android instant-verify path (`auth_controller.dart verificationCompleted`) had
  no try/catch, so permission-denied / invalid-code / unavailable became fatal on
  the SIGNUP funnel. Now wrapped → routes to onError. Plus the underlying race
  fix: `getIdToken()` before the first profile write + `repositories.dart`
  `ensureProfile` retries once on `permission-denied`/`unavailable`.
- **Paused-chat dialog (crash 3)** — `chat_consultation_screen.dart _showPaused`:
  close via the dialog's own context + `mounted` guard (was `Navigator.pop` on a
  disposed State context).
- **Camera-denied on palm scan (crash 7)** — `_scanPalm`: pickImage + readAsBytes
  wrapped so a denied camera can't crash a live chat.
- **Extra from audit:** `router.dart` `/otp` hard cast `s.extra as OtpArgs` →
  null-safe (crashed on deep-link/process-death; also the notification-tap risk);
  `otp_screen.dart _resend` startPhoneVerification wrapped.

**Audit result (whole customer app, 2026-09-19):** payment cancel/fail is ALREADY
handled gracefully (no crash), notification-taps are safe, DB reads use `?? default`
(missing-field safe), nav uses `if (!mounted)` consistently. Left untouched on
purpose: kundali `_isoOf` unwraps (guarded by caller, not in crash data — avoid
touching a working paid flow); recharge `_onSuccess` silent-return when
order/plan null is a money-correctness note (no webhook backstop), NOT a crash —
flag for discussion.

**Versioning decision (founder, 2026-09-19):** two piles. Backend/portal = no
version, deploy anytime. App builds = version bump; small changes ship as a patch
(3.0.1), not one giant "V4". Version numbers are free; each Play submission is the
real cost, so batch ready app changes into a patch.

**Guest question (answered 2026-09-19):** there is NO anonymous/guest login
(`signInAnonymously` does not exist). "Guest" is the DEFAULT NAME written by
`ensureProfile` when a phone is verified but profile setup isn't finished. The
router hard-gates incomplete users at `/setup` (they can't reach the app). So the
"4-5 guests" are abandoned signups (verified number, bailed at setup), not a
loophole. Optional tightening (discuss): don't default the name to 'Guest' / don't
create the base doc until setup completes, so the DB stops accumulating 'Guest'
rows.

**3.0.1 queue:**
- ✅ Grace minute removed (portal graceMinutes 0, live).
- ✅ **Push small/center card re-added** (2026-09-19). It was never an app bug —
  the app renders a CTA + deep link on ALL three cards (small/half/full) and
  fires the same `ctaDeeplink`; the portal had just hidden the CTA for the small
  style and we then removed the option. Now: portal composer offers small again
  (`LandingControls` modes `['small','half','full']`, label "Center card"), and
  the app centre card is height-capped + scrollable so a 2-line title + 2-line
  body + CTA never overflows (`promo_popup.dart _center`). Deep links are uniform
  across all card types. **Portal change deploys via Vercel (pull + vercel --prod);
  app centre-card-fit rides the 3.0.1 build.** Offers deep link (`/offers`) already
  works — founder configures the offer as an Offer Plan / coupon in Recharge Plans.
- ✅ **Data-driven CTA picker** (2026-09-19). `DeepLinkSelect` (shared by Push &
  Banner composers) now pulls the REAL live `rechargePlans` + `coupons` from
  Firestore. Picking "a specific offer / plan" or "a specific coupon" shows the
  actual offers to choose from (label "₹X → +₹Y bonus" / coupon code + title),
  no more hand-typing blank ids. Builds `/recharge?plan=<id>` / `?coupon=<CODE>`.
  **Deploys via Vercel (portal).**
- ✅ **Recharge screen shows the bonus** (2026-09-19). Tapping an offer (e.g.
  "recharge ₹100 get ₹100") now shows a green "+₹X extra" line under the amount
  on the recharge tile, so the payment screen describes the offer, not just the
  price (`recharge_screen.dart _tile`). **Rides the 3.0.1 build.**
- ✅ **Welcome Offers space** (2026-09-19). A dedicated portal page
  (`/welcome-offers`) to create first-recharge welcome offers (name, Pay ₹,
  Bonus ₹, first-recharge-only toggle, active). They are stored in
  `rechargePlans` with `planType: 'welcome'`, so the SERVER credits them like any
  plan (charge = Amount, wallet = Amount + Bonus) and enforces `firstRechargeOnly`
  — **no backend change needed**. The app hides `welcome` plans from BOTH the
  recharge grid (`recharge_screen` filter now `!isOffer && !isWelcome`) and the
  offers screen (already `isOffer`-only); they surface ONLY via the welcome pop-up
  deep link (`/recharge?plan=<id>`, offerMode shows just that plan). The Home
  Pop-up Studio's "Recharge plan the button opens" dropdown is now **data-driven**
  — it lists the real welcome offers (labelled "pay ₹X → ₹Y in wallet") and the
  billing strip reads the true credit from the plan doc, not the old hardcoded
  map. `RechargePlan.isWelcome` added; welcome plans excluded from the Recharge
  Plans page too. **Portal parts deploy via Vercel; the app hide-filter rides the
  3.0.1 build** — so don't publish a new welcome offer as *live* until 3.0.1 ships,
  or it would leak into the recharge grid on the current app.
- ✅ **Facebook (Meta) SDK / App Events wired** (2026-09-19). Added
  `facebook_app_events` + a `FacebookEvents` service (`data/facebook_events.dart`,
  `facebookEventsProvider`). Three standard events fire: **Complete registration**
  (profile-setup done), **Add payment info** (Razorpay checkout opens),
  **Purchase** with ₹ value (server-verified recharge success). Native config:
  Android `res/values/strings.xml` (facebook_app_id 1332308082114721 +
  client-token placeholder) + AndroidManifest meta-data; iOS Info.plist
  (FacebookAppID/ClientToken/DisplayName + URL scheme fb1332308082114721).
  **BLOCKERS before the 3.0.1 build:** (1) replace `PASTE_FACEBOOK_CLIENT_TOKEN_HERE`
  in BOTH strings.xml and Info.plist with the real client token (Meta → Settings →
  Advanced → Client Token); (2) `flutter pub get` to resolve facebook_app_events
  (bump the version if it doesn't resolve). Rides the 3.0.1 build.
- ⏳ Astrologer-list deep-link routes go live in 3.0.1; profile-setup data
  quality; plus anything else the founder names.

## 4. Founder decisions on the record

- Welcome popup "fades on a stray tap" → founder **chose NOT to fix** (declined).
- Rollout was **straight to 100%** (founder's explicit choice, not staged).
- Meta/Facebook: founder sent the single **production key hash** + app icon
  (key hash is public, not a secret; does not break login).

## 4b. FIXED & LIVE (deployed 2026-09-19) — free-AI-reply farming

**DEPLOYED 2026-09-19:** `onAiChatMessage(asia-south1)` redeployed from the Mac —
the balance gate is now LIVE. A user with no balance/grace gets a "recharge to
continue" line instead of a free reply; new users unaffected (welcome credit).
Grace also turned OFF (portal → graceMinutes 0) and welcome kept at ₹27. Free
window is now 3 min then the recharge wall. Details below.

**UPDATE 2026-09-19:** the balance gate is now written in `ai/replyEngine.ts`
(`onAiChatMessage`) and pushed to the branch — before any chart/LLM work it
computes spendable (wallet + bonus + eligible chatBonus, exactly like
`createConsultation`) and, if ≤ 0 and no grace left, posts a "recharge to
continue" line instead of generating a free reply. New users still get answered
(welcome credit keeps spendable > 0). This is the WALL that makes any free-window
tuning actually work. **Deploy:** one function —
`firebase deploy --only functions:onAiChatMessage` from the Mac (see §6). Founder
also chose to turn OFF the +1 grace minute now (portal Pricing → "Grace minutes
(at zero balance)" → 0); the ₹27 welcome-credit decision is deferred a couple of
days. Original diagnosis below.



**Reported by founder:** customers are misusing the welcome free credits. They
**open new AI chats repeatedly** and each new chat hands out a free reply, so
they farm free readings after their real free credit is gone. Seen with **10–15
customers**; founder sent screenshots of user *Kajal nainani* (Welcome +₹27,
Grace +₹9, one Consultation −₹36 that ate all 4 free minutes, then **4 more chats
at "0 min · ₹0" where the AI still answered**).

**NOT a per-session re-grant.** The welcome credit (`chatBonusBalance`) is a true
once-per-user grant (`signupBonusGranted` in `onUserCreate.ts`) and grace is
once per user (`chatGraceUsed`). Those are fine.

**The real cause (confirmed by code read):** AI chats are **not balance-gated**.
- `createConsultation.ts` deliberately skips the wallet check for AI
  (`if (!isAI && !canStartConsultation(...))`), so a broke user can always open a
  new AI session (created `status:'waiting'`, `billedSeconds:0`).
- `ai/replyEngine.ts` (`onAiChatMessage`) then generates and delivers the reply
  gated only on session status — it **never checks the balance**. So the *first*
  message of every fresh chat gets a full free reply (1–2 bubbles ± a remedy);
  billing (`tickConsultation` → `applyTick`) only starts *after* she has replied,
  finds ₹0, and pauses. User just opens another new chat → another free reply.
  This is the same leak reported separately as 4d.

**Fix (queued to V4, backend-only):** balance-gate the AI reply — see the
"Free-AI-reply gate" bullet in §3f for the exact change. Founder chose
2026-09-18 to **ship it with the V4 batch**, not hotfix now.

Note: unrelated to `reconcileFailedCredits` (that only completes already-PAID
recharges; no free credit, no discretion — confirmed by code read).

## 4c. RESOLVED (2026-09-17) — test/self money purged from dashboards

The founder's own number **+91 9650589905** had **4 test accounts** (Google
logins: "Adrish Mullick" ×2, "Adry", "Afhbn"). One held a **~₹90 lakh fake
test recharge** in its ledger that was inflating Revenue and "Money held".
(A teammate account **Vineet Jaiswal** — note spelling "vineet", not "vinit" —
credited from the portal is a second pass, being cleaned separately. No Sanjay
account found.)

`scripts/cleanup_test_accounts.mjs --yes` deleted their **41 walletTransactions**,
zeroed wallet/bonus/chatBonus balances, and tagged them `{ isTestAccount: true }`.
Then `backfill_dailystats.mjs --from=2026-09-16 --yes` rebuilt the rollup so
Revenue recomputed without the test money. "Money held & owed" (a live SUM of
all `walletBalance + bonusBalance`) now excludes them because their balances are
zero.

**Note:** "Money held" is a live balance snapshot, NOT date-filterable like
Revenue — the fix for its accuracy is clearing test accounts, not a cutoff.

**Round 2 (2026-09-17): scrubbed all portal/test credits.** `scripts/audit_money_sources.mjs`
(read-only) surfaced every money-in event; `scripts/scrub_fake_credits.mjs --yes`
then removed all FAKE credits by signature — every `adjustment` (manual portal
credit) and every `bonus ≥ ₹1,000` (real welcome bonuses are all < ₹100). That
cleared **9 accounts / 10 txns**: five ₹89,99,991 test bonuses (9953104273,
Rahul, Deepak Kumar choudhary, Riya Nag, "Zodia Demo Astrologer") + adjustments
(₹1,00,000 deleted-user, ₹10,000+₹10 Sanddip Manna, ₹500+₹500 Guest/John on
8318259972). Zeroed **₹10,539.85** of comped balances and tagged them test.
Backfill rebuilt.

**Ground truth after cleanup — REAL paid recharges only:** Sinsing **₹20**
(18 Sep) + Sahil Arora **₹5** (16 Sep) = **₹25 total**. Everything else was
partners/test/portal credits. (Founder to confirm whether Sahil ₹5 is real or
also a test.)

**Durable follow-up (NOT yet done):** future portal adjustments / test bonuses
will re-pollute (the live `rollupWalletTxn` trigger + the money-held SUM still
count them). To make it permanent: in the live rollup trigger skip
`isTestAccount` users and ignore `adjustment` / oversized `bonus` kinds; exclude
`isTestAccount` from the MoneyHeldOwed aggregation (portal). Cleanup scripts live
in `firebase/functions/scripts/` (cleanup_test_accounts, audit_money_sources,
scrub_fake_credits) — re-runnable anytime.

## 4d. ROOT CAUSE CONFIRMED (2026-09-18) — AI replies delivered WITHOUT billing — same cause as 4b

**Reported by founder:** customers receive **1–2 AI replies with no charge**
(beyond the intended free trial). Confirmed to be the **same root cause as 4b**:
`ai/replyEngine.ts` generates and delivers the AI reply before any balance check,
and billing (`tickConsultation` → `applyTick`) only starts *after* the reply and
only accrues while the client heartbeats — so the first reply of any fresh AI
chat is free and the session can show "0 min · ₹0". Not a race in `applyTick`
itself; the meter never gets the chance to charge because the value is given away
before it runs.

**Fix:** same as 4b — the "Free-AI-reply gate" in §3f. Queued to V4 (2026-09-18).

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
