# Asktro — Scaling Roadmap: 10,000 → 50,000 users

**Purpose.** We are currently hardening the app for **10,000 users** (that work is
done — see "Where we are now"). This document is the **next slab**: everything
that must be fixed to carry the app from **~10k to ~50k users**, in priority
order. When you approach 10k, bring this file back to me and we execute it top to
bottom. Nothing here is urgent *today* — it is the map for the next lap.

Think of it as: *"the app won't fall over at 10k. Here's what starts to strain
between 10k and 50k, in the order it starts to matter, and how we'll know."*

---

## How to use this file
- **Owner:** when real usage nears the top of the current slab (say ~7–8k active
  users), reopen this and hand it to me. We do the items **in order**.
- **Each item lists:** what it is · why it bites at this scale · **the signal**
  that tells you it's time · rough effort · where in the code.
- **"Signal"** matters most — it's how you know *when*, without guessing. Set the
  monitoring in item 0 first; it's the dashboard that lights these up.

---

## Where we are now (10k-ready — DONE)
The money engine was already solid. This session closed the operational cracks:
- ✅ **Sweep sharded** — the every-minute cleanup robot now drains its batch in
  parallel and runs its 5 jobs concurrently (300s timeout). Won't strand
  astrologers during a mass disconnect.
- ✅ **Account deletion two-phased** — instant lock-out + background erasure that
  can't time out and half-delete a heavy account.
- ✅ **Admin dashboard de-OOM'd** — no longer downloads whole collections. Users
  table paginates server-side; revenue/consultation charts read a per-day
  `dailyStats` rollup; counts/sums use server aggregation.
- ✅ **Flutter money-field crash fixed**; **Agora call uid collision fixed**;
  **resume presence re-seed**; **proportional refund split**; **docs/types**
  refreshed.

**Still to ship these (not new code — just get it live):**
1. Deploy the 6 backend functions + rules + indexes (in progress).
2. **Redeploy the admin portal** website (the dashboard fixes are frontend).
3. **Rebuild the phone apps** (money-crash fix + multi-chat ship in the next build).

**Launch-day checklist** (business/config, not scale): security toggles, NSFW
image scan, iOS push, legal docs, live Razorpay keys — all in `PRE_LAUNCH.md`.

---

## THE 10k → 50k PUNCH LIST (in order)

### 0. Observability first — so you can SEE the limits coming  ·  ~1–2 days
**What:** GCP dashboards + alerts for: Firestore reads/writes per minute, function
invocation count + error rate + p95 latency, hot-document contention warnings,
and a **billing budget alert**. 
**Why:** Every item below has a "signal" — you can't read the signal without this.
This is the steering wheel; build it before the rest.
**Signal:** n/a — this is the thing that *produces* signals.
**Where:** GCP Console → Monitoring; Firebase → Usage. No app code.

### 1. Hot astrologer / AI-persona document contention  ·  ~1–2 days
**What:** Every settled session increments counters on **one** `astrologers/{id}`
doc (+ its `private/financials`). Firestore allows ~1 sustained write/sec **per
document**. A popular human — or worse, an AI persona taking unlimited concurrent
chats — completing more than ~1 session/sec pushes past that and transactions
start failing/retrying on that one doc.
**Fix:** distributed (sharded) counters, or event-source the totals from the
append-only ledger we already write (`astrologerLedger`) and roll them up.
**Why at this scale:** at 50k users a top astrologer easily clears 1 settle/sec at
peak.
**Signal:** contention/retry errors on `astrologers/{id}` writes; rising latency
on `endConsultation` for popular astrologers.
**Where:** `endConsultation.ts` (~132–142), `sweepSessions.ts` expirePaused,
`wallet/ledger.ts` (ledger already exists to source from).

### 2. `walletTransactions` growth — archive / TTL  ·  ~1 day
**What:** The money ledger gets a row per recharge, per refund, and per session
settle. It grows forever. The **dashboard** already stopped reading it (rollup),
but the raw collection still balloons and slows any direct query + inflates cost.
**Fix:** Firestore TTL policy on a cold copy, or periodic archival of rows older
than N months to a `walletTransactionsArchive` (or BigQuery export for finance).
Never delete — accounting retention. Just move cold rows off the hot path.
**Why at this scale:** at 50k users the ledger reaches millions of rows within
months.
**Signal:** ledger collection doc count in the millions; slow finance exports.
**Where:** new scheduled function; `wallet/ledger.ts` writers unchanged.

### 3. Security-rule `get(parent)` on every message  ·  ~1 day
**What:** Chat message/typing security rules do a `get()` on the parent
consultation to check participants. That **doubles reads** on the single hottest
path in the app (live chat) and adds latency to every message.
**Fix:** denormalize `participantIds` (customer+astrologer) onto each message and
typing doc at write time; rules check the field directly — no parent read.
**Why at this scale:** live chat is the highest-frequency operation; at 50k
concurrent-ish chats this is the dominant read multiplier.
**Signal:** Firestore read count dominated by consultation-doc `get`s; chat send
latency creeping up.
**Where:** `firestore.rules` (messages/typing), message-send path in the apps +
any function that writes messages.

### 4. Admin dashboard — extend the rollup to the user/astrologer cards  ·  ~1–2 days
**What:** The revenue/consultation charts now read the `dailyStats` rollup, but
the **user-breakdown cards** (Registered Users, Paid vs Free, Conversion) and the
**Top Astrologers** card still read the `users`/`astrologers` collections
directly. Fine at 10k (bounded), heavy at 50k (a 50k-doc client scan for a
gender/paid histogram; N+1 `getDoc` for astrologer earnings).
**Fix:** extend `dailyStats` to also fold **signups + paid/gender** per day (in
the existing rollup triggers or a `users` create/update trigger); back the Top
Astrologers card with a small leaderboard rollup or a readable denormalized
earnings field. Convert those cards to rollup/aggregation reads.
**Why at this scale:** 50k user docs into a browser tab for a chart is the same
OOM class we just fixed, one tier up.
**Signal:** those specific cards slow/janky; dashboard read cost spikes on load.
**Where:** `stats/dailyStats.ts` (extend); admin `RegisteredUsersCard`,
`PaidUnpaidCards`, `ConversionCard`, `OperationsSection` (PaidVsFree),
`TopAstrologers`.

### 5. `sendBroadcast` → FCM topics / paginated tasks  ·  ~1–2 days  ⚠️ BLOCKER for mass push
**What:** Current broadcast loads **all** users into one function and writes a
notification per user. Fine for a few thousand; it will time out / blow memory
past that. **Do not send an all-users push until this is rewritten.**
**Fix:** FCM **topic** messaging (subscribe devices to topics, publish once), or
fan-out via paginated Cloud Tasks.
**Why at this scale:** the first big marketing blast to 50k users is exactly when
this breaks — and it breaks loudly.
**Signal:** you *want* to send a push to everyone. That's the trigger — fix it
first.
**Where:** `notifications/sender.ts` (`sendBroadcast`).

### 6. Home-feed "top rated" server-side ranking  ·  ~0.5–1 day
**What:** The home feed sorts "top rated" astrologers **client-side over ~100**
docs. Past 100 astrologers the ranking is simply wrong (and the fetch grows).
**Fix:** `orderBy(rating).limit()` + supporting index, server-paginated rails.
**Why at this scale:** you'll have well over 100 astrologers before 50k users.
**Signal:** astrologer count > ~100; users report the "top" list looking off.
**Where:** customer app home feed; add Firestore index.

### 7. Warm instances + concurrency tuning (`minInstances` / `maxInstances`)  ·  ~0.5 day
**What:** Set `minInstances: 1+` on the hot callables (`tickConsultation`,
`createConsultation`, `endConsultation`, `generateAgoraToken`) to kill cold-start
lag, and tune `maxInstances` + per-instance concurrency so a spike scales without
exhausting connections.
**Why now (not at 10k):** warm instances bill 24/7 — only worth it once traffic is
steady, which is squarely this slab.
**Signal:** users feel first-request lag after idle; or spikes hit instance caps.
**Where:** function definitions (v2 options); see `PRE_LAUNCH.md` note.

### 8. Billing tick cost / cadence review  ·  ~0.5–1 day (investigation)
**What:** Live billing ticks every ~10s from **both** parties per active session.
At high concurrency the tick becomes the **dominant** function-invocation cost.
**Fix options:** widen the interval, single-writer tick, or move to a
server-authoritative meter. Measure first — don't pre-optimize.
**Why at this scale:** invocation cost scales with concurrent sessions × 2 × 6/min.
**Signal:** function invocation cost dominated by `tickConsultation`.
**Where:** `tickConsultation.ts`, client tick loops; `BILLING_ENGINE.md`.

### 9. App-side list pagination audit  ·  ~1 day
**What:** Confirm every long list in the phone apps (chat inbox, consultation
history, astrologer directory, transactions) uses **paged/infinite** loading with
limits — never a full-collection load.
**Signal:** app memory/scroll jank on accounts with lots of history.
**Where:** customer + astrologer Flutter apps; shared list widgets.

---

## Cosmetic / low priority (fix anytime)
- **Multi-partial refund ~1 paisa drift** — refunding one session in several parts
  can round off by ~1 paisa. Harmless. (`admin/refund.ts`.)

## Beyond 50k (teaser — the *next* slab, ~50k → 500k)
- Consider a search service (Typesense/Algolia) for real admin/customer search.
- Archive ended consultations to a cold collection to keep hot queries fast.
- Regional/multi-region strategy; CDN for media; Agora capacity planning.
- BigQuery pipeline for analytics instead of Firestore rollups once dimensions grow.
*(We'll write a proper `SCALE_50K_TO_500K.md` when you get there.)*

---

## Operational memory (so any future session has full context)

**Project / infra**
- Firebase project id: `asktro-tech-provate-limited` (note the spelling — it's the
  real id). Functions region: **asia-south1**. Default Storage bucket: **us-east1**
  (the chat-image moderation trigger is region-matched to it).
- Four surfaces: customer Flutter app, astrologer Flutter app, Next.js admin
  portal, Firebase Cloud Functions.

**Deploy playbook (learned the hard way)**
- **No Firebase interactive login on the owner's Mac.** Auth via the service-
  account key: `export GOOGLE_APPLICATION_CREDENTIALS=<firebase-adminsdk key>.json`
  in the terminal, then `firebase deploy ... --project asktro-tech-provate-limited`.
  The env var only lasts that terminal window.
- **`gcloud`** lives at `/opt/homebrew/share/google-cloud-sdk/bin` on the Mac and
  is already service-account authed (persists across terminals). Add it to PATH.
- **Functions batch deploy = 409 "unable to queue."** Deploy **one function at a
  time**; a single-function deploy lands in the background even if it *prints* 409.
  **Verify each** with:
  `gcloud functions describe <fn> --gen2 --region=asia-south1 --format="value(state,updateTime)"`
  → today's timestamp = it landed.
- **Indexes batch deploy also 409s** if any index in the file already exists
  (`firebase deploy --only firestore:indexes` aborts on the first "already
  exists"). Create **new** indexes one at a time via `gcloud firestore indexes
  composite create ...` (or add them by hand in the console — faster for one-offs).
  When prompted "delete these indexes? (y/N)" → **always No** (never delete
  indexes we didn't author; one might back a live query).
- **Stale-code trap:** the Mac's git can be behind while `git pull` says "up to
  date." Before any deploy: `git fetch origin && git reset --hard origin/<branch>`
  then confirm `git rev-parse --short HEAD` matches the intended commit.

**Architecture invariants (do not break)**
- **Billing engine** (`engine.ts` pure `computeTick`, transactional `applyTick`):
  cumulative billing, `MAX_TICK_ELAPSED_MS = 15_000` clamp. Client ticks every 10s
  from both parties; the every-minute sweep is the safety net.
- **Presence gate:** billing frontier = `min(customerLastTickAt, astrologerLastTickAt)
  + 15s`, so one party's heartbeat can never drain an absent party's wallet.
- **Ledgers are append-only** (`walletTransactions`, `astrologerLedger`); balances
  are derived/reconcilable from them. Earnings/pendingPayout live in
  `astrologers/{id}/private/financials`, OFF the public doc.
- **Idempotency:** recharge credit keyed by Razorpay `paymentId` (+ per-order
  guard); account-deletion erasure is idempotent (delete-by-query + guarded
  deletes); rollup increments fire once per source-row create.
- **`dailyStats` rollup:** per-UTC-day counters written by `rollupWalletTxn` /
  `rollupConsultation`; the dashboard reads O(days), never O(transactions). Starts
  counting from deploy time — no backfill (fine, no prod data yet).
- **Never** put a model identifier in commits/code/PRs. Commit trailers required
  (Co-Authored-By + Claude-Session). Work branch:
  `claude/asktro-session-handoff-o1ggo8`.

**Deferred-and-why (don't "re-discover" these as new problems)**
- `minInstances` OFF on purpose (bills 24/7 with no users) — a launch/scale toggle.
- Hot-counter, ledger archival, message-participant denormalization, broadcast
  rewrite, home-feed ranking — all listed above; intentionally deferred as "10k is
  fine, 50k needs them."
