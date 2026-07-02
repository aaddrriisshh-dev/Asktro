# ASKTRO — Consultation / Timer / Wallet / Billing Engine

Source of truth: **Part 4**. This is the most critical module. It must never
fail, never double-charge, never drift, and always resume cleanly.

## Non-negotiable principles
1. **Server-authoritative.** Timer, wallet, deduction, pricing all live in
   Cloud Functions + Firestore. The client only *displays* what the backend
   writes. Changing device time cannot affect billing.
2. **Money in integer paise.** `pricePerSecond = pricePerMinute / 60`.
   Default `₹9/min = 900 paise/min = 15 paise/sec`. No floats for balances.
3. **Time from server.** All durations computed from `serverTimestamp()`
   deltas, never client clocks.
4. **Idempotent & atomic.** Every wallet mutation runs in a Firestore
   transaction. Payment callbacks are idempotent (keyed by payment id).

## Why elapsed-time billing, not a per-second cron
A literal "deduct every second" cron for tens of thousands of concurrent
sessions is wasteful and drift-prone. Instead we bill by **elapsed server
time**, which is exact and cheap:

- On activation we stamp `startTime` and `lastTickAt = now`, and set
  `lockedBalance` on the user (reserve).
- A **heartbeat** (`tickConsultation`, callable by the active client every
  ~10s, and a scheduled sweep every 1 min as a safety net) computes:
  `deltaSec = floor((now - lastTickAt)/1000)` (minus any paused span),
  `charge = deltaSec * pricePerSecond`, then in one transaction:
  debit wallet, add `billedSeconds += deltaSec`, set `lastTickAt = now`,
  append a running consultation ledger entry, and recompute remaining time.
- The client renders `remainingSec = floor(spendable / pricePerSecond)` and
  counts down locally **for display only**; the authoritative value is
  refreshed on every heartbeat/listener update.

This yields exact per-second billing (₹0.15/sec) with O(1) writes per
heartbeat rather than one write per second, and it self-corrects if a
heartbeat is late (the next delta covers the gap).

## Session lifecycle
```
waiting ──activate──▶ active ──(wallet exhausted)──▶ paused ──recharge──▶ active
   │                    │                               │
   │                    ├──end (either party)──▶ completed
   │                    └──disconnect > timeout──▶ paused ─(timeout)▶ completed/expired
   └──no astrologer accept within requestTimeout──▶ cancelled (missed)
```

### createConsultation (callable)
Atomic checks before creating: astrologer `approved` + `online` + `available`,
customer `active`, `walletBalance + bonusBalance >= minWalletToStart`, and **no
existing active/paused/waiting session** for this customer. On success: create
`consultations/{id}` in `waiting`, mark astrologer `available=false`, notify
astrologer, (for voice/video) allocate `agoraChannel`. Returns sessionId.

### activateConsultation
Called when astrologer accepts (chat/voice/video connected). Sets `status=active`,
`startTime`, `lastTickAt=now`. Reserves an initial slice in `lockedBalance`.

### tickConsultation (heartbeat) — the deduction engine
Transaction:
1. Read session + user. Abort if not `active`.
2. `elapsed = now - lastTickAt - pausedDelta`. `billable = floor(elapsed/1000)`.
3. `charge = billable * pricePerSecond`.
4. `spendable = walletBalance + bonusBalance`. If `charge >= spendable`:
   charge only what's affordable, set remaining to 0, transition to `paused`
   (Level 3). Else debit normally.
5. Debit bonusBalance first, then walletBalance. Update `billedSeconds`,
   `lastTickAt`, `totalCharged`, user `totalSpent`.
6. Compute `remainingSec` and `warnLevel` (see below); write to session.

### Low-balance levels (thresholds from `config/global`, editable in Admin)
- **Level 1** (`remainingSec <= warnLevel1Sec`, default 120): session field
  `warnLevel=1` → client shows premium recharge popup. Billing continues.
- **Level 2** (`remainingSec <= warnLevel2Sec`, default 30): `warnLevel=2` →
  client shows bottom sheet + subtle vibration. Billing continues.
- **Level 3** (spendable hits 0): `status=paused`, `warnLevel=3` → client
  shows "Consultation Paused". Billing stops; chat history retained.

### pauseConsultation / resumeConsultation
Pause stamps `pausedAt` and accumulates `pausedAccumMs` on resume so paused
time is never billed. Resume (after recharge or reconnection) sets
`status=active`, `lastTickAt=now`. **Same sessionId** — no new session, chat
preserved.

### rechargeWallet (Razorpay verified)
1. Client creates order via `createRazorpayOrder` (server, amount from a real
   `rechargePlans` doc — never client-supplied amount).
2. After checkout, client sends `paymentId/orderId/signature`.
3. Server verifies HMAC-SHA256 signature with key secret. **Idempotent**: if a
   txn for this paymentId exists, return existing result.
4. Credit `walletCredit` to walletBalance and `bonus` to bonusBalance in one
   transaction; write `walletTransactions` (recharge + bonus). Apply coupon /
   first-recharge bonus / referral if applicable.
5. If a session is `paused`, auto-`resumeConsultation`.

Razorpay **webhook** is the authoritative fallback: even if the client dies
after payment, the webhook (`payment.captured`) credits the wallet idempotently.

### endConsultation (either party)
Final `tickConsultation`, then `status=completed`, `endTime`, `duration`,
`walletAfter`, generate `receiptNo`, release `lockedBalance`, mark astrologer
`available=true`, increment `totalConsultations` for both, credit astrologer
`earnings` (gross minus commissionPercent), open rating flow.

### Disconnect handling
Client heartbeats carry `networkStatus`. Missing heartbeats > `reconnectTimeoutSec`
→ `pauseConsultation` (billing stops). If not resumed within `sessionTimeoutSec`
→ `endConsultation`. Unused reserved balance is always released; refunds per
`refundRules`.

## Fraud protection
- Single active session per customer (checked atomically in createConsultation).
- Wallet can never go negative (transaction clamps at 0, forces pause).
- Payment callbacks idempotent by paymentId; webhook + client both converge.
- Server time only; client-reported durations are ignored for billing.
- Rules forbid client writes to balance/timer/billing fields.

## Testing matrix (Part 4) — implemented as jest + emulator tests
10s / 1min / 30min / 2h sessions; recharge during chat/voice/video; internet
disconnect; app killed; reboot; duplicate payment; failed payment; negative
balance attempt; backend restart mid-session. Each must recover with exact
totals and no double charge.
