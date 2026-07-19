# Asktro — Audit Fix Plan

_Companion to `DEEP_AUDIT_2026-07-18.md` (the full findings) and `PRELAUNCH_PLAN.md`
(legal/store/ops). This is the **remediation roadmap** — what to fix, in what order,
and why. Nothing here is fixed yet; this is the plan to execute together._

_Date: 2026-07-19._

---

## The one-paragraph truth

The architecture is **sound** — there is **no runaway-overcharge / money-loss P0** in
the billing engine (server-authoritative, clamped time deltas, in-transaction status
re-checks). Across the three tracks audited (Correctness 133, Security 46, Scale 49 =
**228 verified findings**) there is exactly **1 P0** (an operational secret, not a code
bug) and roughly **~20 P1s**. The dominant real risk is **broken authorization on money
& privilege**, and the app is **NO-GO for 50k concurrent** (browns out ~2k–10k) — but
launch-scale (a few thousand) is reachable after Phase 0–1. Store review is still
pending and will add iOS/IAP + UGC items already known from `PRELAUNCH_PLAN.md`.

**Two different bars — don't conflate them:**
- **"Safe to launch"** (Android, low-thousands of users) = Phase 0 + Phase 1.
- **"Safe at 50k"** = also Phase 2. Most scale findings are for this second bar only.

Rough effort is a senior-dev estimate; real numbers depend on test depth.

---

## Phase 0 — Security P0 + authorization hardening  🔴 _before any real money_ (~2–3 days)

This is the biggest and scariest cluster. It's mostly small, surgical changes (rules +
tier checks), not rewrites.

> **Progress (2026-07-19):** items 3–6 are **DONE & pushed** (code + rules). Item 1 is an
> **owner task** (password rotation / git-history scrub / MFA — a destructive history
> rewrite the assistant must not do unilaterally). Item 2 (App Check) is a **Console
> toggle**. Decisions recorded on item 6: the **astrology tier keeps transcript access**
> (consultation/message reads unchanged — matches Neeraj's documented audit role), and the
> **astrologerCustomers birth-data marker is left as-is for now** (no TTL/snapshot yet).

1. **[P0] Rotate admin password + scrub git history + add MFA.**
   `seed_admins.mjs` — `Asktro@2026` is recoverable from history (commits `3785187`/`fd06067`).
   → Rotate all admin creds (distinct + forced reset), add portal MFA, then `git filter-repo`/BFG
   the literal out of history, force-push, invalidate forks/caches; verify `git log -S 'Asktro@2026' --all` is empty.
2. **[P2→treat as blocker] App Check enforcement** on money/cost callables (recharge, store order,
   Agora token, AI reply, prokerala) — Console **monitor mode** first, then enforce. Without this,
   every rate-limit/abuse control below is bypassable, so it gates the value of the rest.
3. **Admin-tier gates (recurring bug — fix as one sweep):** require the correct tier server-side for
   `commissionPercent` (super), per-minute rates + `isAI` (super), `setUserStatus` (super/ops),
   `resolveOpsItem` (super/ops), `sendBroadcast` (super/ops), `storeCoupons` mint (super),
   store product `pricePaise`/`stock` (super).
4. **Astrologer self-edit lockdown:** add `chat/voice/videoRatePaise` + `experience` (+ other trust
   fields) to the self `notChanging([...])` list in `firestore.rules`; clamp `price` against a
   server-config max in `createConsultation.ts`.
5. **Session/token revocation:** `revokeRefreshTokens` (+ disable + clear claim) on admin demote/remove
   and on astrologer suspend; enforce token freshness on privileged callables.
6. **PII read-scoping:** restrict chat transcripts / consultation content / `customerProfiles` list to
   super/ops (not the astrology tier); expire the `astrologerCustomers` birth-data marker or snapshot
   birth data onto the consultation.

---

## Phase 1 — Money-path correctness & abuse  🟠 _before real money_ (~2–3 days)

> **Progress (2026-07-19):** items 7, 9–16 are **DONE & pushed**, each verified against the
> Firestore-emulator money-path suite (143 unit + 63 integration green). Plus a founder-
> requested extra — **per-tick billing consolidated into one clean transaction per session**
> (audit #46), so a customer sees `−₹45 · chat · 12m` instead of ~30 tiny rows.
> **Deferred:** item 8 (backgrounded dead-air over-bill) — it reworks the core billing
> frontier and the audit's one-line suggestion doesn't fully fix it (the settle-window +
> lastTickAt clamp defer the over-bill rather than remove it). Bounded impact (~15–30s on a
> 15–45s app-switch; >45s already pauses). Needs a dedicated pass with focused emulator
> tests. Everything here needs the batched **backend deploy** to take effect.

7. **[Correctness P1] Sub-second billing leak** — `tickConsultation.ts:197`: persist
   `lastTickAt = lastTickAtMs + billedSeconds*1000` (not `billToMs`) so the <1s remainder carries.
   (Currently a small systematic **under**-charge — customer-favorable, but fix for accuracy.)
8. **[Correctness P2] Backgrounded dead-air overcharge** — gate `billTo` on the ticker's **previous**
   presence marker, not the just-overwritten one, so a 15–45s app-switch bills one settle window, not the gap.
9. **[Correctness P3] `activateConsultation` seed `astrologerLastTickAt`** for human sessions (mirror `resumeConsultation`).
10. **[Security P2] First-recharge promo farmable** — re-validate `isFirstRecharge` **inside** the
    `creditRecharge` transaction.
11. **[Security P2] AI replies free on a paused/zero-balance chat** — bail on `paused` in `replyEngine.ts`
    (or re-verify balance/re-activate); gate the message-create rule on active/waiting.
12. **[Security P2] Store coupon integrity** — re-check `usageLimit` inside `confirmStoreOrderPaid`'s tx +
    per-user redemption record; gate `storeCoupons` mint to super; rate-limit + generic-response
    `validateCoupon` (kill the enumeration oracle).
13. **[Security P2] Store-order webhook dead-letter/alert** — parity with the recharge path (don't swallow
    mismatch/confirm failures behind a 200).
14. **[Security P2] Admin idempotency** — mint `opId` once per intent (dialog open), reuse on retry.
15. **[Security P3] Reject non-finite money** — `Number.isFinite()` guard on `adjustWallet`/`refundConsultation`.
16. **[Security P1] Onboarding birth-details loss** — only clear the pending buffer on a confirmed create,
    or merge birth fields even when the user doc already exists.

---

## Phase 2 — Scale to 50k  🟡 _before scaling past ~5–10k concurrent (NOT before launch)_ (~4–6 days)

Only needed before a real growth push. All 8 scale P1s:

17. **Shard `dailyStats/{day}`** (sum-on-read) + dedupe/TTL the `applied/` subcollection.
18. **Keep the shared AI-persona doc out of the money transaction** — `isAI` guard on
    `totalConsultations`/`earnings`/`pendingPayout`; for humans move `totalConsultations` to a sharded
    counter outside `settleConsultation`.
19. **Consolidate per-tick ledger** — one `walletTransactions` row at `endConsultation`/`expirePaused`
    (kills ~6× write amplification and the `dailyStats` fan-in).
20. **Home rails → server rollup doc** (`homeSections/topAstrologers`) instead of 2 permanent unfiltered
    `limit(100)` live listeners; move `onlineStatus` churn to a presence rollup.
21. **Server-side ranking + composite indexes** — `orderBy('rating').limit(n)`; back search with a real
    index (top astrologers currently vanish past the doc-ID-truncated window).
22. **`sendBroadcast` → checkpointed worker** (Cloud Tasks / Firestore-triggered) with
    `timeoutSeconds:540` as immediate mitigation; **+ idempotency** (`broadcastId`, create-if-absent).
23. **Gemini context caching** — one `cachedContent` per consultation for the static persona prefix
    (single largest avoidable cost line).
24. **P2 scale cleanup:** `minInstances` on money/call-join callables; global Gemini rate-limit + retry
    (429 currently drops replies silently); dual-tick call contention; sweep `limit(500)` pagination.

---

## Phase 3 — P2/P3 hardening & remaining PII  🟢 (~2–3 days, ongoing)

25. `supportTickets` IDOR (constrain both parties); `temp_uploads` content-type allowlist; remedy update
    rule → allowlist; `signOut` also signs out GoogleSignIn; displayed-rate vs billed-rate mismatch;
    referral ledger balance chaining; remaining correctness P2s from the doc.

## Phase 4 — Polish  ⚪ (as time allows)

26. Correctness P3/P4 robustness nits (free-tier edge cases, bonus-split clamp, silent `?? default`
    fallbacks, the 2px RenderFlex overflow, etc.).

---

## Cross-cutting (parallel, mostly owner tasks — from `PRELAUNCH_PLAN.md`)

- Legal docs + hosted Privacy Policy URL + web account-deletion URL.
- **iOS/Apple IAP decision** (AI = digital → IAP; human/Mall = Razorpay OK) — Android-first recommended.
- In-app "for entertainment" disclaimer + <18 age gate; chat-image NSFW auto-scan.
- Release keystore, package IDs off `com.example.*`, Play/Apple accounts, iOS APNs.
- **Run the pending Store-review audit track** — it will formalize the above and may surface more.

---

## Recommended execution order

1. **Phase 0** (security) + the money items of **Phase 1** → **Android launch-ready at low scale.**
2. **Legal/store cross-cutting** in parallel (owner content).
3. **One authoritative live money + commission reconciliation test** (the `PRELAUNCH_PLAN.md` §2.D item).
4. **Phase 2** (scale) **before** any marketing push past a few thousand concurrent.
5. **Phases 3–4** as continuous hardening.
6. Finish the **Store-review** audit track and re-verify.

**Bottom line:** you are ~**Phase 0 + Phase 1 (≈4–6 focused days) + legal/store content** away from a
safe **Android low-scale launch**, and Phase 2 away from **50k**. No fires — a clear, ordered list.
