# Post-approval fix plan — Asktro v1.0.1 (MEMORY / HANDOFF)

_Read this first when resuming after Play approval. It captures the founder's
refined bug list, the diagnosis of each, what needs a rebuild vs a backend
deploy vs portal data, and the agreed sequencing. Nothing here has been built or
deployed yet — it is the plan to execute once the app is approved._

## Context & strategy (agreed with founder)

- The **AAB currently in Play review is version 1.0.0 (versionCode 1)** — the one
  built earlier this cycle, signed with the shared upload keystore
  (`asktro-upload-key.jks`, SHA-256 `06:CD:B9...:70:38`). Developer uploaded it
  for review. **Do NOT disturb it.**
- All fixes below are built **in the background** on our branch, committed, and
  kept ready. **Nothing that touches the live/in-review app gets deployed or
  uploaded until the founder is approved and says go.**
  - **App-screen (Flutter) fixes** → safe to build + commit + build a test APK/AAB
    anytime; they only reach anyone when we upload the new AAB. Zero review impact.
  - **Backend (Cloud Functions / Firestore rules) fixes** → writing/committing is
    safe, but **HOLD the deploy** until after approval (a deploy goes live
    instantly and could disturb the reviewer). Only deploy backward-compatible
    changes early, and only with founder's ok.
- The fix batch ships as **v1.0.1 (versionCode 2)** — must bump
  `apps/customer/pubspec.yaml` `version: 1.0.0+1` → `1.0.1+2` before building the
  update AAB (Play rejects an equal/lower versionCode).
- On approval day: developer uploads the v1.0.1 AAB **and** we deploy the held
  backend changes → all fixes go live together.

### Batch decision
- **In v1.0.1 (the 6 smaller ones):** #1, #3, #4, #5, #7, #8.
- **Deferred to a later, larger update:** #2 (full app localization) and #6
  (two-wallet system). Both are weeks of work.
- ⚠️ Founder had NOT yet said the final "go" to start coding at the time this doc
  was written — he asked for this memory doc first. Confirm the go-ahead (and the
  open questions at the bottom) before writing code.

---

## The 8 issues (founder's own words + technical diagnosis)

### 1. Mall — "View Cart" affordance after Add to Cart
**Founder:** The cart count only shows on the top-right cart icon, which isn't
always visible. When a user taps **Add to Cart**, show a **"View Cart"** option
right there that takes them to the cart.
**Diagnosis:** Pure client UI. Add-to-cart paths all call
`cartProvider.notifier.add(p)` — `all_products_screen.dart:79`,
`store_category_screen.dart:55`, `store_search_screen.dart:141`,
`store_home_screen.dart:113`, `product_detail_screen.dart:61`. Detail sticky bar
only adds/jumps, never a clear "view cart" CTA (`product_detail_screen.dart:449-457`).
Cart route is `/store/cart`.
**Fix:** After add, surface a "View Cart" action (snackbar-with-action, or a
button that appears near Add to Cart) → `context.push('/store/cart')`.
**Class: CLIENT → REBUILD. Size: SMALL.**
**Open Q:** snackbar "Added ✓ · VIEW CART" vs a persistent inline button? (founder
leaned toward a visible button beneath Add to Cart).

### 2. Language switching does nothing  — DEFERRED
**Founder Qs:** Is it hard? Do it now? Auto-reflect on AAB?
**Diagnosis:** The picker is cosmetic. No i18n at all: no `flutter_localizations`,
no `.arb`/l10n, `MaterialApp.router` has no `locale`/`localizationsDelegates`/
`supportedLocales` (`app/app.dart:14-21`); `appLanguageProvider`
(`app/providers.dart:41`) is written only in `settings/language_sheet.dart:40-52`
and consumed nowhere. All UI strings are hardcoded English.
**Answers given:** Hardest item. Does NOT auto-reflect — needs a rebuild AND every
string translated by hand into each language. Recommended **defer** (reviewers
don't need it).
**Class: CLIENT → REBUILD, big + manual translation content. Size: DEEP. DEFER.**
**v1 REMOVED (restore when this ships):** the non-working **language globe** in the
home top bar was removed (`home_feed.dart`, was `_iconCircle(Icons.language_rounded,
… showLanguageSheet)`), and the **onboarding "Your languages" step** was reduced to
**English only** (`profile_setup_screen.dart` `_languageStep` `langs` list). When the
real localization lands, restore the globe + the full language list.

### 3. Home "Continue reading" card shows astrologer online when they're offline
**Founder:** e.g. Guruji Malik — the home continue-reading card always shows the
astrologer online (green). Only after tapping in + tapping chat does it say
offline. The **home card itself** should immediately show a grey/offline icon
when the astrologer is actually unavailable. (This targets **human** astrologers
who mark themselves unavailable — AI personas are always-available by design.)
**Diagnosis:** `isOnline` getter is `onlineStatus || isAI`
(`packages/shared_flutter/lib/src/models/astrologer.dart:90`). Home continue rail
(`apps/customer/lib/features/home/home_continue_rail.dart`) reads denormalized
data and does not reflect live availability with a grey/offline state. For humans,
real availability is `onlineStatus && available` (`astrologer.dart:92-98`).
**Fix:** Show a grey/offline indicator on the continue-reading card based on the
astrologer's real current status (needs the card to read live presence for that
astrologer, or a denormalized availability flag kept fresh).
**Class: CLIENT → REBUILD. Size: SMALL–MEDIUM.**
**Open Q:** confirm AI personas keep showing "online" (always available) — fix is
for humans only.

### 4. Blog share has no link — should open the blog inside the app
**Founder:** Sharing a blog to WhatsApp sends only title + description + "Read more
on Asktro" with **no link**. It should include a link that opens the blog **inside
the app**.
**Diagnosis:** `blogs.dart:428-431` shares text with no URL. `Blog` model has `id`
but no slug/url (`blogs.dart:13-52`). No deep-link/app-link handling exists.
**Fix:** Add a real URL to the share text (e.g. `https://asktro.in/blog/{id}`) +
Android **App Links** intent filter so tapping opens the app if installed (web
fallback otherwise) + an in-app route to open that blog. NOTE: Firebase Dynamic
Links is shut down — use a plain web URL + App Links, plus a small web landing
page at `asktro.in/blog/{id}`.
**Class: CLIENT → REBUILD, + a small web page. Size: MEDIUM.**

### 5. Coupon must persist until the recharge actually completes
**Founder:** We push a coupon → user taps it → lands on recharge screen → but
leaves WITHOUT completing the recharge. Right now the coupon is then gone / can't
be reused. It should stay available and reusable until a recharge is **actually
completed successfully**; only then does it vanish.
**Diagnosis:** Coupon is being treated as consumed too early (on open/apply, not on
successful payment). Relevant: `recharge_screen.dart:336` auto-reapplies on
amount change; `:117` shows the generic failure message; `validateCoupon.ts` is
rate-limited (20/hr, `rateLimit.ts:46`); reward/consumption around
`creditRecharge.ts:85-87` and a coupon `applied/` subcollection.
**MUST VERIFY where the coupon gets marked "used"/removed** (server `applied/`
doc, usage decrement, or a client-side hide). That determines rebuild vs not.
**Fix:** Only mark a coupon consumed on **successful `creditRecharge`**, not on
open/apply. Keep it visible/reusable until then.
**Class: LIKELY BACKEND-ONLY → possibly NO REBUILD (confirm). Size: SMALL–MEDIUM.**

### 6. Two wallets: Consultation wallet + Shopping wallet — DEFERRED
**Founder:** Split the single wallet into two:
- **Consultation wallet:** funded by recharge offers/bonuses; usable **only** for
  consultations.
- **Shopping wallet:** funded via **Razorpay** (real money); used for buying
  products and paid downloads (e.g. paid Kundli PDF). Users can top it up. Shown
  separately.
- Loyalty points = future.
Products currently go straight to Razorpay (founder confirms that's correct; users
should NOT pay for products from the consultation wallet).
**Diagnosis:** Today there is one `walletBalance`; Mall is Razorpay-only by design
(`store.ts:12-15`, `store.ts:206-212`, `confirmStoreOrderPaid` `store.ts:280-344`
never touches wallet). A two-wallet model is a **major new system**: new balances,
ledgers, top-up flow, product/download debit from shopping wallet, migration.
**Class: CLIENT + BACKEND → REBUILD, large. Size: DEEP. DEFER (post-launch).**
Interacts with #8 (referral ₹20 → consultation wallet).

### 7. Consultation history grouped by astrologer (one card per astrologer)
**Founder:** Each ended consultation currently creates a **separate** home-screen
card. Talk to ABC astrologer 3 times → 3 cards. Want: **one card per astrologer**
on the home screen; tapping it opens a view listing **all past sessions with that
astrologer**, each with date/time stamp, so the user can revisit any.
**Diagnosis:** `consultations_tab.dart:9-20` `_historyProvider` maps one tile per
`consultations` doc; `:52-57` renders one tile per doc; `:79-94` opens a single
`ChatConsultationScreen(consultationId: c.id)`. No grouping by `astrologerId`
(which exists on every doc). Home continue rail is likewise per-consultation.
**Fix:** Group by `astrologerId` (one entry = latest/most-relevant session per
astrologer) + a new per-astrologer history screen listing all their sessions with
timestamps. Data model already supports it — UI/aggregation change, no schema
change.
**Class: CLIENT → REBUILD (+ new screen). Size: MEDIUM.**

### 8. Referral: ₹20 credit + working code + real download link
**Founder:** Friend installs via the shared link → recharges using the code → ₹20
credited to **both** people's **consultation wallets**. The download link is a
placeholder now (`asktro.app`); after approval use the real Play Store link.
**Diagnosis:** Three compounding problems:
- No UI to **enter** a referral code — `profile_setup_screen.dart` declares
  `_referral` (`:35`, disposed `:56`, read `:104`) but renders no field and has no
  wizard step (`:159-180`).
- `referredBy` is **stripped** before every profile write
  (`repositories.dart:152-164`, `:201`, `:235`) and there is no server path that
  accepts it (`onUserCreate.ts:32` generates `referralCode` but never stores a
  submitted `referredBy`).
- The credit logic is correct but never fires: gated on `user.referredBy`
  (`creditRecharge.ts:85-87`) which is always absent; rewards are
  `REFERRER_REWARD_PAISE`/`REFERRED_REWARD_PAISE = 2000` in
  `referral.ts:13-14`, applied by `applyReferralCredit` (`referral.ts:63-134`).
- Download link hardcoded placeholder: `profile_tab.dart:26-28`
  (`_kAppDownloadLink = 'https://asktro.app'`), shared at `:306-309`, `:362`.
**Fix:** (a) referral-code input step in onboarding wiring `_referral.text` into
the buffer; (b) a trusted server path to validate + persist `referredBy` (callable
or `onCustomerSignup`), since the client is correctly forbidden from writing it;
(c) credit ₹20 to both on first successful recharge (logic already exists once
`referredBy` is stored); (d) make the download link **swappable without a
rebuild** (Remote Config) so the real Play link can be set post-approval.
**Class: CLIENT + BACKEND → REBUILD (link can be no-rebuild via Remote Config).
Size: MEDIUM–DEEP.** Note: "to consultation wallet" ties into #6; until two wallets
exist it credits the single `walletBalance`.

---

## Also noted (portal/config — founder can do these himself, NOT in the code batch)

From the earlier full 20-item investigation, these are data/config, no code:
- **"abc" junk category** in Mall → delete/deactivate that `storeCategories` doc in
  the portal.
- **"About ASKTRO" blank** → the `cms/about` doc was never seeded; publish it from
  the portal (or add `about` to `firebase/functions/scripts/seed_legal.mjs`).
- **Daily Horoscope + Kundli Match "not working"** → need **ProKerala API
  credentials** set (`PROKERALA_CLIENT_ID` / `PROKERALA_CLIENT_SECRET` secrets);
  code is wired correctly. Kundli Match is also a paid ₹49 wallet flow.
- **Welcome reply missing for some astrologers** → those persona docs aren't
  flagged `isAI: true` (gate at `replyEngine.ts:447,450`).
- **Voice/Video "missing for most astrologers"** → roster is almost all AI personas
  (chat-only by design); calls only show for online human astrologers. Product/data
  decision, not a bug.
- **"User not available" on chat / voice too quiet** → the voice-too-quiet one is a
  QUICK client tweak (defaults to earpiece, `call_engine.dart:47,67`); "user not
  available" is usually the block-guard copy (`moderation.ts:41`).

---

## Reviewer test-login status (Play "App access" requirement)

- **DONE:** Firebase test phone number added — `+918318259972` with fixed code
  `123456` (Authentication → Sign-in → Phone → "Phone numbers for testing"). No SMS
  sent, bypasses reCAPTCHA/Play Integrity, works on the submitted AAB, no rebuild.
- **Founder still to do:** put these two lines into **Play Console → App content →
  App access** so the reviewer can log in: phone `+918318259972`, OTP `123456`.
- **Optional (not done):** pre-seed that account with sample data so the reviewer
  lands on a populated app instead of the fresh onboarding flow. Not required for
  review; nice-to-have.
- To disable later: remove the number from the Firebase test-numbers list.

## Open confirmations to get before coding
1. Final "go" to start the v1.0.1 batch.
2. #1 UX: snackbar-with-action vs persistent inline "View Cart" button.
3. #3: confirm AI personas stay always-online; offline fix is for humans only.
4. #5: verify where the coupon is marked consumed (decides rebuild vs backend-only).
5. Confirm #2 (language) and #6 (two-wallet) stay deferred.
