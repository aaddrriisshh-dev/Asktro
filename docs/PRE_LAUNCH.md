# Pre-Launch Checklist — MUST do before going live

> Living list of things that are safe for now but MUST be handled before the
> public launch (~30 days out, real wallets, millions of users).

---

## 🔐 SECURITY / SECRETS

### 1. Secure the Firebase deploy service-account key (HIGH PRIORITY)

**The exact file (do not confuse with the other similarly-named JSONs):**

```
asktro-tech-provate-limited-firebase-adminsdk-fbsvc-100e163e63.json
```

- Currently sitting loose in `~/Downloads/` on Adrish's Mac.
- This key can deploy Cloud Functions and act with admin power on the
  Firebase project. If leaked, someone can take over the backend.

**What to do before launch:**
1. Move it OUT of `Downloads` into a locked-down location
   (e.g. `~/.secrets/` with `chmod 600`, or a password manager / secret vault).
2. Never commit it to git (already gitignored — keep it that way).
3. **Rotate to CI-based deploys** eventually — the deploy key should live in a
   CI secret store (GitHub Actions secrets), NOT on a personal laptop, so a
   lost/stolen laptop doesn't hand over the project.
4. After moving to CI, **rotate (regenerate) this key** in
   Google Cloud Console → IAM & Admin → Service Accounts → Keys, and delete the
   old one, since it has been sitting unencrypted on disk.

**Deploy account & roles (one-time IAM setup already done — do NOT remove):**
- Account: `firebase-adminsdk-fbsvc@asktro-tech-provate-limited.iam.gserviceaccount.com`
- Roles granted: Service Usage Admin, Secret Manager Admin, Cloud Functions Admin.

---

## Add new pre-launch items below as they come up.
