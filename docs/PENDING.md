# ASKTRO — Living TODO & Handoff Tracker

**Purpose:** the single running list of everything left to do, everything **you**
need to do from your end (accounts, keys, deploys, launch prep), and notes to
revisit later. This file is kept up to date as we build. When something is done,
it moves to the "Done" section with a strikethrough or gets checked off.

_Last updated: 2026-07-04_

---

## ▶️ RESUME HERE (next session — 2026-07-04 EOD)

**Deploy state:**
- ✅ All Cloud Functions deployed (incl. new: createAdmin, setAdminRole, removeAdmin, listAdmins;
  changed: createAstrologer, updateAstrologer, setAstrologerStatus, sendBroadcast).
- ✅ Firestore rules deployed (pricing now super-only).
- ⏳ **Admin portal NOT yet deployed** — this is the next step.
- ❓ Invoker permission on the 4 new callables: **verify by testing** the Admin Management page after the
  portal is up. If it errors with permission-denied, grant `allUsers` Cloud Run Invoker on those 4 services.

**Decision — host the admin portal on VERCEL** (user has Vercel Pro; cheaper/flat vs Firebase Hosting
which would need Cloud Run for the dynamic `[id]` routes). Setup (first-time, via vercel.com/new):
1. Import repo `aaddrriisshh-dev/Asktro`, set **Root Directory = `apps/admin`**.
2. Add env vars: the `NEXT_PUBLIC_FIREBASE_*` values (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId) from Firebase console → Project settings → web app config. Plus optionally
   `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION=asia-south1`.
3. Deploy → then log in to test roles.

**Test accounts** (all password `Asktro@2026`, no emails sent): adrish@ / vineet@ / sanjay@ (Super),
sachendra@ (Ops), neeraj@ (Astrology) — all @asktro.in.

**Then: apps next.** User has NO keys yet (Agora / AI / Prokerala). Plan: build no-key app features
(in-app banner display, coupon redemption, notification images) + scaffold voice/video (Agora) and AI
chat (Claude/OpenAI + Prokerala) so they light up when keys arrive. NOTE: Flutter can't be compiled in the
build env — write Dart carefully against existing patterns; user verifies on next app build.

---

## 🔴 YOUR ACTION ITEMS (operational — you do these, no coding)

### ⚡ Deploy the wiring-audit fixes
1. ~~**Deploy the new support trigger**~~ ✅ **Done (2026-07-04)** — `onSupportTicketCreated` is live
   in `asia-south1` (Firestore document-created trigger). New tickets now auto-get a copyable
   `ASK-TKT-000123` number, the raiser's name, role, and the mirrored message.
   - *First-ever 2nd-gen/Eventarc trigger for this project* required a one-time IAM setup: the deploy
     service account (`firebase-adminsdk-fbsvc@…`) was granted **Project IAM Admin** so Firebase could
     add the Eventarc/Pub/Sub service-agent bindings itself. Expect the usual `409 already exists` →
     `unable to queue` convergence stutter on the first deploy — it settles; verify with
     `firebase functions:list`.
2. **Rebuild the two Flutter apps** whenever you next make a build — the customer app now shows
   copyable ticket numbers, and the astrologer app now writes its name onto payout requests.
   (No rush; the admin-side reads already fall back gracefully until then.)


### Payments — dummy gateway → real Razorpay
Right now recharges are driven by a **dummy gateway** (the 🧪 Test Recharge panel
on the admin dashboard → `devSimulateRecharge`). It writes REAL ledger entries so
all analytics work, but no real money moves. Before launch:
- [ ] Get **real Razorpay keys** (Key ID, Key Secret, Webhook Secret) from the Razorpay dashboard.
- [ ] Replace the **placeholder** secret values (currently set to `placeholder`):
      `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
      → `firebase functions:secrets:set <NAME> --project asktro-tech-provate-limited`
- [ ] Deploy the real recharge/webhook functions (`recharge`, `razorpayWebhook`, `creditRecharge`).
- [ ] Paste the deployed **`razorpayWebhook` URL** into Razorpay → enable the `payment.captured` event.
- [ ] Once real payments work, **remove or lock down** the dummy gateway (see launch checklist).

### Voice / Video (Agora) — when we build it
- [ ] Replace placeholder Agora secrets with real ones: `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`.
      (The token-minting function already exists; the apps don't call it yet.)

### AI chat + Vedic astrology — keys needed to make AI astrologers respond
The 51 AI astrologers are seeded and browsable, but they can't *reply* until this is wired.
- [ ] **AI provider key** — Claude (Anthropic) or OpenAI, for the conversational replies.
- [ ] **Prokerala API key** (Vedic astrology) — Kundli/Nakshatra/Dasha etc.
      Both keys will be stored as Cloud Functions secrets and called **server-side** (never in the app).

### Security hardening (before public launch)
- [ ] Enable **Firebase App Check** (Functions console showed a "Configure App Check" banner).
      This is the real network-layer hardening — it ensures calls come from *your* apps,
      not scripts hitting the public function URLs. (The `allUsers` invoker permission on the
      Cloud Run services is CORRECT and stays — auth is enforced inside each function via the
      `role: 'admin'` check. See note in "Decisions" below.)
- [ ] Set a **billing budget alert** in Google Cloud Billing (e.g. ₹500/mo) so there are no surprises.

### Runtime upkeep (deadline: before 2026-10-30)
- [ ] Node.js 20 runtime is **deprecated** (decommissioned 2026-10-30). Upgrade
      `firebase/functions` to Node 22 (`package.json` → `"engines": { "node": "22" }`) and
      `npm install --save firebase-functions@latest` (note: has breaking changes — test after).

### Launch cleanup (do right before going live)
- [ ] Wipe all dummy/test data: `cd firebase/functions && node scripts/seed_dummy.mjs --clear`
- [ ] Remove or gate the **Test Recharge** dummy gateway so it can't run in production:
      either delete `devSimulateRecharge` + the `<TestRecharge>` panel, or gate it behind a
      config flag. (It's admin-only, so not a data risk, but it must not mint fake recharges live.)
- [ ] Commit the native `android/` & `ios/` project files (see Reproducibility risk below).

---

## 🟡 DEPLOY PLAYBOOK (how to deploy Cloud Functions — lessons learned)

We deploy without `firebase login` using the service-account key. From the repo root:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/firebase/functions/serviceAccountKey.json"
PID=$(node -e "console.log(require('./firebase/functions/serviceAccountKey.json').project_id)")
firebase deploy --only functions:<name1>,functions:<name2> --project "$PID"
```

Gotchas we hit (so future deploys are smooth):
1. **Billing must be open** — project is on Blaze; a ₹1,000 prepaid balance was added to activate it.
2. **Service account needs roles**: the `firebase-adminsdk-fbsvc@…` SA was granted **Editor** +
   **Service Account User** (for deploys). Don't remove these.
3. **Secrets must exist AND have a value/version** before deploy, or you get
   "no latest version of the secret". Set each with `firebase functions:secrets:set`.
4. **First deploy of a new function** often errors `409 already exists` then `unable to queue` —
   this is Google's list lagging. The function IS created; just wait ~60s and re-run; it flips to
   an update and finishes. Don't panic-retry in a tight loop.
5. **New callable functions need public-invoke**: grant `allUsers` the **Cloud Run Invoker** role
   on the new service (Cloud Run → Services → tick service → Permission → add `allUsers`).
   The CLI does this automatically on a clean deploy, but skips it when the deploy errors early.

---

## 📌 DECISIONS (2026-07-04, from handwritten menu spec + screenshots)

- **Pricing model = per-astrologer.** Each astrologer sets their OWN ₹/min AND commission % at
  onboarding (kept from Part A). Global `config/global` price is only the fallback default.
- **AI astrologers (the 51 seeded): ₹9/min, 35% commission — permanent.** (`seed_ai_astrologers.mjs`
  updated; re-run the seed to apply to the existing 51.)
- **Design language: keep the existing celestial portal look** (violet + gold) for all new admin
  screens — the Add-astrologer form and astrologer View page match the *structure* of the reference
  screenshots but are rendered in our portal's design system, not the reference's orange/white style.
- **Admin roles (page ⑪):** 3 Super Admins (Adrish, Vineet, Sanjay = full) · Chief Ops (Sachendra =
  all except Total Revenue + Money-held-&-owed) · Chief Astrology (Meeraj = astrology only).
- **Action attribution everywhere:** every admin action carries the acting admin's name, shown inline
  (e.g. astrologer "Added by X · Approved by Y") and visible to all admins — approval is super-admin-only.

## 🟢 DONE — Admin roles & attribution foundation (RBAC)

- **Three admin tiers** on the `adminRole` claim: `super` (full) · `ops` (Chief Operations) ·
  `astrology` (Chief Astrology). Backend `admin/admins.ts`: `createAdmin`, `setAdminRole`,
  `removeAdmin`, `listAdmins` (all super-only except read). Actions write audit rows with `actorName`.
- **Admin Management page** (`/admins`, super-only) — roster grouped by role, add admin (creates login +
  shows temp password), change role, remove. In the celestial portal design.
- **Role-aware sidebar** — `lib/roles.ts` maps each role to visible routes; the sidebar filters itself and
  the layout redirects an admin away from any route their role can't open. Footer shows the role label.
- **Bootstrap** — `set_admin.mjs` now also writes the `adminUsers` profile (name/email/role) so the
  roster and attribution have a real name.

**⏳ To activate:** deploy 4 new callables (`createAdmin`, `setAdminRole`, `removeAdmin`, `listAdmins`)
— new callables need the `allUsers` Cloud Run Invoker grant; re-run `set_admin.mjs <you> "Adrish"` to
write your profile; then add Vineet & Sanjay from the Admin Management page. Redeploy the admin portal.

## 🟢 DONE — Astrologer Management (screenshots) + Audit Log + attribution

- **Add astrologer** redesigned as a modal matching the reference (photo · name · phone · email ·
  experience · ₹/min · commission · bio · expertise + language chips · AI toggle), in the celestial design.
- **Astrologer View page** (`/astrologers/[id]`) — profile card, stat tiles (calls/video/earnings/rating),
  Audio/Video/All-session tabs — matches the reference.
- **Approval flow + attribution:** Ops/Astrology/Super can onboard; a non-super add starts **pending**;
  **only a Super approves/rejects**. Records **Added by / Approved by** (shown in the table & view).
- **Audit Log** upgraded — live, searchable, colour-coded, shows the acting admin's name.

### ⏳ ACTIVATION CHECKLIST for the whole roles/astrologer batch (deploy when ready)
1. Deploy new callables (need `allUsers` invoker grant): `createAdmin`, `setAdminRole`, `removeAdmin`, `listAdmins`.
2. Redeploy modified callables: `createAstrologer`, `updateAstrologer`, `setAstrologerStatus`.
3. `node scripts/set_admin.mjs <your-email> "Adrish"` → registers your super-admin profile.
4. Redeploy the admin portal, sign out/in, then add **Vineet & Sanjay** from **Admin Management**.

### ✅ Role permissions FINALIZED (2026-07-04)
- **Super (Adrish, Vineet, Sanjay):** full access. **3 dummy accounts created** via `seed_admins.mjs`
  (`adrish@asktro.in` / `vineet@asktro.in` / `sanjay@asktro.in`, password `Asktro@2026`, no emails sent).
- **Chief Operations (Sachendra):** everything **except** — Dashboard hides Total Revenue, Revenue-trend,
  Money-held-&-owed and Test Recharge; **Pricing & Settings is view-only** (fields disabled, Save hidden;
  Firestore rules block non-super config writes); **Payouts view-only** (can't process); no Admin page.
- **Chief Astrology (Neeraj):** full astrologer world — onboarding, editing, **auditing session
  transcripts** — plus Audit Log; **Payouts view-only**. Approve/Reject stays **Super-only**. Everything
  else hidden.
  - When Phone/Video Session consoles are built, add them to Neeraj's routes (for transcript auditing).

## 🟢 DONE — Publishing modules (Commit & Push family)
- **Push Notifications** — audience All/Paid/Unpaid/Astrologers, title, description, deep link, image
  (Banner/Portrait), Commit & Push. `sendBroadcast` gained paid/unpaid segments + image + audit-with-name;
  FCM carries the image.
- **Banners** — placement Home/Consults/Wallet/Alerts/Profile, image, deep link, Commit & Push, added-by.
- **Coupons** — audience (All/Unpaid/Paid), amount + bonus to wallet, expiry, image, auto-generated code,
  Commit & Push, added-by.
- `auth-context` now exposes the acting admin's **name** so client-side actions attribute too.

## 🟢 DONE — Reports (#10)
Comprehensive: date-range filter, 8 KPI tiles (gross/net revenue, recharges, consultations, minutes,
new users, refunds, payouts), revenue + consultations-by-type charts, and **CSV + Excel** exports for 8
datasets (new users, consultations, wallet ledger, payouts, all users, astrologers, coupons, support).

## 🔵 REMAINING MENU WORK (lower priority / dependent)
- **Phone / Video Sessions (#4, #5)** — structurally ready; empty until Agora voice/video calling ships.
- **Customer Management (#2)** — exists as the Users activity table; could add the Live/All + Paid/Unpaid
  tab split from the spec.
- **Phone Sessions (#4) & Video Sessions (#5)** — new consoles; structurally ready but **empty until
  voice/video calling ships** (Agora). Build alongside the calling phase.
- **Banners / Coupons / Push / Reports** — pages already exist; can be polished to fully match the
  Commit-&-Push spec + audience/placement targeting when you want.
- **Dashboard revenue-hiding for Ops** — pending the ❓ answers above.

## 🔵 NEXT BUILD QUEUE — the left-panel menu (from the 12-section spec)
The admin portal sidebar, in order: 1 Dashboard ✓ · 2 Customer Management · 3 Astrologer Management
(Add form + View page per screenshots + attribution/approval) · 4 Phone Sessions · 5 Video Sessions ·
6 Recharge Plans ✓ · 7 Banners · 8 Coupons · 9 Push Notifications · 10 Reports (Claude to spec) ·
11 CMS · 12 Audit Log · + Admin Management (RBAC + 3 super-admin logins). Sections 7/8/9/11 share one
**Commit-&-Push publishing engine** (compose → target → push → live in app).

---

## 🟢 DONE (recent — Part D: portal history + astrologer approval)

- **Full consultation history (Item 6)** — the customer detail page now shows a **unified timeline of
  every session** (chat/voice/video), newest first, each expandable in place. Chat sessions expand to the
  **full live transcript**; voice/video show a recording placeholder ("appears once calling is enabled").
  Replaces the old "latest session only" chat log + separate call tables. Added an **Account Snapshot**
  card (wallet, bonus, recharged, spent, sessions).
- **Astrologer approval (Item 1)** — admin Astrologers page gained a **Reject** button (pending
  applications) and a **"N onboarding requests awaiting review"** banner at the top. Approve/Suspend/Reject
  all wired to `setAstrologerStatus`.
- **DECISION (2026-07-04): astrologers are admin-created only — NO self-signup.** Profiles are created
  from the dashboard "Add astrologer" form; astrologers do not apply from their app. Item 1 is therefore
  **complete** (create + Approve/Reject/pending-review). Do not build an astrologer-app application form.

**⏳ To activate (your end):** redeploy the admin portal (no new functions needed for D).

---

## 🟢 DONE (recent — Part C: 51 AI astrologers)

- **`isAI` flag** on the astrologer model + a deliberately **understated "✦ AI" tag** on the card and
  profile (low-contrast, so a profile reads as a real astrologer at a glance while still disclosing AI).
- **Seed script `scripts/seed_ai_astrologers.mjs`** — creates **51 AI astrologers**: mixed male/female
  Indian names (with honorifics like Acharya/Pandit/Guru), portrait photos, 2–4 specialties (Vedic,
  Numerology, Tarot, Palmistry, Vastu, KP, Nadi…), Asktro-verified, varied per-minute prices (₹9–₹40 so
  per-astrologer pricing shows), realistic ratings/experience, `commissionPercent: 100` (no payout
  accrues for AI). Tagged `__seedAI: true` → `--clear` removes only these.
- **Admin** — Add-astrologer form gained an **AI checkbox** + **photo URL**; table shows an **AI** marker.
  `createAstrologer`/`updateAstrologer` accept `isAI` + `profilePhoto`.

**⚠️ Before launch:** the seeded photos are randomuser.me **placeholders** — swap `profilePhoto` on
`isAI==true` docs for real AI-generated Indian astrologer images.
**Note:** these AI personas are *listed & browsable* now; the actual AI chat auto-replies are the separate
Conversational-AI integration (still pending — a customer starting a chat with an AI persona won't get an
automated reply until that's wired).

**⏳ To activate (your end):** run the seed script once, redeploy `createAstrologer` + `updateAstrologer`,
redeploy the admin portal, rebuild the customer app.

---

## 🟢 DONE (recent — Part A: per-astrologer pricing & commission)

- **Per-astrologer rate (Items 5, 7)** — each astrologer now carries their own `ratePerMinutePaise`.
  `createConsultation` snapshots **that astrologer's** rate onto the session (falls back to the global
  `config/global` price if unset). The customer app shows the real per-astrologer price on the
  directory card **and** the profile (was hardcoded ₹9/min).
- **Per-astrologer commission (Item 8)** — each astrologer carries `commissionPercent`; it's snapshotted
  onto the session at start and used by `endConsultation` to split earnings (falls back to global).
  Snapshotting means a later admin change never re-rates an in-progress call — it applies to the next one.
- **Set at onboarding + editable (Item 8 "live change")** — the admin **Add astrologer** form now takes
  price/min and commission, and routes through the `createAstrologer` function so the astrologer gets a
  **real login + role claim** (the old form wrote a doc that could never sign in). Each row has an
  **Edit rate** action (updates rate/commission live via `updateAstrologer`), and the table shows both.

**⏳ To activate (your end):** redeploy 4 functions (`createConsultation`, `endConsultation`,
`createAstrologer`, `updateAstrologer`), redeploy the admin portal, and rebuild the customer app.

---

## 🟢 DONE (recent — Part B: customer-journey economics)

The three billing-side items from the handwritten roadmap:
- **Free first minutes (Item 2)** — new customers get `freeChatMinutes` (default **3**) of chat as
  bonus credit at signup (in `onCustomerSignup`), so a brand-new user can start their first chat with
  zero recharge. Logged to the wallet ledger. *(Countdown timer + live deduction were already done.)*
- **Low-balance popup at ~1 min (Item 3)** — default warning moved 2 min → **~1 min**
  (`warnLevel1Sec` 120→60). Chat only for now (voice/video await the calling phase).
- **1-minute grace bonus (Item 4)** — when a live session's balance hits zero, the billing tick gifts a
  one-time **grace minute** (`graceMinutes`, default 1) and keeps the session active instead of pausing;
  the app shows a celebratory popup ("1 extra minute added to your wallet"). Tracked via `graceGranted`
  on the consultation doc.
- All four values (**free minutes, grace minutes, low-balance & final warning thresholds**) are now
  **live-editable** in the admin **Pricing & Settings** page and read from `config/global` at billing time.

**⏳ To activate (your end):** redeploy 2 functions (`tickConsultation`, `onCustomerSignup`), redeploy the
admin portal for the new Pricing fields, and rebuild the Flutter apps for the grace popup + free-minutes UX.

---

## 🟢 DONE (recent — deep wiring audit + fixes)

Full app↔backend↔portal audit run. **Verified real & correctly wired:** chat consultations,
chat transcripts (message shape `senderId/type/text/image/timestamp` matches exactly), successful
recharges (real ledger), and all revenue/user/consultation/chat-minute metrics. **Fixed the gaps
the audit found:**

- **Support message no longer lost** — the customer app writes the ticket text to `body`; the admin
  console read only `message` and showed blank. Console now reads `message ?? body`, and a new
  server trigger mirrors `body → message` on every new ticket. (`SupportTicketsCard.tsx`, `support/page.tsx`.)
- **Ticket numbers + names now generated** — new Firestore trigger `onSupportTicketCreated` stamps a
  copyable `ASK-TKT-000123` (atomic counter), the raiser's `userName` (from users/astrologers), and
  `role` on every ticket — works for both apps, no rebuild needed. (`admin/supportTrigger.ts`.)
  ⏳ **Needs deploy** (see action item above).
- **Customer can copy their ticket number** — Help & Support screen now lists "Your tickets" with the
  number, a copy button and live status. (`support_screen.dart`.) Takes effect on next app build.
- **Payout name fixed** — astrologer app now writes `astrologerName` onto payout requests, so the admin
  console shows a name, not an id. (`earnings_tab.dart`.) Takes effect on next app build.

### Known-empty until their features ship (not bugs)
- **Voice / Video** are stubs (Agora commented out; app shows "coming soon"). No `type:'voice'/'video'`
  consultation docs are ever created, so the portal's voice/video minute columns, Voice/Video active
  metrics, and Voice/Video Call History are **structurally correct but will stay empty** until the
  calls phase is built. Backend (`createConsultation`, `generateAgoraToken`) is ready and waiting.
- **Failed / pending payments** are **not recorded anywhere** — only successful recharges hit the ledger,
  so payment drop-off is invisible. If you want funnel visibility, we'd add a `paymentAttempts` record
  (write on initiate, update on success/failure). **Product decision for you** — flag it and I'll build it.

---

## 🟢 DONE (earlier — admin dashboard & consoles)

- **Dashboard home** — 10 live, backend-wired cards (Revenue, Registered Users, Active
  Consultations, First-Recharge Conversion, Active/Total Astrologers, Paid/Unpaid Users,
  Support Tickets, Payout). Each: compact card → analytics drawer with date/time filter
  (incl. All Time), colored metric chips, chart/breakdown. Full-width responsive grid.
- **Support console** — live summary chips + clickable **User Tickets** / **Astrologer Tickets**
  cards → centered popup → read message, **reply**, **close/reopen**. Backend deployed
  (`replySupportTicket`, `closeSupportTicket`, `reopenSupportTicket`).
- **Payout console** — live money chips + clickable **Pending** / **Paid** cards → centered popup →
  **Approve / Mark paid / Reject**. Backend `processPayout` deployed + invoker granted.
- **Dummy gateway** — `devSimulateRecharge` + Test Recharge panel; writes real ledger entries with
  live timestamps so Revenue/Paid-Users/Conversion update end-to-end. Deployed.
- **Fix** — `firstRechargeAt` now stamped on first real recharge (so Conversion works with live data).
- Seed script `firebase/functions/scripts/seed_dummy.mjs` (all collections; `--clear` to wipe).

---

## 🔵 REMAINING CODE WORK (prioritized)

### App-side flows (Flutter) — the other half of what we built in admin
1. ~~**Customer support ticket submission** + ticket number + copy button~~ ✅ **Done** — ticket number
   generated server-side, shown with a copy button in the app.
2. ~~**Astrologer payout request** writes `astrologerName`~~ ✅ **Done** — payout write now includes the name.

### Admin portal
3. **Astrologers page** — wire the existing `createAstrologer` / `updateAstrologer` /
   `deleteAstrologer` functions into the UI (Add / Edit / Delete / Approve-Reject buttons).
4. **Section below the dashboard cards** — TBD (you're going to describe what goes here).
5. Same live-update / popup polish is now consistent across Support & Payout; apply to any
   future interactive cards.

### Integrations to wire when APIs are ready
- **Vedic astrology API (Prokerala)** — the customer detail page has a **"Kundli & Planetary Details — Coming soon"** section. Wire Nakshatra / Moon sign / Ascendant / Dasha from the birth details (name, DOB, time, place already captured) once the API key is in.
- **Conversational AI (Claude / OpenAI)** for AI-astrologer chats, layered with the Vedic API. Astrologer listings will mix **AI astrologers** and **real astrologers**; the customer picks and chat routes accordingly.
- Deploy `setUserStatus` (already written) + `adjustWallet` so the Users-activity **Credit / Suspend / Delete** actions go live (View/Chat already work).

### Bigger features (decide scope)
6. **Voice / Video calling** — Agora token function exists; apps show "coming soon". Build for v1
   or ship chat-only. (Biggest effort.)
7. **Refund flow** — no refund path exists yet (Refunds metric is legitimately ₹0 until built).
8. **Low-balance popup** at ~1 minute before chat ends (product ask from earlier).

---

## 📌 DECISIONS / NOTES (so we don't relitigate)

- **No server needed — the stack is fully serverless.** Backend = Firebase Cloud Functions, Firestore,
  Auth, Storage, FCM, all managed by Google on the Blaze (pay-per-use) plan. No VM to rent/patch/restart.
  AI-chat calls (Claude/OpenAI + Prokerala) run **inside Cloud Functions** so keys stay secret; Agora runs
  its own media servers and we only mint tokens. The only cost is usage — hence the billing-budget action item.
- **`allUsers` Cloud Run Invoker is intentional & permanent** for callable functions. It only makes
  the endpoint reachable; the real gate is the in-function `assertRole(req, 'admin')` check. Do NOT
  revoke it — the functions would stop working. App Check is the future hardening, not removing this.
- **Revenue definitions:** Gross = sum of `recharge` (real cash in). Net = Gross − Refunds.
  **Bonus** (free credit, incl. coupon bonus) is tracked separately and never inflates revenue.
- **Dummy data is not internally cross-consistent** (records generated independently). Per-card math
  is correct; cross-card numbers reconcile only with real, linked events. Fine for design review.
- **Money is server-authoritative:** `walletTransactions` is functions-only in Firestore rules;
  clients (even admin) can't write the ledger directly.

## ⚠️ Reproducibility risk (from earlier audit — still open)
The native `android/` & `ios/` project files (manifest, `google-services.json`, generated launcher
icons) are **not committed** — they exist only on the dev Mac, so a fresh clone can't build the apps.
Commit them from that machine.

## 🤔 MAYBE-LATER — undecided features (do NOT build without an explicit decision)

- **Voice notes in chat** — *[SKEPTICAL / undecided — revisit later]* Let a customer record a short
  voice message to an astrologer in chat. **Not built.** The storage groundwork already exists — the
  `voice_notes/{consultationId}/` path (now participant-locked in `storage.rules`) and an `isAudio()`
  helper — but there is **no record/send UI** anywhere. Owner flagged it as a nice add-on to consider
  "if required." Only build after an explicit go-ahead; not on the launch path.
