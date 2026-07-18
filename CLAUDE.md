# Working agreement

**ONE STEP AT A TIME.** Give the user a single action/command, then stop and
wait for their result before giving the next. Do not send multi-step checklists,
numbered lists of things to do, or several commands at once. One thing, wait,
then the next.

# Deploying (Firebase) — non-interactive, no `firebase login`

The founder deploys from their **Mac** (`~/Projects/Asktro`). Interactive
`firebase login` is NOT reliable here — it throws "Failed to authenticate".
Use the **service-account key** instead (a Google service-account JSON, the
"Google JSON" the founder refers to). Never commit the key; it lives only on
the Mac.

Project id: `asktro-tech-provate-limited` (from `.firebaserc`).

Key path on the Mac (confirmed):
`~/Projects/Asktro/firebase/functions/serviceAccountKey.json`

Deploy command (run from repo root `~/Projects/Asktro`):

```
GOOGLE_APPLICATION_CREDENTIALS="$HOME/Projects/Asktro/firebase/functions/serviceAccountKey.json" \
  firebase deploy --only functions:<name> --project asktro-tech-provate-limited
```

- Deploy functions **one at a time** (deploying two at once tends to fail).
- **New** callable functions also need a Cloud Run invoker grant after deploy
  (org policy blocks the auto-binding) — redeploys of existing functions don't.

**Security note:** the key lives inside `firebase/functions/` (the deploy
source). It must stay in `.gitignore` (never commit) and ideally in
`functions/.gcloudignore` too, so it isn't bundled into the deployed function.

# Active initiatives

- **AI Astrologer engine + retention engine** — an in-progress design the founder
  cares about. Full context, decisions, workflow, cost/pricing, and the retention
  plan live in `docs/AI_ASTROLOGER_ENGINE.md`. Read it before discussing the AI
  astrologer, and keep it updated as decisions are made.
