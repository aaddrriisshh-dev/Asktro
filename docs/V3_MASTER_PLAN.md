# Asktro v3 — Master Plan ("the final version")

_Created 7 Sept 2026, right after v2 (versionCode 5 / 2.0.0+5) was submitted to
Google Play for review. This is the single source of truth for everything we do
**after** v2, up to and including the v3 release. Read this first when resuming.
Update it as decisions are made._

**Founder's intent for v3 (in his words):** the version where we "fix each and
everything." The three headline additions are the **AI paid engine (the main
money engine)**, **video calls**, and a **code-quality pass so the product does
not read as an AI-built app** — clean, human-readable code with no bloat. Plus
the housekeeping we've been deferring (Node runtime, deprecations, the red lines
the tooling flags).

---

## 0. Where things stand the moment this was written

- **v2 is IN REVIEW** on Google Play (Production, 100% rollout, managed
  publishing off → auto-publishes on approval). versionCode 5 / 2.0.0+5.
- v2 turned money back ON: wallet/Razorpay, **human** astrologers (paid voice
  calls + paid chat), Mall. **AI chat is FREE in v2** (structurally free — see
  §2). Kundli is free. Video is hidden (`kVideoEnabled = false`).
- Branch for all work: `claude/asktro-session-handoff-o1ggo8`.
- Live app id: `in.asktro.customer` (India). Astrologer app is sideloaded (not
  Play). Admin portal is on Vercel (NOT git-connected — pull on the Mac first).

**v3 does NOT start until v2 is approved, live, and smoke-tested on a real phone.**
Shipping code changes on top of an in-review release risks the submission.

---

## 1. POST-SUBMISSION ACTIVITY (do these first, in order)

### 1a. While v2 is "In review" (next few hours → ~2 days) — DO NOTHING to the release
- Don't touch the release, don't push new app code to the release, don't edit
  store listing/declarations. Let Google review it.
- Watch for Google's email / console notification. Expected: approved in 1–2
  days (it's an update to an already-approved app, so faster than a new app). If
  it's still in review after ~4 days, that's when we look closer / consider a
  nudge.
- Safe to do meanwhile (does NOT affect the release): plan v3, prep the code
  branch, portal content, ProKerala/Agora headroom checks.

### 1b. The moment v2 is APPROVED + LIVE
Run this live-build smoke test on a real phone (install from the Play listing,
not a sideload) — one pass, careful:
1. Fresh login (phone OTP) → onboarding lands details on the account (no "Guest").
2. Google Sign-In works on the production-signed build (fetches name/email/photo).
3. AI chat replies (free), shows the AI disclosure line + auto details bubble.
4. Human astrologer: start a **paid voice call** → holds past 10s → per-minute
   meter charges correctly → at ₹0 the call ends + "out of balance" popup →
   Recharge → new call.
5. Wallet recharge via **real Razorpay** (not the debug "simulate payment").
6. Mall: browse → buy a product via Razorpay-direct.
7. No money-UI leaks anywhere unexpected; legal links (Terms/Privacy/Disclaimer)
   open readable pages.

### 1c. Backend deploys that must be live WITH v2 (verify, don't re-deploy blindly)
These were required for v2's monetization; confirm they're deployed on the Mac
(service-account key, one function at a time):
- `createConsultation`, `tickConsultation` (AI-free short-circuit + human gate).
- `config/global` live values: `minWalletToStartPaise = 1800` (human start gate),
  `freeChatMinutes` reduced from the free-v1 `999999` hack (it's a money leak —
  see §2 for the exact v3 handling), human rates set above the ₹9 base.
- Portal: delete fake demo astrologers/products; add real astrologers + products.

### 1d. First-week-live watch (no code needed)
- Crashlytics glance after real use.
- ProKerala usage vs the Emerald plan cap (120 req/min, 350k credits).
- App Check: monitor → enforce once traffic looks clean.
- One live-money reconciliation test (recharge → consult → payout math).

### 1e. Then, and only then — start v3 (§2 onward)

---

## 2. THE AI PAID ENGINE — v3's main money engine (the centerpiece)

**Founder's decision:** in v3 the AI astrologer becomes **paid per-minute**, the
same funnel the market leaders use (he verified this on AstroTalk: free taste,
then "add money to continue chatting"). This is where the primary revenue is,
because the AI is designed to answer precisely, like a human.

> Full engine design (persona, pacing, grounding, cost controls, retention) lives
> in `docs/AI_ASTROLOGER_ENGINE.md`. That doc is the spec; this section is the
> **v3 delivery plan** — what we flip, build, and ship.

### 2.1 What "AI paid" means concretely
- **Price:** ₹9/min (already the live human-adjacent rate; AI sits below the
  ₹20–50/min human market — good "affordable, always-on" positioning).
- **Free first taste:** 3 free minutes via a ₹27 welcome credit
  (`chatBonusBalance`, non-withdrawable, spent first). Already granted in
  `onUserCreate.ts` — verify it still fires and is scoped so it can ONLY be spent
  on AI (not on base-rate human chats — that's the leak in §2.5).
- **Recharge nudge at the 2-minute mark** (before the free 3 min run out).
- **"Add money to continue" at ₹0** — AstroTalk's exact pattern. When the AI
  session hits ₹0: end/pause the turn, show a clean "you're out of balance"
  sheet → **Recharge** → resume/continue the chat. Reuse the same pattern we just
  built for **voice calls** in v2 (`call_consultation_screen.dart` `_endForBalance`
  → out-of-balance dialog → Recharge). Decide AI chat = **pause + resume** (chat
  is resumable) vs calls = **end** (already decided end for calls).
- **Billing starts on the FIRST REAL AI REPLY**, not on chat-open (a person
  doesn't get charged for opening a chat). Locked decision.

### 2.2 The code flip (turn AI from free → paid)
Today AI is **structurally free** by design (v2). To make it paid, reverse those
two short-circuits:
- `billing/createConsultation.ts`: currently sets `price = 0` and skips the
  `minWalletToStartPaise` gate for `astrologer.isAI`. v3: give AI its own price
  (₹9/min) and its own (lower/zero) start-gate so the 3 free minutes still let a
  ₹0-wallet user start.
- `billing/tickConsultation.ts` `applyTick`: currently short-circuits for
  `c.isAI` (never charges). v3: charge AI per tick like a human consult, but
  spend `chatBonusBalance` first (the free-minutes credit), then wallet.
- Client: un-hide AI cost UI that v2 deliberately hid — rate badge, chat
  countdown, low-balance warning, end-of-chat receipt — currently gated with
  `&& !a.isAI`. In v3, AI shows the same cost affordances (its own price).
  Files: `astrologer_card.dart`, `astrologer_profile_screen.dart`,
  `home_feed.dart`, `chat_consultation_screen.dart`, `consultation_end.dart`.
- **Keep the AI honesty disclosure** (the light-yellow line + AI chip) — paid or
  free, the "this is an AI astrologer" disclosure stays. Non-negotiable
  (deception policy + our own decision).

### 2.3 The pacing/typing engine (what makes billed AI time feel human, not padded)
This is the make-or-break. Per `AI_ASTROLOGER_ENGINE.md` §"Pacing & typing
engine", build these (client + server, portal-tunable knobs):
1. **Message aggregation / debounce** — wait for the user's burst to settle
   (~3–5s), then answer the whole intent once. Fixes "AI answered only the first
   message."
2. **Cancel-and-reread** — a new message mid-compose cancels and re-reads.
3. **Thinking pause** — ~1.5–3s small talk; ~3–5s before a real reading.
4. **Typing indicator** the whole delay; bubble appears only at the end.
5. **Realistic typing speed** — ~60–100 ms/char, floor ~2s, ceiling ~12–15s.
6. **One beat per turn** (occasionally two), then STOP.
7. **Guardrail:** believably human, NEVER obviously padded (padding churns).
All knobs live in `config/global` / portal so the feel is tuned without a rebuild.

### 2.4 The four cost controls (decide profit vs loss — build in from day one)
Per the engine spec, without these, per-minute AI billing can go NEGATIVE:
1. **Prompt caching** — system prompt + kundli read at 0.1× after turn 1.
   (Currently implicit only; explicit caching is still a TODO — do it in v3.)
2. **Cap output length** (✅ exists — verify).
3. **Trim history** to a rolling ~8–10 turns + a short running summary (✅ verify).
4. **Rate-limit** the AI (no burst of replies in 60s) (✅ verify).
Plus the safety kill-switches already built (`config/global`): `aiEnabled`
(false = stop all AI replies instantly, kills the Gemini bill) and
`aiDailyMessageCap`. Confirm the **3-tier model routing** fires: router + filler
→ Gemini Flash (cheap), reading → Gemini Pro (premium).

### 2.5 The money-leak to close BEFORE AI goes paid (critical)
`freeChatMinutes` is currently `999999` (a free-v1 hack). Left as-is with paid AI
it mints a huge `chatBonusBalance` welcome credit spendable on **base-rate human
chats** → new users could chat a ₹9 human free forever. v3 must:
- Set `freeChatMinutes` to the intended small number (3) so the welcome credit =
  3 AI minutes only.
- Keep human rates **above** the ₹9 base so `chatCreditEligible` (true only for
  AI or base-rate chats) can't spend the AI credit on humans.
- Consider zeroing existing users' inflated `chatBonusBalance` (low risk —
  friends/family base).

### 2.6 Report / remedy upsells (second revenue line — scope for v3 or fast-follow)
₹149–199 paid reports (Kundali / Marriage / Career / Sade Sati) + gemstone/pooja
remedy upsells at the warm close of an AI session (NEVER a human referral — AI is
its own revenue center). Market-validated (Ishvaram). Decide: in v3 or a v3.x.

### 2.7 Compliance notes for AI-paid (don't trip Play)
- Still a **closed-loop in-app wallet** → NOT a "financial feature" per Google's
  Financial Services policy (verified in the v2 session). Keep the declaration as
  "no financial features."
- Content rating: paid AI = "purchase digital goods = Yes" — that does NOT raise
  the rating to 18+ (purchases ≠ gambling). Never answer the gambling/cash-reward
  questions Yes.
- Keep the AI disclosure honest (per Play deception policy).
- ASCI: no "100% guarantee" claims — disclaimers already in place; keep them.

---

## 3. VIDEO CALLS (v3)

The full call path is already built end-to-end (voice); video is hidden behind a
flag. To ship video in v3:
- Flip `kVideoEnabled = true` in `apps/customer/lib/app/feature_flags.dart`.
- Un-gate every Video button (profile + directory card), currently
  `kVideoEnabled && !a.isAI` (video is human-only).
- Test video END TO END on two real devices before enabling: camera permission,
  Agora video track both directions, the `call_video_view.dart` render, billing
  meter over a video call, backgrounding behavior, and the ~10s-drop regression
  (fixed for voice via the router-rebuild fix — confirm it holds for video too).
- Set a **video per-minute rate** (typically higher than voice) in config.
- Files: `packages/shared_flutter/lib/src/services/call_engine.dart`,
  `call_video_view.dart`, `call_consultation_screen.dart` (customer),
  `astrologer_consultation_screen.dart` (astrologer).
- Play: video calling may want the same foreground-service story as voice
  (see §5 fast-follow #1) — align the two.

---

## 4. CODE QUALITY — make it read like a human wrote it (founder priority)

Founder wants the codebase to NOT look AI-generated: clean, human-readable, no
extra/bloated lines, no misleading comments. This is a dedicated v3 pass, done
carefully (behavior must not change — it's hygiene, verified by analyze + tests +
a device smoke test).

### 4.1 Concrete cleanups already identified
- **Fix the stale/false pubspec comment.** `apps/customer/pubspec.yaml` still
  says "agora_rtc_engine (voice/video) is temporarily removed" — that's WRONG
  now (it moved to `packages/shared_flutter`, calls are live). Misleading comments
  are exactly the "AI-built" smell. Correct it to describe reality.
- **Finish the analyze cleanup.** `flutter analyze` is down to ~7 harmless infos
  (unnecessary_import / curly_braces / prefer_const in
  `chat_consultation_screen.dart`). Run `dart fix --apply` to get a fully clean
  analyze (0 infos). (Trailing-comma pass already done 5 Sept.)
- **Strip dead code.** Remove the commented-out / superseded paths left from the
  free-v1 ↔ v2 flips and the onboarding-reorder (old buffer/flush code was
  removed, but sweep for leftover references, unused providers, dead imports).
- **Remove dead Vastu code** and any other unreferenced feature stubs (noted in
  earlier backlog #63/housekeeping).
- **Trim unused assets/deps.** Confirm every dependency in pubspec is actually
  used; drop any that aren't (smaller app + cleaner manifest of intent).

### 4.2 Style / readability principles for the pass
- Match the surrounding code's idiom — don't introduce a second style.
- Comments explain **why**, not **what** the code obviously does; delete
  restating comments; fix any comment that no longer matches the code.
- No over-abstraction for its own sake; no speculative "just in case" branches.
- Keep functions short and named for intent.

### 4.3 The Zodia fork (structural debt to decide on)
`apps/zodia_*` + `packages/zodia_shared` are a hard FORK (near-duplicate of
Asktro) → every fix risks needing doing twice. Asktro is canonical. Decide in v3
whether to move to a **shared-source / flavor** approach (one codebase, two
brands) or keep the fork and accept the double-maintenance. Not a Play blocker;
it's the biggest "human would refactor this" item.

### 4.4 Tests
The Flutter client has almost no tests (backend is well-tested). When touching
client code in v3, add tests for the money-critical paths (AI billing tick, the
₹0 out-of-balance flow, onboarding-lands-details). A human-quality codebase has
tests around the money.

---

## 5. HOUSEKEEPING — the "red lines" and deprecations (v3)

### 5.1 Node.js runtime — Node 20 → 22 (HARD DEADLINE)
- `firebase/functions/package.json` pins `"node": "20"`. **Node 20 is deprecated
  (30 Apr 2026) and DECOMMISSIONED 30 Oct 2026.** After that, deploys/functions
  break. Bump to Node 22, update `@types/node`, redeploy all functions, verify.
  Backend-only — NO app update. **Do this well before 30 Oct 2026** regardless of
  the v3 app timeline.
- The stuck 1st-gen **`onAuthUserCreate`** trigger was **removed** as part of this
  bump (1st-gen can't run Node 22, and Node 20 is being decommissioned). It was a
  redundant server-side safety net — the customer app already holds every new user
  at the profile-setup gate until the profile is saved and server-confirmed, and
  `onCustomerSignup` still grants the welcome bonus when the doc is created. Removal
  also stops "ghost" Guest profiles for abandoned signups.

### 5.2 Dependency updates — DECISION: safe patches applied, majors HELD
- **Done (v3):** safe in-range patch bumps on functions (agora-token 2.0.6,
  razorpay 2.9.8, ts-jest 29.4.12). Lockfile-only, build clean, all tests pass.
- **Held on purpose:** everything else that's "behind" is a MAJOR version jump
  (firebase-functions 5→7, firebase-admin 12→14, eslint 8→10, typescript 5→7,
  jest 29→30; portal: next 14→16, react 18→19, firebase 10→12, recharts 2→3).
  None are security-critical, none are EOL in a way that touches users, and our
  current versions run fine on Node 22. Major bumps = migration risk on a live
  paid app + several need Mac/device verification. **Policy: upgrade a major only
  when a feature we're building requires it, a real security advisory lands, or a
  hard deadline forces it — never a blanket "chase latest" sweep.**
- `eslint` 8 is technically end-of-life but is a dev-only linter (never ships in
  the app), so zero user risk; the flat-config migration isn't worth the churn now.
- Watch the `ffi` override (kept at ^2.1.2 to resolve the Agora vs share_plus
  conflict — keep it unless both sides move).

### 5.3 App size (R8/ProGuard) — optional in v3, do carefully
Enable `minifyEnabled` + `shrinkResources` in
`apps/customer/android/app/build.gradle`, add proper `-keep` rules (Razorpay,
Agora, Firebase, deep links), upload `mapping.txt` with the release. Cuts the
~72 MB new-install download and gives readable crash reports. Do it as its own
careful step (hasty shrinking before a launch can break things).

### 5.4 Whatever the terminal flags on the Mac
This env has no Flutter SDK, so the definitive `flutter analyze` / build-warning
list comes from the Mac. When starting v3, run on the Mac and paste output:
- `cd apps/customer && flutter analyze`
- `cd firebase/functions && npm run build` (tsc) and `npm run lint` (eslint)
- Any Gradle/AGP deprecation warnings during `flutter build appbundle`.
We fix each red line, one cluster at a time.

---

## 6. RETENTION ENGINE (v3 or v3.x — the flywheel behind AI revenue)

From `AI_ASTROLOGER_ENGINE.md` — this may matter more than the chat engine for
lifetime value. Phased:
- **Phase 3 (build with AI-paid):** "Continue your reading" cards on Home
  (astrologer face + last-message preview + one-tap re-entry), "Your
  Astrologers" favorites row, and **light cross-session memory** (AI knows where
  the last chat left off). Covers AI + human.
- **Phase 4 (later):** full cross-session memory model, proactive personalized
  push nudges *from your astrologer* (opens a billed session), dasha/transit
  life-event triggers, report/remedy upsells (§2.6), streaks/daily ritual.
- **Open observation:** memory recall over-indexes on a sent remedy vs the last
  chat topic — candidate fix noted in the engine doc; validate with real users.

---

## 7. OTHER FEATURES / GAPS possibly being missed (raise + decide for v3)

Pulled from the backlog so nothing is forgotten. Founder to keep/cut each:
- **Reliable locked-phone incoming call/chat alerts (fast-follow #1).** On
  aggressive OEMs a push to a locked phone is 15–20s late (Doze + cold start).
  Fix = `minInstances` warm pool + native **full-screen-intent** incoming call
  (rings instantly like WhatsApp). Real native work + multi-phone testing.
- **Background-call keep-alive (foreground service, type `microphone`).** Keeps
  audio + billing alive when the user backgrounds a live call (common India
  pattern). Requires a Play foreground-service-type DECLARATION (type +
  description + ~30s demo video). Standard for calling apps. Pair with video.
- **Per-message push to the ASTROLOGER during a live consult** (backend-only, no
  app update) — `chatNudge.ts` extension. Can ship anytime.
- **ProKerala chart-cache self-heal** — on a cache hit where `chartSvg` is
  null/empty, re-fetch instead of serving the stale empty
  (`prokerala_repository.dart` `janamKundli()`). Also space out/cache the
  parallel ProKerala calls to cut credit burn at scale. Client change → app
  update; fold into v3.
- **Geocoder:** the offline India atlas (548k places) is built and is the primary
  path; Nominatim is only a rare fallback. Confirm it's solid at scale; district
  disambiguation for same-named villages is deferred.
- **Home rails → server-driven ranking** and **search backend** (grow-into-it).
- **Sweeper hardening:** reap `active` consults with no `lastTickAt` (needs a new
  index) so ghost "active" sessions can't recur.
- **Notification CTA deep-links** for routes with no app route yet (Kundli /
  Horoscope / Panchang / generic Chat) — partially done; finish the app side.
- **Bill only real talk-time** (founder approved fast-follow): the per-minute
  meter should start when the call is truly LIVE (audio connected), not on
  accept/ringing. Prevents charging for connect time.
- **Astrologer app polish:** soften the battery-optimization prompt.
- **Website privacy policy:** dev to add the OpenStreetMap/Nominatim line to the
  live asktro.in/privacy (in-app policy already updated; minor, non-blocking).
- **iOS track (separate):** Apple IAP decision for paid AI (Apple takes a cut on
  digital goods) — a real strategic decision before any iOS launch.
- **Project ownership/billing transfer** off the founder's personal Google
  account/card to the company entity (ownership + billing reassignment, NOT a
  data migration) — do when stable, not during a review.
- **Keystore backup** — losing `asktro-upload-key.jks` = can never update the
  apps again. Confirm it's backed up safely.
- **Agora App Certificate rotation** — it appeared in chat during v2 diagnosis;
  rotate it in the Agora console + re-set the secret + redeploy
  `generateAgoraToken`.

---

## 8. SCALABILITY — must comfortably hold 100,000+ users (founder requirement)

v3 is the "pro version." It must scale to at least 100k users without falling
over or bleeding money. The stack (Firebase/Firestore, Cloud Functions, Agora,
Razorpay, ProKerala, Gemini) can get there, but these are the pressure points to
harden BEFORE claiming 100k-ready. Work each, then **load-test** to prove it.

### 8.1 Cloud Functions (latency + cold starts)
- **Warm pool (`minInstances`)** on the latency-critical functions so users don't
  hit cold starts: `createConsultation`, `onNotificationCreated`,
  `tickConsultation`, and the AI reply engine (`onAiChatMessage`). This also fixes
  the locked-phone-alert delay (fast-follow #1). Balance cost vs latency.
- Set sane **concurrency** + **max instances** caps per function so a spike can't
  fan out into a runaway bill.
- Node 22 runtime (§5.1) — required well before 30 Oct 2026 regardless.

### 8.2 Firestore hot documents & write amplification (the real 100k risk)
- **`dailyStats` hot-doc — DONE (v3).** Now sharded into 20 per-day shard docs
  with a 2-min aggregator summing them into the doc the dashboard reads
  (unchanged); backward-compatible via a `_base` capture. See `stats/dailyStats.ts`.
- **`config/global` caching — DONE (already built).** 60s in-process TTL cache
  in `common/config.ts`; the 10s billing heartbeat no longer re-reads the doc.
- **`rateLimits` — per-user keyed (not a hot doc).** Correct sharding by
  (action, uid, window). Needs its **TTL policy enabled** (below).
- **Presence heartbeat — STILL OPEN (the last big item, #5).** Every live user
  writing to Firestore (~90s app-presence + the 10s billing tick) is the top
  remaining write-amplification risk. Options: move app-presence to **Realtime
  Database** (built for presence/`onDisconnect`) and/or lengthen intervals; and
  reduce the billing-tick write cost. Deliberately saved for last (touches live
  billing) — handle with maximum care.
- **TTL policies to enable AT RELEASE (one-time gcloud/console step each; the
  `expireAt` fields are already written, harmless until the policy exists):**
  ```
  gcloud firestore fields ttls update expireAt --collection-group=rateLimits --enable-ttl --project=asktro-tech-provate-limited
  gcloud firestore fields ttls update expireAt --collection-group=applied --enable-ttl --project=asktro-tech-provate-limited   # dailyStats dedupe markers
  gcloud firestore fields ttls update expireAt --collection-group=prokeralaCache --enable-ttl --project=asktro-tech-provate-limited
  ```
- **Retention purges — BUILT, default OFF (#3).** `purgeOldChatData` (chat
  transcript/media of ended chats, watermark-paced) + `purgeOldRecords` (old
  notifications/alerts). Enable at release by setting `featureFlags.retention =
  true`; windows: chat 90d / notifications 30d / alerts 60d (portal-tunable).
  NEVER deletes `walletTransactions` or consultation records.

### 8.3 Query & index health
- **Index audit — DONE (v3).** Added the missing composite
  `consultations(astrologerId, customerId, createdAt)` (astrologer's repeat-
  customer history). Deploy indexes at release: `firebase deploy --only firestore:indexes`.
- **Sweeper efficiency:** `sweepSessions` must scale — reap `active` consults with
  no `lastTickAt` (needs a new index) so ghost sessions can't accumulate. (Open.)
- Home rails are live snapshots; at 100k, move ranking **server-side** (a
  precomputed rail doc) instead of many per-client queries (grow-into-it item).

### 8.4 Third-party ceilings (money + rate limits)
- **ProKerala — caching DONE (v3).** AI chart build is now per-USER (fixed chart
  permanent, daily transits per-day) instead of per-consultation; the proxy also
  caches results (daily endpoints keyed by date → one call serves the day; birth-
  fixed 30d). See `prokerala/prokerala.ts` + `ai/replyEngine.ts`. Confirm plan
  headroom (120 req/min) and enable the `prokeralaCache` TTL (§8.2).
- **Gemini (the whole COGS):** at 100k the AI bill is the main variable cost.
  Kept profitable by: the wallet gate (no balance = no AI), the one-time capped
  welcome credit, tiered routing (Flash/Pro), the 15-msg/min per-user rate limit
  (the real runaway-bug guard), and the `aiEnabled` kill-switch. DECISION (v3): a
  per-user daily MESSAGE cap was deliberately NOT enabled — it would cut off the
  heavy PAYING users we want (10-hr chatters = pure profit). Monitor ₹/msg live.
- **Agora — customer token now capped to affordable balance + buffer (v3),** so a
  stuck/hostile client can't bill call-minutes past ₹0. Confirm concurrent-channel
  capacity + per-minute cost at scale; model the cost at 100k paid call-minutes.
- **Razorpay:** webhook must be **signature-verified + idempotent** with a
  dead-letter + reconcile job (exists — verify it holds under load).
- **FCM:** use topics for broadcasts (fan-out handled by Google); per-user pushes
  are fine but throttle nudges.

### 8.5 Client & delivery
- **App size / R8** (§5.3) — smaller download matters more at scale.
- **Image CDN/bandwidth:** `cached_network_image` + Firebase Storage; ensure
  images are sized/compressed (Mall + avatars) so bandwidth cost stays sane.
- **Offline geo atlas** (548k places) already removes the Nominatim bottleneck at
  scale — good; keep it as the primary path.

### 8.6 Prove it — load test before claiming 100k
Don't assert 100k-ready; **measure** it. Before the v3 launch (or right after, on
staged rollout): run a load test that simulates realistic concurrency (live
chats, calls, presence, AI messages, recharges) against a staging project, watch
Firestore write QPS, function latency/cold starts, Gemini/ProKerala/Agora spend,
and error rates. Fix the top bottleneck, repeat. Set up **budget alerts** +
dashboards (GCP billing, Firestore usage, function errors) so cost/scale issues
surface early.

---

## 9. SECURITY & READINESS (keep it intact for the pro version)

The pre-flip audit found the app fundamentally solid (money server-only +
idempotent, no data leaks, rules enforce zeroed money on create). v3 must keep
that bar and close the open items.

### 9.1 Money & rules (the core — keep enforced)
- All money logic stays **server-authoritative**; Firestore rules enforce zeroed
  money on create + `notChanging` on update; recharge is **idempotent** with a
  dead-letter + reconcile. Payout amounts are validated (done). Re-audit these
  paths when AI goes paid (§2) since AI billing is new money flow.
- Dev "dummy gateway" recharge is **emulator-locked** (inert in production) —
  keep it that way.
- Mall is **Razorpay-direct**, never wallet/bonus — keep.

### 9.2 App integrity & auth
- **App Check: monitor → enforce** once live traffic looks clean (blocks
  unauthorized backend access). First-week item.
- Play Integrity / SHA fingerprints registered (done for v2) — re-verify for any
  new signing.
- **Google Sign-In** OAuth SHAs registered for both signing keys — verify on the
  production build.

### 9.3 Secrets & keys
- Keys live in **GCP Secret Manager** (ProKerala, Agora, Razorpay) — never in the
  repo. The service-account key stays git-ignored + `.gcloudignore`.
- **Rotate the Agora App Certificate** — it appeared in chat during v2 diagnosis;
  rotate in the Agora console, re-set `AGORA_APP_CERTIFICATE`, redeploy
  `generateAgoraToken`. (Security hygiene item — do in v3.)
- **Keystore backup:** losing `asktro-upload-key.jks` = can never update the apps
  again. Confirm it's backed up in ≥2 safe places.
- **No secrets in logs** — audit function logging.

### 9.4 Abuse & rate limiting
- **OTP abuse:** ensure phone-OTP has abuse protection (Firebase + rate limit) so
  it can't be farmed at scale.
- **AI rate-limit** per user (no burst) — exists; verify.
- **Report/block moderation** — exists (`reportContent`, `blockUser`); add the
  deferred report-content rate limit + astrologer-rating rules gap.
- Admin-only callables must all re-check admin auth server-side (not just hide the
  UI).

### 9.5 Portal & admin
- **Rotate the admin password + enable portal MFA** (first-week item).
- Confirm the founder's admin account role (Super) is correct and least-privilege
  for others.

### 9.6 Play Billing vs Razorpay for wallet recharge — VERIFIED OK (low risk)
Initially flagged as a risk-to-verify (the Play Console nudges "set up a merchant
account" toward Google Play Billing). **Verified 12 Sept 2026 against the live
market — our wallet + Razorpay model is in line and compliant:**
- **Why it's allowed (India-specific):** the CCI antitrust ruling forced Google to
  allow third-party payment processing and **Google paused enforcement of
  mandatory Play Billing in India**. So Indian apps use external gateways for
  in-app digital/service purchases without Play Billing.
- **Market evidence (both bypass Play Billing, direct to their own merchant):**
  - **AstroTalk** (market leader) — **wallet recharge** (₹100 → wallet), paid via
    an external aggregator: VPA `astrotalk2.esbz@hdfcbank` (Easebuzz → HDFC), UPI +
    cards. This is the SAME model as Asktro (wallet + Razorpay).
  - **REVA** (fully-AI astrologer app, 10k+ downloads) — **UPI AutoPay
    subscription** via Paytm (direct-to-merchant mandate), also external.
- **Takeaway:** Asktro's closed-loop wallet recharged via Razorpay is standard and
  safe for India today. Keep this documented (it's a *paused-enforcement*
  regulatory situation, not a permanent written guarantee) but it is **not a
  blocker** — charge for AI via Razorpay in v3.
- **Parked (not now, per founder):** AstroTalk charges **18% GST** on recharges
  (₹100 → ₹118). Revisit whether Asktro should collect GST on recharges — a TAX
  matter, separate from the payment gateway. Deferred.
- **Model note for §2:** REVA's subscription (auto-debit, ₹/month) is an
  alternative to per-minute AI billing — worth A/B testing later. Both are doable
  via Razorpay/Paytm UPI AutoPay.

### 9.7 Privacy & data
- In-app privacy policy is accurate (Firebase, Razorpay, Agora, ProKerala,
  Gemini, Nominatim). Website privacy policy: add the Nominatim line (§7).
- Birth data + phone are PII — retention/TTL policies in place; account-deletion
  flow works (verify on the live build).

---

## 10. v3 RELEASE PROCESS (when the build is ready)

1. Bump version (e.g. `3.0.0+6`) in `apps/customer/pubspec.yaml`.
2. Run the full deprecation/analyze cleanup (§4, §5) — clean analyze + tsc + lint.
3. Deploy changed functions FIRST (AI billing, Node 22 runtime), one at a time,
   service-account key; new callables need the Cloud Run invoker grant.
4. Set `config/global` live values (AI price, freeChatMinutes=3, human rates,
   cost-control knobs).
5. Build a pristine signed AAB on the Mac
   (`flutter clean && flutter pub get && flutter build appbundle --release`).
6. **Full device test** (real phone, incl. a slow-network pass): the §1b smoke
   test PLUS paid-AI chat (free 3 min → 2-min nudge → ₹0 "add money" → recharge →
   continue), video call end-to-end, retention cards.
7. Upload to **internal testing** first (sandbox), verify on device, THEN promote
   to Production.
8. **Staged rollout** for v3 (unlike v2's 100%) — 10% → 50% → 100%, because v3
   changes money behavior (AI billing) and adds video; halt if issues. (v2 went
   100% because it was lower-risk and marketing was gated on full release; v3's
   AI-billing change earns the caution of a staged rollout.)
9. Update store listing screenshots/description to show the paid AI + video
   experience before marketing.

---

## 11. Explicitly DEFERRED (NOT in v3 unless founder moves them up)
- Zodia productionization (own Firebase project) — it's a demo clone only.
- Home rails/search full server rewrite (grow-into-it, not blocking).
- District-level geocoder disambiguation.
- Full Phase-4 retention (proactive nudges, life-event triggers) if v3 gets big.

---

## 12. Decisions still needed from the founder (for v3 kickoff)
1. **AI ₹0 behavior:** pause + resume the chat (recommended for chat), or end it
   like calls? (Calls already = end.)
2. **Report/remedy upsells (§2.6):** in v3, or a v3.x fast-follow?
3. **Zodia (§4.3):** refactor to a shared/flavor codebase now, or keep the fork?
4. **Video rate** and **AI rate confirmation** (₹9/min AI still correct?).
5. **v3 scope cut line:** everything above is a lot — which items are v3 vs v3.x?
   (Recommend: AI paid engine + video + code/Node cleanup = v3 core; retention
   Phase 3 + upsells = v3.1.)

---

## 13. Portal ↔ App wiring audit (11 Sept 2026)

Ran a full end-to-end wiring audit across all portal ↔ customer/astrologer app
features (3 parallel deep audits: content surfaces, config/pricing/notifications,
ops surfaces). **Verdict: no broken wiring, no field mismatches, no active money
leak.** Every money path (per-minute charge, AI-free, wallet gate, coupon credit,
recharge, Mall) is correctly server-authoritative; displayed price == charged
price. The items below are the gaps found — all minor, latent (misconfig-only),
or UX-completeness. None break the live app. Fold into v3.

### Ranked fixes
1. **AI kill-switch has no portal UI** — `aiEnabled` (stop all AI instantly) and
   `aiDailyMessageCap` are read/enforced in `ai/replyEngine.ts` but can only be
   changed by hand-editing `config/global`. Add portal toggles so a non-technical
   admin can pull the lever in an incident. Reader already deployed → **portal-only
   fix.** (Ties to the AI paid engine §2 launch safety.)
2. **`freeChatMinutes` unclamped → latent money leak** — no leak today (default 3),
   but the pricing-page input has no max and `onUserCreate.ts` multiplies it
   straight into every new user's `chatBonusBalance` (spendable on base-rate human
   chats). Clamp in portal + server-side `welcomeBonus` cap. **Portal + functions
   deploy.**
3. **"All Users"/"Astrologers" broadcasts absent from the in-app Notifications tab**
   — the topic path (`sender.ts`) sends push + promo popup but writes no per-user
   `notifications` doc, so the tab only shows paid/unpaid/list segments. By design
   for scale, but the bell is incomplete. **Functions deploy.**
4. **Support: two divergent close paths** — closing from `/support` page uses a
   direct `updateDoc` that skips the customer notification + audit log; the
   dashboard card's close (`closeSupportTicket`) does it right. Make `/support` use
   the callable. **Portal-only.**
5. **Smaller items:**
   - Support admin replies reach the customer only via the notifications tab, not
     inside the ticket thread (customer support screen doesn't render `thread`).
     *(App change.)*
   - No portal visibility of `accountDeletions` (stuck deletion jobs invisible).
     *(Portal-only.)*
   - Rate-less astrologer: client defaults to ₹9/min while server falls back to
     `config.consultationPricePerMinutePaise`; client also skips the server's
     max-rate clamp. Only bites if an astrologer has no rate set AND base price was
     changed. *(App change.)*
   - Product price/stock writes are Super-Admin-only (`firestore.rules`) — fine for
     the founder; blocks lower-tier admins from restocking/pricing. *(Rules/role
     decision.)*
   - Custom non-theme bg/text colours on a push are delivered but ignored by the
     tap-rendered promo popup (only `theme` is read). *(Minor app change.)*
   - Block is checked only at consultation creation, not re-checked mid-chat — a
     block during a live session doesn't sever it until it ends. *(Minor.)*

### By design / no action
- `onlineStatus` is driven by the astrologer app's presence heartbeat, not a portal
  switch — the portal only displays the live dot.
- Money visibility (humans, Mall, rates, money-route deeplinks) hangs off the
  **compile-time** `kMonetizationEnabled` flag — changing it needs an app release,
  not a portal/function deploy. It is `true` now.
- Dead unused method `watchNewest()` (`repositories.dart`) has a bad `active`
  filter but has no caller → no impact. Delete during the §4 code cleanup.
- Coupons portal only ever creates `type:'flat'`; the server's percentage branch is
  unused (not a bug).

### Deploy classification for these fixes
- **Portal-only (pull + Vercel redeploy):** #1 AI controls UI, #4 support close
  path, accountDeletions view.
- **Functions deploy:** #2 server welcomeBonus cap, #3 broadcast→notifications doc.
- **App release (new AAB):** support thread display, rate fallback + client clamp,
  promo popup custom colours.

---

## 14. Pending — decide & do LAST (after all other v3 work)

These are intentionally parked at the very end — not v3 core, not "v4," just the
last things to do once everything above is complete.

1. **Report / remedy upsells (second revenue line).** Soft, in-reading nudges to a
   paid remedy (gemstone / pooja / rudraksha → buy in Mall) and paid downloadable
   reports (Kundali / Marriage / Career / Sade Sati, ₹149–199). **Founder needs to
   design the FEEL first:** it must come from the astrologer naturally and **never
   read like a sales message** — a soft, relevant, occasional push only, never
   pushy or fear-driven. Do NOT build until the founder has decided the approach.
   (Builds on existing pieces: the AI already writes remedy cards; PDF/download +
   a paywall flag already exist.)
2. **Full portal audit + fix the dashboard male/female ratio.** The admin dashboard
   currently shows an **incorrect male/female ratio** — run an audit to find the
   cause (likely the `dailyStats.signups` gender rollup vs the live users) and fix
   it. While there, **audit everything on the portal** end-to-end (every card,
   count, and control) for correctness, not just this one number.
</content>
</invoke>

---

## 15. CRASH & RESILIENCE AT 100k (audited — DISCUSS before implementing fixes)

Full crash-resilience audit of the backend (Cloud Functions + Firestore) and both
Flutter apps. **Verdict: the app is well-built.** Money paths are idempotent +
transactional with dead-letter/reconcile backstops; crash reporting is properly
wired; the hot paths are guarded. The remaining risks are **timeouts, memory, and
edge cases — not lost money or "it falls over."** Nothing here is being changed
yet — the founder wants to talk through it first.

### 15.1 Strengths already in place
- **Backend money-safety:** idempotent recharge (per-paymentId + per-orderId) and
  refund (per-opId); fully-transactional billing tick clamped to presence;
  idempotent endConsultation; per-customer create lock; dead-letter + 5-min
  reconcile for recharge/store; fail-open rate limiter; sharded dailyStats.
- **Graceful 3rd-party degradation:** Gemini + ProKerala adapters return null on
  any failure (caller stays silent / doesn't charge); ProKerala retries 401 + 429/503;
  Agora token capped to affordable balance; AI reply pipeline never re-throws.
- **Monitoring:** an `alerts` collection → Slack fires on every money/trust failure;
  logger.error in every catch (surfaces in Cloud Error Reporting).
- **Apps:** Crashlytics wired in both (FlutterError.onError + PlatformDispatcher.onError,
  RenderFlex overflows non-fatal); hardened Firestore model parsing (num→int, null
  coalesced); shared error/empty/loading views; callable wrapper w/ 120s timeout;
  pervasive `mounted` checks; disciplined stream/timer/engine disposal; place-search
  never throws.

### 15.2 Risks to fix (prioritized)
**Backend**
- **P0 — `onAiChatMessage` can hit the 60s default timeout** (3.5s debounce + up to
  2 Gemini "thinking" calls + paced bubbles up to ~9s each). On timeout it's killed
  mid-reply (typing dots stick, half-written bubble). → set `timeoutSeconds` 180–300;
  cap paced bubbles / shorten the typing ceiling.
- **P1 — no fetch timeout (AbortController) on any outbound call** (Gemini, ProKerala,
  Slack, Razorpay). A hung upstream holds the invocation for the whole timeout,
  burning instance slots; `createRechargeOrder` can hang a paying user 60s. → wrap
  every fetch with an AbortController timeout (Gemini ~25s, ProKerala ~10s, Slack ~5s;
  pass a timeout to the Razorpay client).
- **P1 — reply-engine memory under `concurrency:80` on 512MiB** with two 5MB inline
  images per vision read → OOM risk (kills all 80 in-flight). → give onAiChatMessage
  its own memory (1GiB) and/or lower its concurrency.
- **P2** — moderation `onChatMessageCreated` body not wrapped in try/catch (flag/alert
  silently lost on a Firestore blip). → wrap + logger.error.
- **P2** — a transaction ABORTED on `verifyRecharge`/`createRechargeOrder` surfaces to
  the client; the webhook is the idempotent backstop → treat the Razorpay webhook as
  MANDATORY + alert if no payment.captured webhook seen in N hours.
- **P2** — `sendBroadcast` large segment can stall half-delivered (needs manual
  re-invoke) → scheduled auto-resume of broadcasts stuck `sending`.
- **P3** — `onNotificationCreated` token-prune `.update()` throws on a deleted user →
  use set(merge) / .catch. TTL policies are manual (confirm at launch — already on the
  release list). `getGlobalConfig` read failure unguarded → fall back to DEFAULT_CONFIG.

**Apps**
- **P1 — startup `Firebase.initializeApp` failure is invisible** (it runs before
  Crashlytics exists) → a blank/frozen splash reaches no report. → wrap init in
  try/catch; on failure show a "couldn't start — retry" screen instead of a frozen
  splash.
- **P2** — unguarded stream `.first` in the astrologer quick-note action → wrap in
  try/catch.
- **P3** — RTC token callable has no explicit timeout (~70s "Connecting…" freeze on a
  stalled network) → add a 20–30s timeout into the existing cancel path.
- **P4/P5** — optional: timeout fallback for an unbounded spinner; a `mounted` guard
  after the native date/time pickers in the tools screens.

### 15.3 Monitoring gap
Money failures alert loudly (alerts → Slack), but **availability failures**
(function timeout/OOM, Gemini/ProKerala brownout, a broadcast stuck `sending`) only
`logger.error` — an operator sees them only if watching logs. → add Cloud Monitoring
alert policies on function error/OOM/execution-time metrics + `alerts` rows for these.
