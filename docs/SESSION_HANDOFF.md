# Session handover — launch status snapshot

_Last updated at end of the pre-submission session. Read this first when
resuming — it captures exactly where things stand so work can continue without
re-deriving context._

## Where we are right now

**The apps are built, signed, and handed off. Awaiting Play Store submission +
review.** The founder is taking a 2–3 day break and will return with
**post-approval updates**, or sooner if **something gets stuck during Play
review**.

Both apps are **Play-ready and testable today**:

| App | Package ID | AAB (Play) | APK (test) | Signed with | Phone login |
|-----|-----------|-----------|-----------|-------------|-------------|
| Customer | `in.asktro.customer` | ✅ built | ✅ built | shared upload keystore | ✅ works (fingerprints registered, OTP confirmed) |
| Astrologer | `in.asktro.astrologer` | ✅ built | ✅ built | same shared keystore | ✅ works (fingerprints registered) |

Files (on the founder's Mac, under `~/Projects/Asktro/`):
- Customer AAB/APK: `apps/customer/build/app/outputs/...`
- Astrologer AAB: `apps/astrologer/build/app/outputs/bundle/release/app-release.aab`
- Astrologer APK: `apps/astrologer/build/app/outputs/flutter-apk/app-release.apk`

Both AAB + APK for **both** apps have already been sent to an experienced
developer who will handle the Play Console upload + listing forms.

## The signing keystore (critical shared state)

- One keystore signs **both** apps: `asktro-upload-key.jks` (on the Mac, NOT in
  git). Each app points at it via a git-ignored `android/key.properties`
  (astrologer's was `cp`-copied from the customer's this session).
- Key alias: `asktro`. SHA-256: `06:CD:B9:AD:1D:07:01:3D:F8:3A:15:A9:E5:AC:D9:9B:E9:E2:F2:E0:D5:1C:89:C3:C3:6B:E1:0B:B1:5D:70:38`.
  SHA-1: `45:6D:22:AE:82:66:0E:E8:51:B5:E4:BE:2B:E8:C7:B3:36:D5:C7:11`.
- Both fingerprints are registered in Firebase for **both** Android apps.
- ⚠️ Losing this file/password = can never update the apps on Play again.
  (Backup reminder is in POST_LAUNCH.md.)

## The one thing that must happen AFTER Play upload

When each AAB is uploaded, Play re-signs it with **Play App Signing** (a
different Google-managed key). That new SHA-256 (Play Console → App integrity →
App signing) must be added to Firebase for each app, or **phone login fails for
Play-store users** ("missing a valid app identifier / Play Integrity /
reCAPTCHA unsuccessful"). Sideload testing is unaffected. Full steps in
POST_LAUNCH.md (top section). This is the most likely "stuck during review"
support item.

## What this session did (for continuity)

- Fixed customer phone-login on the release build by registering the new
  keystore's SHA-1 + SHA-256 in Firebase (`in.asktro.customer`).
- Made the astrologer app Play-ready: shared the customer keystore via copied
  `key.properties`, built + verified a signed AAB + APK, registered its
  fingerprints in Firebase (`in.asktro.astrologer`).
- Expanded `docs/POST_LAUNCH.md`: Play App Signing SHA step, keystore backup
  warning, astrologer Play-readiness, `versionCode` bump rule, sideload
  uninstall gotcha, Node 20 → 22 runtime deprecation plan.
- Earlier in the session (see git log + prior summary): app-speed overhaul,
  chat unread-badge + high-priority push, purple Mall icon / removed Alerts tab,
  astrologer app cleanup, testimonial overflow fix, portal delete-astrologer.

## ⚠️ Post-approval fix batch — see `docs/POST_APPROVAL_FIXES.md`

The founder gave a refined list of 8 issues to fix as a **v1.0.1 update AFTER Play
approval** (developer is uploading the current 1.0.0 AAB for review; must NOT be
disturbed). Full diagnosis, per-issue file:line references, rebuild/backend/config
classification, batch decision (6 now, 2 deferred), reviewer test-login status,
and open confirmations all live in **`docs/POST_APPROVAL_FIXES.md`**. Read it
before doing any of this work. Nothing is built/deployed yet — awaiting the
founder's "go" after approval.

## Open items when we resume (none block launch)

- **Post-upload:** add Play App Signing SHA-256 to Firebase (both apps).
- **First week live:** App Check monitor→enforce (task #32); one live-money
  reconciliation test (#57); rotate admin password + portal MFA (#31).
- **Content:** finish real astrologer portraits, remove filler (#63).
- **Grow-into-it:** home rails→server (#47), search backend (#48), Gemini
  caching (#50), R8 shrinking, font bundling.
- **iOS (separate track):** Apple IAP decision for the AI astrologer (#55).
- **Housekeeping:** Node 20→22 bump, dep updates, strip dead Vastu code, 2px
  astrologer overflow (#30).

## Working notes (from CLAUDE.md — keep following)

- **One step at a time.** Give the founder a single command/action, then wait.
- Founder is non-technical — plain English, short answers, no walls of text.
- Deploy from the Mac using the service-account key (never `firebase login`);
  functions one at a time; new callables need a Cloud Run invoker grant.
- Branch for this work: `claude/asktro-session-handoff-o1ggo8`.
