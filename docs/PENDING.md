# ASKTRO — Living TODO & Handoff Tracker

**Purpose:** the single running list of everything left to do, everything **you**
need to do from your end (accounts, keys, deploys, launch prep), and notes to
revisit later. This file is kept up to date as we build. When something is done,
it moves to the "Done" section with a strikethrough or gets checked off.

_Last updated: 2026-07-04_

---

## 🔴 YOUR ACTION ITEMS (operational — you do these, no coding)

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

## 🟢 DONE (recent — admin dashboard & consoles)

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
1. **Customer support ticket submission** — user raises a ticket in the app; system generates a
   **ticket number** (e.g. `ASK-TKT-000123`) shown with a **copy** button. (Admin side is done.)
2. **Astrologer payout request** — astrologer requests a payout from their portal (creates the
   pending request the admin Payout console acts on). (Astrologer app has a basic version already;
   verify it writes the fields the admin console reads: `astrologerName`, `amount`, `method`, `status`, `createdAt`.)

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
