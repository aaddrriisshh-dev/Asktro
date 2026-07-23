# Post-launch list (Asktro)

Everything here is **deliberately after the Play launch** — none of it blocks
submission. Grouped by when it matters. Created at handover (customer app AAB +
APK shipped, legal pages live, Razorpay live, rules deployed).

---

## ⚠️ DO THIS RIGHT AFTER UPLOADING EACH AAB TO PLAY (or phone login breaks)

Applies to **both** apps: `in.asktro.customer` **and** `in.asktro.astrologer`.

Both AABs are signed with our own upload keystore
(`asktro-upload-key.jks`, SHA-256 `06:CD:B9:AD:...:70:38`), and that
fingerprint is already registered in Firebase — so **sideloaded APK testing
works today.**

BUT: when you upload an AAB to Play, Google re-signs it with **Play App
Signing** (a different, Google-managed key). Firebase Phone Auth verifies the
*installed* signature, so the moment real users install from the Play Store,
their signature is the Play one — which Firebase doesn't know yet → login fails
with *"missing a valid app identifier / Play Integrity / reCAPTCHA
unsuccessful."*

**Fix (one time, per app, after first upload):**
1. Play Console → the app → **Test and release → App integrity → App signing**.
2. Copy the **App signing key certificate → SHA-256** fingerprint.
3. Firebase Console → Project Settings → Your apps → that Android app →
   **Add fingerprint** → paste → Save. (Add the SHA-1 there too if shown.)

No rebuild needed — it's a server-side config change, effective in ~1 minute.

---

## ⚠️ BACK UP THE SIGNING KEYSTORE — LOSING IT IS UNRECOVERABLE

The single most important file in this whole project is the upload keystore:

- **File:** `asktro-upload-key.jks`
- **Signs:** BOTH apps (`in.asktro.customer` + `in.asktro.astrologer`) — they
  share one keystore via each app's `android/key.properties` (git-ignored).
- **SHA-256:** `06:CD:B9:AD:...:70:38`

If this file **or** its password is ever lost, you can **never update either app
on the Play Store again** — you'd have to publish brand-new apps and lose all
your users, reviews, and ratings. Google cannot recover it for you.

**Do now (not later):**
1. Copy `asktro-upload-key.jks` to at least **two safe places** (password
   manager / encrypted cloud / a USB drive kept offline).
2. Write down the **store password, key password, and key alias (`asktro`)** and
   store them with it.
3. Never commit the `.jks` or `key.properties` to git (they're git-ignored —
   keep it that way).

---

## A. First launch week (do once you're live & stable)

- **App Check → enforce.** Currently in *monitor* mode (watching, not blocking).
  Watch the logs for a few days to confirm all real traffic passes, then flip to
  *enforce* in the Firebase console. Enforcing too early can lock out real users.
  Console toggle, no code. (task #32)
- **One authoritative live-money reconciliation test.** A real chat + a real call
  on live Razorpay, then verify the customer charge, astrologer earning, and
  commission all reconcile to the paise. (task #57)
- **Admin/security hardening:** rotate the admin password, scrub the old
  `Asktro@2026` secret from git history, add portal MFA. (task #31)

---

## B. Performance / cost fast-follows (normal app updates as you grow)

- **Bundle the app fonts.** Today fonts are fetched from Google's servers on
  first open (brief font "pop" on fresh installs / slow networks). Bundle the
  Poppins + Cormorant Garamond weights and set
  `GoogleFonts.config.allowRuntimeFetching = false`.
- **Home rails → server, bounded.** "Top Rated" / "Rising Stars" currently read
  100 astrologer docs each, live, on every home open, sorted client-side. Move to
  a server-side `where(active).orderBy(rating).limit(12)` (the composite index
  already exists in `firestore.indexes.json` — deploy it, then switch the query).
  Cheaper at scale **and** fixes a correctness bug once the directory passes 100
  astrologers. (tasks #47, #48)
- **Real search backend.** `search()` reads `limit(500).get()` and filters
  client-side; it silently can't find anyone past the first 500 once the
  directory grows. Needs a proper search (server prefix/tag queries or a search
  service) before the roster gets large. (task #48)
- **Gemini context caching per consultation** — cuts AI token cost on long AI
  chats. (task #50)
- **Re-enable R8 / resource shrinking** for a smaller download (~186 MB AAB →
  much smaller). Needs proper Firebase/Flutter/Agora keep-rules **and a real
  device smoke test** — it once crashed the release build, so do it carefully,
  never rushed into a release. Play already splits the download per-device
  (~50–70 MB), so this is polish, not urgent.
- **Pause the offscreen store "claims" marquee** when scrolled out of view
  (lazy-tabs already stops it running while off the Mall tab).

Already shipped this cycle (for reference): cached + downsized avatars, image
decode caps, ~4 MB asset diet, 1-sec splash, cheap Mall category strip,
lazy-mounted home tabs.

---

## C. iOS (separate track, whenever you tackle the App Store)

- **Apple IAP decision for the AI astrologer.** Apple requires In-App Purchase
  for digital content; the AI astrologer is the only thing that trips it (human
  consultations + physical Mall via Razorpay are allowed). Pick one at iOS time:
  add StoreKit IAP for wallet recharge, **or** hide/free the AI on iOS and sell
  only human + Mall via Razorpay. Does **not** affect the Android launch.
  (task #55)

---

## D. Housekeeping

- **Astrologer app** (`apps/astrologer`, id `in.asktro.astrologer`) is now
  **Play-ready**: it shares the customer app's upload keystore (via a copied
  `android/key.properties`), its release AAB + APK are signed with it, and both
  new fingerprints are registered in Firebase. It still needs its **own Play
  Console listing** (separate store page, screenshots, forms) — and the same
  post-upload App Signing SHA step above.
- **Each Play update needs a higher `versionCode`.** Play rejects an upload with
  a version code equal to or lower than one already uploaded. Bump the app
  version in `pubspec.yaml` before every new AAB.
- **Sideload testing gotcha:** when the signing key changes, a test phone must
  **uninstall the old app first** — Android blocks installing a differently
  signed build over an existing one ("App not installed"). Play updates are
  unaffected; this only bites manual APK testing.
- **Finish the astrologer roster** — wire the real portraits and remove any
  leftover filler astrologers before/at launch (task #63).
- **2px RenderFlex overflow** still to pinpoint in the astrologer app — cosmetic,
  not blocking (task #30).
- **Cloud Functions Node runtime.** Functions currently run on **Node 20**
  (`firebase/functions/package.json` → `"engines": { "node": "20" }`). Every
  deploy prints a warning that this runtime will eventually be **deprecated /
  decommissioned** by Firebase. It keeps working until the cutoff date — no rush
  — but before that date, bump to the next supported LTS (Node 22): change the
  `engines.node` value, run `npm install`, redeploy the functions one at a time,
  and smoke-test. Purely a runtime bump; no app-side change. Do it as a calm
  maintenance step, never rushed right before a launch.
- **Dependency updates** — ~70 packages are behind latest. A calm maintenance
  pass sometime (test thoroughly; several are Firebase majors).
- **Strip dead Vastu code** from the functions (Vastu was removed from the app).
