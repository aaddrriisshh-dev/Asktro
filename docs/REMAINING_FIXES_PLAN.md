# Remaining fixes — plan (prepared, NOT yet implemented)

Status after the audit-fix batch: all **P0** and every **security/legal/correctness P1**
are fixed, deployed, and device-verified. This doc lists what's still open, what I'd
change for each, the risk, and how I'd verify it — so it can be approved and executed
in order. **No code has been changed for anything below yet.**

---

## ✅ TIER 1 — DONE (committed + pushed; needs a deploy round)
All three implemented and verified (backend build + 26 unit + 4 emulator tests /
portal typecheck + full next build). **To go live, deploy this batch:**
1. `firebase deploy --only functions` (ships P2-5 cumulative billing + the new
   `resolveOpsItem` callable). Expect the usual Node-20 409 wobble — verify with
   `firebase functions:list`.
2. `firebase deploy --only firestore:rules` (ships P2-8 ledger restriction).
3. Grant **Cloud Run Invoker → allUsers** on the new **`resolveOpsItem`** callable
   (so the Resolve buttons work) — same as the earlier new callables.
4. Redeploy the admin portal on Vercel (`cd apps/admin && vercel --prod`) — ships
   the new **Trust & Safety** page (`/moderation`).

Detail of what each was:



### 1. P2-5 — per-tick rounding overcharge (real money bug on custom rates)
- **Problem:** billing rounds each ~10s tick separately. For a per-minute rate not
  divisible by 60 (e.g. ₹25/min = 41.67 paise/sec), the per-tick rounding accumulates a
  small systematic **overcharge** to the customer.
- **Change:** bill from the **cumulative** billed-seconds total — compute
  `round(pricePerSec × totalBilledSeconds) − alreadyCharged` per tick, so rounding
  happens once against the running total, not every tick. Touches `billing/engine.ts`
  (computeTick) + `billing/tickConsultation.ts`.
- **Risk:** MEDIUM — touches the tested billing engine. Mitigated by new unit tests.
- **Verify:** new engine unit tests (₹25/min over many ticks nets exactly
  `round(pps×totalSec)`), plus an emulator tick test.

### 2. P2-8 — any admin can read money via Firestore rules
- **Problem:** the portal UI hides money from non-super admins (`canSeeMoney`), but the
  Firestore **rules** let *any* admin read `walletTransactions`, astrologer earnings,
  and `auditLogs`. A lower-tier admin could reconstruct all revenue the UI hides.
- **Change:** tighten rules so money-sensitive reads require `adminRole in
  ['super','finance']` (mirror the UI gate). Touches `firestore.rules` (+ a claims helper).
- **Risk:** MEDIUM — could over-restrict a legitimate admin view. Mitigated by mapping
  each portal page's reads to the right tier before changing.
- **Verify:** re-read every admin page's queries; deploy rules; confirm a non-finance
  admin login still loads its allowed pages.

### 3. Portal moderation + alerts pages (also closes P3-3)
- **Problem:** the new safety/ops data is **captured but invisible** — admins have no
  screen for user reports, flagged messages, the image-review queue, or operational
  alerts (failed-payment dead-letters, refund shortfalls).
- **Change:** new admin pages: **Moderation** (reports + flagged messages + image queue,
  with resolve/act) and **Alerts** (failed credits, refund shortfalls, NSFW removals),
  reading `reports` / `alerts` / `failedWebhookCredits` / `imageModeration`. Add a small
  admin callable to mark a report/alert resolved.
- **Risk:** LOW — additive TypeScript, fully typecheckable here.
- **Verify:** `npm run typecheck`; wire to existing admin nav.

---

## TIER 2 — quality / robustness

### 4. P2-7 — "ghost online" presence
- Astrologer presence is a manual boolean with no heartbeat; a crashed app shows online
  forever. **Change:** write a `lastSeen` heartbeat from the astrologer app + a sweep
  that flips stale-online → offline. Touches astrologer app + `sweepSessions`.
- **Risk:** LOW–MEDIUM. **Verify:** emulator sweep test + on-device.

### 5. P2-10 / P2-11 — astrologer ledger + customer ledger clarity
- No append-only ledger for astrologer earnings; customer ledger conflates the 3 balance
  buckets. **Change:** write a `walletTransactions`-style row on each astrologer credit;
  split/annotate the customer ledger balance fields so they reconcile. **Risk:** MEDIUM
  (money records). **Verify:** emulator tests.

### 6. P2-14 — data retention / auto-purge
- No TTL/purge of old chat logs & PII. **Change:** a scheduled job that purges chat
  media + messages older than a configurable retention window. **Risk:** MEDIUM (deletes
  data) — gated behind a config flag + dry-run first. **Verify:** emulator + flag off by default.

### 7. Client auto-resume on reconnect (completes P1-2 UX)
- Server already pauses a disconnected session; add client auto-`resume` when the app
  reconnects with balance (today the user taps Resume). Touches `consultation_controller.dart`.
- **Risk:** LOW (guard against resume loops). **Verify:** `flutter analyze` + on-device.

### 8. Accept / Decline on the notification (Android)
- Data-message + notification action buttons so an astrologer can accept/decline from the
  lock screen without opening the app. Touches native Android + `sender.ts` payload.
- **Risk:** MEDIUM (native). **Verify:** on-device.

---

## TIER 3 — polish / minor (fast)

- **P4-1** README: add the `firebase functions:secrets:set` step for the 5 secrets.
- **P4-2** replace the placeholder Flutter test (`1+1==2`) with a real widget/smoke test.
- **P4-3** remove the dead `'finance'` branch mismatch in admin money guards.
- **P2-13** either add app-layer encryption OR soften the onboarding "encrypted" copy so
  it isn't an overclaim (recommend the copy fix now, encryption later).
- **P2-15** broadcast fan-out: also write a lightweight in-app record for segment
  broadcasts (scale/robustness).

---

## NOT CODE — your decisions / account setup (tracked in PRE_LAUNCH / MASTER_TODO)

- **P1-10 Apple IAP** — decision: IAP vs web-only recharge vs carve-out.
- **Image NSFW auto-scan** — enable Cloud Vision API + `@google-cloud/vision` + flag + re-export.
- **GitHub Actions** — enable in repo Settings (deferred — billing).
- **P3-2** portal/functions error tracking (Sentry) — needs a Sentry account/DSN.
- Razorpay **live keys**, iOS **APNs**, **App Check** enforcement, release **keystore**,
  **Agora** keys — all pre-launch, your side.

---

## Recommended order when we resume
**Tier 1 trio first** (P2-5 money rounding → P2-8 admin read tier → portal moderation/alerts
pages), then Tier 2, then Tier 3. Each is committed + pushed separately and verified
(backend build+tests / portal typecheck / `flutter analyze`) before moving on.
