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

Deploy pattern (fill KEY_PATH once located — see TODO):

```
export GOOGLE_APPLICATION_CREDENTIALS="KEY_PATH"   # path to the service-account .json on the Mac
firebase deploy --only functions:<name> --project asktro-tech-provate-limited
```

- Deploy functions **one at a time** (deploying two at once tends to fail).
- **New** callable functions also need a Cloud Run invoker grant after deploy
  (org policy blocks the auto-binding) — redeploys of existing functions don't.

**TODO (fill in once confirmed):** exact path to the service-account key on the
Mac. Founder half-remembers it exists but not where — locate it, then record the
path here so future sessions can hand over the deploy command directly.

# Active initiatives

- **AI Astrologer engine + retention engine** — an in-progress design the founder
  cares about. Full context, decisions, workflow, cost/pricing, and the retention
  plan live in `docs/AI_ASTROLOGER_ENGINE.md`. Read it before discussing the AI
  astrologer, and keep it updated as decisions are made.
