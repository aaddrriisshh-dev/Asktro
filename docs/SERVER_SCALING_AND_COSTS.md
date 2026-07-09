# Asktro — Server, Scaling to 1 Lakh Users & Cost Estimates

_A living reference. Numbers are estimates with stated assumptions — verify against
live pricing before budgeting. Last updated by the CTO audit pass._

---

## 1. Which "server" are we on right now?

**There is no traditional server to manage — the stack is fully serverless / managed.**

| Piece | What runs it | Who manages it |
|---|---|---|
| Backend logic (billing, consultations, payments, notifications) | **Firebase Cloud Functions** (Node 20, region `asia-south1`) | Google — auto-scales, no VM |
| Database | **Cloud Firestore** | Google — auto-scales |
| Login | **Firebase Auth** (phone OTP + email) | Google |
| Files (photos, docs) | **Firebase Storage** | Google |
| Push notifications | **Firebase Cloud Messaging (FCM)** | Google (free) |
| Admin portal website | **Vercel** (Next.js) | Vercel |
| Payments | **Razorpay** | Razorpay |
| Voice/Video (not live yet) | **Agora** | Agora |

**Plain English:** you are NOT renting or patching a server. Google runs the backend
and scales it up/down automatically; you pay only for what's used (the Firebase
"Blaze" pay-as-you-go plan). This is the right architecture for a launch like this —
**no migration needed to grow.**

---

## 2. Can the current setup handle 1 lakh (100,000) users in 30 days?

**Short answer: yes — the backend handles it, with a short punch-list of fixes (mostly
on the admin portal, not the apps).** No server migration, no re-architecture.

**The key distinction:** "1 lakh users" = 100,000 **total registered** users. That is NOT
100,000 people using it *at the same second*. Realistically, at 100k total users you'd
see maybe **500–3,000 people active at once** at peak. The backend's measured ceiling is
~**150,000–200,000 *concurrent*** users (see the scalability audit), so **100k total is
comfortably inside capacity.**

### ✅ What already handles 100k total users as-is
- Billing engine, consultation flow, payments, notifications — all scale fine at this level.
- Mass announcements go out as a single FCM **topic** message (no per-user fan-out).
- Each customer touches only their own docs during a session (no shared write-hotspot yet at this size).

### ⚠️ Must-fix BEFORE you hit ~100k total (in rough priority)
1. **Admin portal — the "Customer Management" page loads ALL users at once.** At 100k users
   this will freeze the browser and cost a fortune in reads. **Must be server-paginated.**
   _(File: `apps/admin/.../users/page.tsx` — `useCollection('users')` with no limit.)_
2. **Admin portal dashboards read whole collections** (all users, all consultations) on
   each visit. At 100k users these become slow, expensive scans. **Move to pre-computed
   counter documents.** _(`UsersActivityTable`, `OperationsSection`, `ActiveConsultationsCard`.)_
3. **Raise Cloud Functions `maxInstances`** from 100 → higher (headroom so billing never
   gets starved under a traffic spike). _(File: `functions/src/index.ts`.)_
4. **Phone-OTP SMS at scale** — see costs below; also India **DLT/TRAI registration** is
   required for SMS at volume.

### 🔭 Only needed much LATER (toward 1M+ concurrent, NOT at 100k)
Listener consolidation, moving astrologer presence/counters off the hot doc, single-sided
billing heartbeat, sweep sharding. _(All documented in the scalability audit — not urgent
for 100k.)_

**Verdict:** **Current setup is fine for 100k users** once the two portal listener issues
(#1, #2) and `maxInstances` (#3) are handled. Those are days of work, not a rebuild.

---

## 3. Estimated monthly bills at ~100k users

> **Assumptions** (adjust to your real numbers): 100,000 total registered users;
> ~15,000 monthly-active; ~30,000 chat consultations/month averaging ~6 min; voice/video
> NOT yet live; AI-chat NOT yet wired. **These are ballparks — real cost is driven by
> actual usage and will differ.** Prices as of early 2026; verify live.

| Service | What drives the cost | Rough monthly estimate | Notes |
|---|---|---|---|
| **Firebase Firestore** | reads/writes (billing ticks + listeners dominate) | **₹8,000 – ₹40,000** ($100–$500) | Biggest Firebase line. The billing heartbeat (every 10s/session) is the main driver — halving it (single-sided) roughly halves this. |
| **Firebase Cloud Functions** | invocations + compute time | **₹4,000 – ₹20,000** ($50–$250) | Ticks + payments + notifications. |
| **Firebase Storage + egress** | photos, bandwidth | **₹800 – ₹4,000** ($10–$50) | Small unless heavy image sharing. |
| **Firebase Auth — phone OTP SMS** | 1 SMS per login/signup | **₹15,000 – ₹60,000+** ($180–$750+) | ⚠️ **Often the surprise cost.** India SMS ≈ ₹0.12–0.30 each; 100k signups + re-logins add up. Needs **DLT registration**. Consider a cheaper SMS provider (MSG91/Fast2SMS) if this balloons. |
| **FCM (push)** | notifications | **Free** | No charge. |
| **Vercel (portal)** | hosting | **₹0 – ₹1,700** ($0–$20) | Free/Pro tier is plenty for an admin panel. |
| **Razorpay (payments)** | **% of money collected**, not per user | **~2% + 18% GST** of recharge revenue | This is a revenue share, not a fixed bill. E.g. ₹10L recharges → ~₹20k fee. |
| **Agora (voice/video)** | per call-minute — **only when you launch calls** | ~₹85/1,000 voice min, ~₹340/1,000 video min ($0.99 / $3.99) | ₹0 today (not live). Scales with call minutes once enabled. |
| **AI chat (if you add it)** | per message to Claude/OpenAI + Prokerala kundli API | Depends entirely on volume | ₹0 today (not wired). Budget when you build AI astrologers. |
| **Google Play** | one-time | **₹2,000** ($25 once) | — |
| **Apple Developer** | yearly | **₹8,300/yr** ($99/yr) | Needed for iOS. |

### Ballpark total (excluding Razorpay's revenue-share and Agora)
**Roughly ₹35,000 – ₹1,25,000 / month ($430–$1,550)** at ~100k users, **dominated by
Firestore reads and phone-OTP SMS.** The two biggest savings levers:
1. **Single-sided billing heartbeat** (halves Firestore tick cost).
2. **Cheaper SMS provider + DLT** for OTP (can cut the SMS line significantly).

Set a **Firebase Blaze budget alert** so a runaway query can never surprise-bill you.

---

## 4. CTO server/infra suggestions

1. **Stay serverless.** Do NOT move to a rented VM/Kubernetes — it would add ops burden
   for zero benefit at this stage. Firebase + Vercel is correct through at least 100k users.
2. **Before 100k:** fix the two unbounded portal listeners and add aggregate counter docs
   for the dashboard; raise `maxInstances`; set a Blaze budget alert.
3. **Watch the phone-OTP SMS bill** — it's the least-obvious cost. Do the India DLT
   registration early and price a dedicated SMS provider.
4. **Upgrade the Functions runtime** off Node 20 (deprecated; it's also what's been causing
   the deploy "409 wedge"). Move to Node 22 in a calm window before launch.
5. **Toward 1M concurrent** (well beyond 100k): implement the scalability-audit fixes
   (listener consolidation, counters off the hot astrologer doc, single-sided heartbeat,
   sweep sharding). Not needed at 100k, but that's the path.
