# Asktro — MASTER TODO (single source of truth)

_The consolidated list of every MAJOR item remaining, why it matters, and the exact
third-party accounts / APIs / keys each one needs. When something is done, mark ✅.
Detailed sub-notes live in `PRE_LAUNCH.md`, `PENDING.md`, and `SERVER_SCALING_AND_COSTS.md`._

Legend: 🔴 launch-blocker · 🟠 important · 🟡 nice-to-have · ⚪ your action / account setup

---

## A. NOTIFICATIONS & RINGING

- ✅ **Android — ring when app is closed** (loud heads-up + ringtone, tap opens to request). DONE.
- 🔴 **iOS push notifications** — *code is ready; needs Apple-side setup.*
  - **Requires:** Apple Developer account ($99/yr) · **APNs Auth Key (.p8)** uploaded to
    Firebase → Cloud Messaging · `GoogleService-Info.plist` in both iOS apps · Push +
    Background-Modes(Remote notifications) capability in Xcode · a real iPhone to test.
- 🟡 **Custom iOS ringtone** — bundle `incoming_ring` sound into the iOS app (default sound works meanwhile).
- 🟡 **Accept / Decline buttons ON the notification** (both platforms) — currently you tap to open
  the app and accept there. Enhancement: data-message + local-notification actions.
- 🟡 **Topic broadcasts don't show in the in-app bell** — an all-users broadcast is push-only and
  vanishes if not tapped. Fix: also write a lightweight in-app record. _(audit finding)_
- 🟡 **Astrologer app has no rich-payload / deeplink tap handling** — broadcasts to astrologers show
  bare title/body. Mirror the customer app's handler.

## B. VOICE & VIDEO CALLS (the biggest remaining feature)

- 🔴 **Real voice + video calling via Agora** — currently CHAT only; call buttons say "coming soon".
  - **Requires:** **Agora account** → real `AGORA_APP_ID` + `AGORA_APP_CERTIFICATE` (secret slots
    already exist; token-minting function already built) · re-add the `agora_rtc_engine` Flutter
    SDK (was removed over an Android namespace conflict — needs a compatible version) · mic/camera
    permissions · the in-call UI (billing for calls is already built & tested).
- 🔴 **Call ringing when app is closed** — for *real* calls this is the compliant place for the true
  system call-screen: **Android full-screen-intent** + **iOS CallKit + VoIP (PushKit) push**.
  - **Requires (iOS):** VoIP push certificate, CallKit integration. **(Android):** full-screen-intent
    (auto-granted to calling apps) + CallStyle notification.
- ⚪ **Decide:** Agora covers BOTH voice and video — **no Twilio needed.**

## C. SECURITY (mostly done — one deferred)

- ✅ Customer phone hidden from astrologers; astrologer phone/email hidden from customers (safe cards + private contact). DONE.
- ✅ Chat photos/voice-notes locked to participants. DONE.
- ✅ `chatBonusBalance` free-money hole closed. DONE.
- 🔴 **App Check enforcement** — *deferred to right before launch* (turning it on before production
  App Check is provisioned locks out real users). **Requires:** Play Integrity (Android release),
  App Attest (iOS), debug tokens (dev). Steps in `PRE_LAUNCH.md`.

## D. PAYMENTS

- 🔴 **Razorpay LIVE keys** — code complete, still on test keys (no real money moves).
  - **Requires:** Razorpay account KYC/activation · set live `RAZORPAY_KEY_ID`,
    `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` in Functions secrets · configure the live webhook URL.

## E. LOGIN / SMS

- 🟠 **Phone-OTP at scale** — **Requires:** India **DLT/TRAI registration** for SMS; consider a
  dedicated SMS provider (MSG91 / Fast2SMS) to cut cost. _(See cost doc — this is a real bill.)_

## F. SCALE (only as you approach the numbers — see SERVER_SCALING_AND_COSTS.md)

- 🟠 **Portal "Customer Management" loads ALL users** — must paginate before ~100k users.
- 🟠 **Portal dashboards scan whole collections** — move to pre-computed counter docs.
- 🟠 **Raise Functions `maxInstances`** (currently 100) for spike headroom.
- 🟡 **Upgrade Functions runtime off Node 20** (deprecated; also the cause of the deploy "409 wedge").
- 🔵 **Toward 1M concurrent:** listener consolidation, counters off the hot astrologer doc,
  single-sided billing heartbeat, sweep sharding. _(Not needed at 100k.)_

## G. STORE / RELEASE PREP

- 🔴 **Android release keystore** + signing config (can't publish to Play without it). ⚪ You generate it.
- 🔴 **Legal** — Privacy Policy + Terms (both stores require). ⚪ You provide the details in `PRE_LAUNCH.md`.
- 🟠 **Customer app icon** regen (astrologer got the Surya icon; customer still on the old one).
- 🟠 **Native `android/`/`ios/` build files committed** — ✅ done for astrologer; customer already had them.
- ⚪ **Google Play** account ($25 once) + **Apple Developer** ($99/yr).

## H. REAL-TIME PORTAL (from audit — "live" views that aren't)

- 🟠 **Active-consultations & "Live sessions" views are static** (misleading "live" labels) — convert to
  `onSnapshot(where status==active)` so they truly update live.
- 🟡 Dashboard stat cards need live aggregate docs to auto-refresh.

## I. SMALL WIRING GAPS (from audit — polish)

- 🟡 Chat **read-receipts ("seen")** dead — astrologer side never marks/shows them.
- 🟡 Chat **"typing…" indicator** dead — astrologer side never writes/reads it.
- 🟡 Banner **placements 2–5 never render** (only "home"); banner **priority** not settable in portal.
- 🟡 Astrologer notification **icon** doesn't match `consultation_request` type (cosmetic).
- 🟡 **Safe-card staleness** — `customerProfiles` refreshes only when a consultation starts, so a
  customer's birth-detail edit doesn't reach the astrologer until their next session. Fix later via a
  profile-save mirror (avoid a per-write trigger — it fires on every billing tick).
- 🟡 **Incoming-ring freshness window is hardcoded** (`incoming_call.dart` ~100s) instead of reading
  `config.requestTimeoutSec`. Cosmetic drift if the server timeout ever changes.

## J. MAYBE-LATER (undecided — do NOT build without a decision)

- 🤔 **Voice notes in chat** — storage slot exists & is locked; no record/send UI. Decide if wanted.

---

### Third-party accounts/keys checklist (one glance)
| Service | Needed for | Have it? |
|---|---|---|
| Firebase (Blaze) | everything backend | ✅ |
| Razorpay | payments | test keys ✅ · **live keys ⚪** |
| Agora | voice/video | secret slots exist · **real keys ⚪** |
| Apple Developer + APNs key | iOS push, iOS build, CallKit | ⚪ |
| Google Play account | Android release | ⚪ |
| SMS provider + India DLT | phone OTP at scale | ⚪ |
| Claude/OpenAI + Prokerala | AI astrologers (if pursued) | ⚪ (not wired) |
