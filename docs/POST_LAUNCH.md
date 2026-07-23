# Post-launch list (Asktro)

Everything here is **deliberately after the Play launch** — none of it blocks
submission. Grouped by when it matters. Created at handover (customer app AAB +
APK shipped, legal pages live, Razorpay live, rules deployed).

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

- **Astrologer app** is a separate app (`apps/astrologer`, id
  `in.asktro.astrologer`). If it goes on Play it needs its own keystore + Play
  listing. For now it's distributed as a direct APK.
- **Dependency updates** — ~70 packages are behind latest. A calm maintenance
  pass sometime (test thoroughly; several are Firebase majors).
- **Strip dead Vastu code** from the functions (Vastu was removed from the app).
