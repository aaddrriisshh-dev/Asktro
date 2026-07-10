# OUTSTANDING — single source of truth (so nothing is forgotten)

_Everything not yet fully done, across code + deploy + accounts + polish. Update
as items close. Companion to AUDIT.md, MASTER_TODO.md, PRE_LAUNCH.md,
SERVER_SCALING_AND_COSTS.md, REMAINING_FIXES_PLAN.md._

## A. Deploy steps pending for code ALREADY BUILT
- [x] **Vercel redeploy** (`cd apps/admin && vercel --prod`) — ships the Trust &
      Safety `/moderation` page. ← next up
- [ ] **App rebuild + ship (both apps)** — ships everything verified on debug but
      not yet released to stores: consent gate on all sign-ins, Report/Block,
      honest delete-account + onboarding copy, astrologer earnings merge, client
      auto-resume, presence heartbeat. (Needs release keystore — see §D.)

## B. Building NOW — astrologer multi-chat (the "scaling" work)
- [ ] **#1 Ring for CALLS only** — chats stop taking over the screen; arrive as a
      non-blocking in-app banner + the existing New-bucket badge.
- [ ] **#2 Multi-chat inbox polish** — unread badges + last-message preview so
      many concurrent chats are easy to juggle.
- [ ] **#3 Concurrency fairness** — per-astrologer concurrent-chat cap and/or
      visible reply-time (customers are billed while queued). NEEDS A DECISION.

## C. Deliberately DROPPED (decided, not a gap)
- **Accept/Decline ON the notification** — decided to skip: saves one tap, only
  matters when app is closed, and carries real regression risk to the working
  ring-when-closed. Revisit only if it becomes a real complaint.

## D. Deferred CODE (scale / lower-severity; documented)
- [ ] **P2-3 portal pagination** + **P2-1/4/16 scale sharding** — only bite near
      ~5k concurrent / ~100k users (see SERVER_SCALING).
- [ ] **P2-6** in-callable rate-limiting (coupon enumeration, order spam).
- [ ] **P2-15** broadcast in-app record (segment pushes vanish if not tapped).
- [ ] **P3-2** error tracking on portal + functions (Sentry) — needs a Sentry account.
- [ ] **Node 22 runtime upgrade** — the actual cure for the deploy-409 churn.

## E. Account / decision items (YOUR side — pre-launch)
- [ ] **P1-10 Apple IAP** decision (IAP vs web-only recharge vs carve-out).
- [ ] **Chat image NSFW auto-scan** — enable Vision API + `@google-cloud/vision`
      + flag + re-export onChatImageUploaded (steps in PRE_LAUNCH).
- [ ] **GitHub Actions** — enable in repo Settings (deferred; billing).
- [ ] **Razorpay LIVE keys** (still on test keys — no real money moves).
- [ ] **iOS APNs** push (Apple key → Firebase) — iOS gets no push until done.
- [ ] **App Check enforcement** (flip at launch once Play Integrity/App Attest provisioned).
- [ ] **Android release keystore** (can't ship to Play without it).
- [ ] **Agora keys** — real voice/video (currently chat-only).
- [ ] **Legal** — Privacy Policy + Terms content (both stores require).
- [ ] **Google Play ($25) + Apple Developer ($99/yr)** accounts.
- [ ] **`config/global.devPaymentsEnabled` → OFF** before launch (kills the dev
      money-mint; it's ON now for testing).

## F. Polish / UX-completeness (from the original audit — MASTER_TODO §H/I/J)
- [ ] Portal "live" session views are static — convert to onSnapshot.
- [ ] Chat **seen** + **typing** indicators dead on the astrologer side.
- [ ] Banner **placements 2–5** never render; banner **priority** not settable.
- [ ] Astrologer notification **icon** mismatch for consultation_request.
- [ ] **Safe-card staleness** — a customer's birth-detail edit doesn't reach the
      astrologer until their next session (mirror on profile-save).
- [ ] Incoming-ring **freshness window** hardcoded (100s) vs config.requestTimeoutSec.
- [ ] Customer **app-icon** regen (astrologer got the Surya icon; customer didn't).
- [ ] **Voice notes in chat** — storage slot exists & locked; no record/send UI (decide if wanted).

---
### ✅ Already DONE (for reference) — all P0 + every security/legal/correctness P1,
plus P2-2/5/7/8/9/10/11/12/14/17, P3-1/3/4, P4-1/2/3, the moderation console, and
the client auto-resume. See AUDIT.md + REMAINING_FIXES_PLAN.md for the full list.
