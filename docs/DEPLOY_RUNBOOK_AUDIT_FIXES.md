# Deploy runbook — audit-fix batch (P0/P1/P2/P3)

This batch closed the audit findings. Everything below is committed on
`claude/asktro-session-handoff-o1ggo8`. Deploy in THIS ORDER — one step, verify,
then the next.

## What changed (needs deploying)
- **Cloud Functions** — new/changed: disconnect-billing cap, full account
  deletion, refund path, webhook dead-letter + `reconcileFailedCredits`,
  dev-mint kill-switch, consent recording, moderation (report/block/flag/image),
  financials relocation writers.
- **Firestore rules** — new collections: `alerts`, `failedWebhookCredits`,
  `consentRecords`, `reports`, `userBlocks`, `imageModeration`. (Astrologer
  `private/financials` is already covered by the existing `private/{doc}` rule.)
- **Firestore indexes** — 2 new consultation indexes (`status+pausedAt`,
  `status+createdAt`) so the paused/waiting recovery sweeps stop throwing.
- **Backfill** — one-time move of existing astrologer money into
  `private/financials` (closes the world-readable-earnings leak).
- **Flutter apps** — customer (consent gate on all sign-ins, deletion copy),
  astrologer (self-merge of `private/financials`). Rebuild both.
- **Admin portal (Vercel)** — reads financials from the private subdoc. Redeploy.

## Order (money-safe)
1. **Indexes** (build first; they take a few minutes):
   `firebase deploy --only firestore:indexes`
2. **Functions**:
   `firebase deploy --only functions`
3. **Rules**:
   `firebase deploy --only firestore:rules`
4. **Grant Cloud Run Invoker → `allUsers`** on the newly-called callables so the
   app/portal buttons can reach them (the deploy service account can't set this
   itself). Functions: `refundConsultation`, `reportContent`, `blockUser`,
   `unblockUser`. Per function in the Cloud Run console → the service →
   *Security/Permissions* → add principal `allUsers`, role **Cloud Run Invoker**
   (i.e. "Allow unauthenticated"; the Firebase Auth token is still checked inside
   the function). Or `gcloud run services add-iam-policy-binding <fn>
   --member=allUsers --role=roles/run.invoker --region=asia-south1`. Existing
   callables already have this from earlier deploys — only these four are new.
5. **Rebuild + ship the two Flutter apps**, and **redeploy the admin portal** on Vercel.
6. **Backfill LAST** (after functions are live, so new accruals already write to
   `private/financials`; the script increments the old public value in and
   deletes it from the public doc — transaction-safe, idempotent):
   ```
   cd firebase/functions
   GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/asktro-...-adminsdk-....json \
     node scripts/backfill_privacy.mjs
   ```

The astrologer app SUMS public+private earnings during the window, so an
astrologer's displayed earnings never dips between step 4 and step 5.

## Smoke-test after deploy (I can't run these here)
- **Astrologer wallet tab** shows correct lifetime earnings + pending payout.
- **Admin → astrologer detail** and **Reports → All astrologers export** show
  earnings/commission; **Operations → Top astrologers** ranks by earnings.
- A customer signed in with Google **cannot proceed without the consent tick**.
- Delete a throwaway account → its chats/images/remedies are gone; wallet ledger
  rows remain (anonymised).

## Money-path tests (new)
- `cd firebase/functions && npm run test:integration` runs the emulator
  money-path tests (idempotent credit + billing buckets). CI runs them too.

## Still open (not code — your action / a decision)
- **Apple IAP (P1-10)** — decision needed: IAP vs. web-only recharge vs.
  carve-out. Not a code change until you choose.
- **Chat image NSFW auto-scan** — written but NOT deployed (needs a one-time IAM
  grant + Vision API). Full enable steps live in **`PRE_LAUNCH.md` → Chat image
  auto-scan**. Report/block/text-flag moderation ARE live.
- ✅ **Moderation UI DONE** — Report/Block wired into the astrologer profile
  (customer app) and the in-consultation header (astrologer app); Refund wired
  into the admin user-detail view. They need step 4's invoker grant to function.
- **Client auto-resume on network pause** — server now pauses a disconnected
  session (no more over-billing); a nice follow-up is auto-calling `resume`
  when the app reconnects with balance (today the user taps resume).
- Account-level items unchanged: Razorpay live keys, iOS APNs, App Check,
  release keystore, legal copy (see MASTER_TODO / PRE_LAUNCH).
