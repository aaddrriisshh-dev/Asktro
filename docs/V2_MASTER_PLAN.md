# Asktro — Version 2 Master Plan

**Date compiled:** 4 Sept 2026
**Status:** Implementing. **Phase 1 DONE in code** (onboarding reorder after login +
gate + confirmed save; OTP redesign; CTA pinned) — see SESSION_HANDOFF.md "v2 Phase 1
IMPLEMENTED". Not yet compiled/tested; live app untouched. Phases 2–5 pending.
**Goal:** Ship a paid v2 that (a) fixes the live bugs, (b) turns on **compliant**
monetization, (c) is hardened for ~100k downloads — and gets **fast Play approval**
with low rejection risk. Roll out via **staged rollout** after a real fresh-device
+ slow-network test.

This plan is compiled from the full launch + audit conversation. It is the single
source of truth for v2. Deferred items are listed under "Version 3" at the end.

---

## 0. Where we are (context)
- Asktro is **LIVE** on the Play Store (India), free v1, `kMonetizationEnabled=false`.
- Three post-launch fixes already done (see SESSION_HANDOFF.md): content-rating
  (→ "Everyone"), Firebase Play-signing SHA (OTP login), ProKerala **Emerald** plan
  (chart + AI rate limit).
- Company **Asktro Tech Private Limited** is registered (real entity). Play account
  is an **individual** account — fine for payments; no D-U-N-S required.

---

## 1. Monetization model for v2 (locked to Google Play policy)

Verified against Google Play's actual Payments policy text (Sept 2026).

| Surface | v2 decision | Payment | Why it's compliant |
|---|---|---|---|
| **AI chat** | **FREE** (hook + engine) | — | AI is not "two individuals" → can't use the 1:1 exemption; free avoids the whole issue. |
| **Human astrologer consult** (live chat/call/video) | **PAID** | **Razorpay** | Google's explicit **"1:1 online paid service between two individuals, not replayable"** exemption (they name coaching/counselling/advisory). Core revenue. |
| **AstroMall** (physical goods) | **PAID** | **Razorpay** | Physical goods → explicitly NOT allowed on Play billing. |
| **Kundli report / download** | **FREE** in v2 | — | A durable digital file does NOT fit the live-1:1 exemption → would need Play billing. Keep free now; revisit in v3. |

**Conditions to stay inside the live-consult exemption:** must be a **real person**
(office astrologers), and **not sold as a recorded/replayable** session (live call is
cleanest; a persisted text-chat transcript is a minor grey edge — acceptable, live
call safest).

**Honest caveat:** human consults sit in a policy zone the whole industry
(AstroTalk/AstroSage) runs on Razorpay and is explicitly carved out — strong footing,
but Google *could* reclassify one day. Keeping it genuinely human is the protection.

### Wallet rules (money-safety)
- **Two buckets already exist:** real `walletBalance` (recharged money) vs
  `bonusBalance`/`chatBonusBalance` (free offers). Keep them separate.
- **Bonuses/free credits → SERVICES only** (consultations/chat). Bonus is spent
  first on consults (already how `billing/engine.ts` works).
- **Products (Mall) → REAL money only.** Mall stays **fresh-payment (Razorpay),
  never from the wallet/bonus** — leave it exactly as it is today (it does not touch
  the wallet). This prevents the "₹100 bonus buys a ₹200 product = ₹100 loss" leak.
- (Future, if wallet-pay-for-Mall is ever added: enforce real-balance-only, never bonus.)

### Play Console changes for v2
- **Financial features** declaration: declare truthfully — person-to-person
  consultation services + physical goods via third-party gateway (Razorpay).
- **Data safety:** re-add "Payment info" + "Purchase history".
- **Store listing / screenshots:** may now show wallet/recharge/human astrologers/Mall.
  Do NOT headline "paid AI chat" (AI is free).

---

## 2. Critical bug fixes (must be in v2)

### 2.1 First-run onboarding "Guest" bug — PRIORITY 1
- **Cause:** details collected BEFORE login, handed off after login via a fragile
  buffer that loses a **timing race** on slow phones/networks → user lands as "Guest"
  with no details → nothing works.
- **Fix:** move **profile setup to AFTER login** → details write **directly** to
  `users/{uid}`. No buffer, no race.
- **Close every loophole (3 locks):**
  1. **Gate:** after login, if the account is missing the ESSENTIALS, the app blocks
     entry to Home until they're filled. **Essentials = name + date of birth + birth
     PLACE (coordinates)** — the things the chart actually needs. **Birth TIME stays
     OPTIONAL:** "don't know time" (`birthTimeKnown=false`) → chart uses noon (as
     today, ProKerala still called) and the user **passes the gate**. No essentials =
     held at the details step (never a Guest inside the app). Also pin the onboarding
     **CTA to the bottom** here (fixes the below-the-fold issue across all steps).
  2. **Confirmed save + retry:** verify the write actually landed before proceeding;
     retry on network hiccup.
  3. **Slow-network test (required):** test on emulator throttled to 2G/EDGE, on a
     real budget phone at 1–2 bars, AND by toggling airplane mode at the exact save
     moment. Pass = user is either saved-and-in, or held at "complete your details" —
     NEVER dumped inside as Guest.
- Files: `auth/onAuthUserCreate.ts` (server Guest doc), `auth_controller.dart`
  `_ensureProfile`, `repositories.dart` `ensureProfile`/`applyOnboarding`,
  `home_gate.dart`, `router.dart` (buffer helpers — removed/reworked after reorder).

### 2.2 OTP screen redesign
- **Auto-fill handling:** auto-read the SMS and **auto-submit**; handle Android
  **instant verification** (no code shown) path; support paste + auto-advance when typed.
- **Look (not AI-template):** on-brand celestial theme + logo + app colors; show
  "sent to +91 …" with **change number**; resend **timer**; clean **verifying** and
  **error** states (inline message, gentle shake); flows into the new after-login
  onboarding.

### 2.3 Notification CTA fix (portal + app)
- **Give the CTA its OWN destination.** Portal: add a CTA-destination picker (Chat,
  Recharge, Kundli, Horoscope, Home, specific astrologer, Mall…). Backend: pass a
  `ctaDeeplink` in the FCM payload (separate from the tap deeplink). App: read and
  route it; **add the app routes that don't exist yet** (a direct chat/consult page,
  kundli, horoscope, panchang). Add **validation** (no blank `/astrologer/`, require
  leading slash, resolvable route). Fix: half/full landing needs a theme/image to
  render a CTA; dead landing colour pickers (either wire them or remove).
- Files: `admin .../broadcast/page.tsx`, `DeepLinkSelect.tsx`, `LandingControls.tsx`;
  `notifications/sender.ts`; `home_shell.dart` `_handlePushTap`/`_followDeeplink`,
  `notifications_tab.dart`; `router.dart`.

### 2.4 Kundli chart self-heal
- When a cached kundli chart is empty/null, **re-fetch** instead of serving the stale
  empty (self-heals any user who cached an empty chart during an outage).
  `repositories.dart` `janamKundli()`.

### 2.5 Geocoder reliability (birth-place autocomplete)
- Replace free OpenStreetMap **Nominatim** (rate-limits/blocks production traffic,
  fails silently) with a **reliable Places API**, ideally **proxied via a Cloud
  Function** so the provider can change later without an app update. Add a graceful
  fallback. `place_search_service.dart`.

### 2.6 Minor UX bugs
- Kundli shows "Please sign in" to a signed-in user if profile hasn't loaded yet
  (`janam_kundli_screen.dart`).
- Daily Horoscope defaults to Aries if opened before profile loads
  (`horoscope_screen.dart`).
- Notifications with non-chat deeplinks do nothing on tap (`notifications_tab.dart`).
- Free-chat silent failures: verify `config/global` (`freeChatMinutes`,
  `minWalletToStartPaise`) and add a friendly "your free session ended" message
  instead of the silent no-op (`chat_consultation_screen.dart`,
  `astrologer_profile_screen.dart`).

---

## 3. Rendering / UX QA (must verify visually on real devices)

Reading code is not enough (that's how the onboarding CTA-below-fold slipped through).
**Required visual QA on small / medium / large screens** for:
- **Onboarding CTA below the fold** — pin the CTA to the bottom, content scrolls above
  (shared `OnboardingScaffold` in `onboarding_widgets.dart` → one fix covers all steps).
- **Banners, push landing popup, coupons, home popup** render correctly at all sizes.
  Note: banners/coupons are hidden while `kMonetizationEnabled=false`; they return in
  v2 — test them then.

---

## 4. Scale hardening (for ~100,000 downloads)

Foundation is strong and Firebase auto-scales; these are the reinforcements needed
before big traffic:
1. **Pagination ("load more")** on chat, consultation history, transactions.
2. **Server-side astrologer ranking** (today it ranks client-side over only 100 docs →
   wrong once the catalog exceeds 100). `repositories.dart` rails.
3. **Enable Firestore TTLs** the code already writes for (`rateLimits.expireAt`,
   `dailyStats/applied.expireAt`) so those collections don't grow unbounded.
4. **Enable App Check** (blocks bot abuse of `prokeralaAstrology`/`aiChatReply`/APIs).
5. **Fix store-coupon controls** (`store/store.ts`): close the global usage-limit race
   (validate+increment in the confirm transaction, mirroring `creditRecharge.ts`) and
   enforce the per-user limit by reading `storeCouponRedemptions`.
6. **Cost controls (important — free AI at scale = real bill):** per-user **daily cap**
   on free AI messages; **Firebase + ProKerala budget alerts**; confirm **ProKerala
   plan tier** is sized for traffic (Emerald may need upgrading as users grow).
7. **Monitoring:** apply the **Crashlytics Gradle plugin** (readable native crashes),
   add **analytics to the astrologer app** (currently none), add
   **`Crashlytics.setUserIdentifier`** on sign-in, add **screen tracking**.
8. **Robustness:** wrap `Firebase.initializeApp` in try/catch + fallback screen;
   make release signing **fail hard** if `key.properties` is missing (no debug-key
   fallback); enable **R8** with Firebase/Flutter keep rules.

---

## 5. AI cost kill-switch (founder's explicit requirement)

Build v2 so AI can be turned **off without an app update**, so the founder can trial
AI for ~1 month, watch the bill, and switch it off if unaffordable:
- **Wire `firebase_remote_config`** (present but currently UNUSED) as a real app-wide
  **kill-switch** (e.g. `aiEnabled` flag) → flip it and all AI features hide instantly.
- **Portal control:** AI astrologers are DB records → make them toggleable
  (active/inactive) from the portal so they can be removed from the app **live**.
- Result: a dashboard lever — "AI cost climbing → turn AI off, same day, no release."

---

## 6. Security tightening
- **App Check** (also in §4) — before mass release.
- Tighten **content-tier Firestore rules**: the `astrology` admin tier can currently
  write `banners`/`notifications`/CMS directly (bypassing the super/ops gate on
  `sendBroadcast`). Low severity (no money), but close the UI-vs-rules gap.
- (Everything money-critical is already function-write-only, idempotent, PII-walled —
  verified. No critical security holes found.)

---

## 7. Code-quality / handoff polish (so it reads as team-built, dev-ready)
- Trim over-dense comments to a natural level; the code is professional but the
  comment density + doc sprawl are the only "AI tells."
- Clean the `docs/` folder — archive/delete stale audit/plan files; keep
  BILLING_ENGINE.md / DATA_MODEL.md / this plan as the current truth (README &
  ARCHITECTURE describe an older/aspirational state — update them).
- Add meaningful **Flutter tests** as client code is touched (backend is well-tested;
  client is not).
- Document that **Asktro is the canonical tree** and Zodia is a separate demo fork
  (fixes may need applying twice).

---

## 8. Release process (mandatory before shipping v2)
1. **Fresh-install end-to-end test on a slow network** (see §2.1) — must pass.
2. **Visual QA** of onboarding + all promo renderings on multiple screen sizes (§3).
3. Update Play Console **financial-features + data-safety + listing** (§1).
4. Build AAB, submit, **staged rollout 10% → 50% → 100%**, monitor Crashlytics.
5. Patch/update reviews are faster than the first launch.

---

## 9. Version 3 (deferred — NOT in v2)
- **Paid AI chat** — requires **Google Play Billing** (15–30% cut) to be compliant.
- **Paid Kundli report/download** — deliver via a **live consultation** (rides the
  1:1 exemption on Razorpay) OR via **Google Play Billing**, OR keep free.
- The broader **"is paid AI central" business decision.**

## 10. Later / operational (not blocking v2)
- Optional: move to a Play **Organization** account under Asktro Tech Pvt Ltd
  (needs D-U-N-S) + transfer the app — cosmetic/branding, not required.
- Optional: transfer Firebase/GCP project ownership + billing off the personal
  account to the company (ownership + billing reassignment, keep ≥1 owner during switch).

---

## 11. Decisions locked & execution notes (4 Sept 2026)

**Single release (no split).** Do NOT ship a standalone onboarding patch. Ship
**ONE v2** that includes the fixes **AND** monetization (Mall + human astrologers).
Reason: current free v1 earns nothing; only ~10–15 friends/family have it and it is
NOT advertised, so there is no urgency to patch and no point marketing until v2 earns
money. **Do not market until v2 (with monetization) is live.**

**Account type — confirmed.** An **individual Google Play developer account CAN
publish a monetized app** (paid, IAP, and Razorpay for exempt items). **D-U-N-S is
NOT required** — it's only needed to register a NEW account as an "Organization."
Asktro's existing individual account is fine for full v2 monetization. (Optional
belt-and-suspenders: verify on Play Console → Developer account → Account details.)

**Approval confidence.** High but not guaranteed (nobody can promise Google). The
model maps every paid item to a category Google's own policy text explicitly allows
(physical goods; live 1:1 human service). The v1 rejection cause (content rating) is
fixed and won't recur. Residual risk = execution details + the human-consult grey
edge → de-risk with careful declarations, staged rollout, and readiness to justify
consults as a human service (as AstroTalk/AstroSage do, live on Play).

**Build environment / division of hands.** The assistant's environment has **NO
Flutter SDK** (verified: `flutter: command not found`) — it can write all Dart/app
code and build/test the **backend (Node functions)** and **admin portal (Next.js)**,
but the **Flutter app AAB is built and device-tested on the founder's Mac** (all
month's builds happened there). The onboarding fresh-install + slow-network test runs
on the Mac/device.

**Confirmed internal build order for v2:**
1. Onboarding reorder (after login) + gate + confirmed save, and the OTP redesign.
2. Monetization turn-on (human consults + Mall paid via Razorpay; AI free; Kundli
   free; wallet rules; `config/global`; Play declarations).
3. Notification CTA fix + rendering QA (pin onboarding CTA; promo rendering) + chart
   self-heal + geocoder + minor bugs.
4. Scale + cost + AI remote kill-switch + monitoring + security tightening.
5. Handoff polish → full test (incl. slow-network onboarding + visual QA) → staged
   rollout 10%→50%→100% → THEN market.

**AI cost lever (locked):** v2 must let AI be turned OFF with no app update (remote
kill-switch + portal toggle on AI astrologer records). Founder trials AI ~1 month,
watches the bill, and can have it switched off same-day if unaffordable.

**Next session pickup:** decide "start building v2" go/no-go, then begin Phase 1
(onboarding + OTP). Nothing is coded yet — planning only.
