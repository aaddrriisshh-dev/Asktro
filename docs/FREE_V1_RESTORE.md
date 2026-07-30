# Free v1 → full app: restore checklist

The Play launch on the **personal/individual** developer account can't offer
financial features (Google requires an **organisation account + D-U-N-S** for
those). So **v1 ships with every money surface hidden** and AI consultations
free. Nothing was deleted — it's all behind one switch plus a few reversible
config/data values.

When the **organisation account / D-U-N-S is approved**, do the steps below to
bring the full product back as **v2** (Google reviews v2 normally).

---

## 1. The master switch (code — one line)

`apps/customer/lib/app/feature_flags.dart`:
```dart
const bool kMonetizationEnabled = false;   // ← flip to true for v2
```
Flipping to `true` restores, everywhere, with no other code change:
- Wallet tab, recharge/Razorpay, transactions, offers
- Mall tab + purchases, coupons, referral credit
- Paid consultations (per-minute rate, balance countdown, recharge prompts)
- **Human astrologers** (the AI-only filter in `data/repositories.dart` lifts)
- Kundali Match ₹49 paywall
- Home "Add Cash", money banners, promo/welcome popups, "Money-back" trust chip

`kProfileTabIndex` (same file) auto-recomputes (Profile 2 → 4) when the Wallet +
Mall tabs come back.

Then: bump `apps/customer/pubspec.yaml` version, rebuild the AAB, submit v2.

## 2. Server config (Firestore `config/global` — no deploy, editable live)

For the **free v1** these are set so AI chat is effectively free and startable
with zero balance:
| Field | v1 (free) | v2 (restore to real value) |
|-------|-----------|-----------------------------|
| `minWalletToStartPaise` | `0` | `1800` (default) |
| `freeChatMinutes` | `999999` (huge free grant) | `3` (default) |

(`consultationPricePerMinutePaise` etc. can stay at defaults — with a huge free
grant + hidden cost UI, nothing is charged or shown in v1.)

## 3. Demo/reviewer account (Firestore `users/<demo uid>`)

The Play reviewer logs in with the test number **`+918318259972`** (OTP `123456`).
Ensure that account has a large free AI credit so it never hits a wall:
- set `chatBonusBalance` to a big number (e.g. `9999999999`).

If the account doesn't exist yet, step 2's huge `freeChatMinutes` grants it
automatically on first login. For v2 this is irrelevant.

## 4. Play Console (do for v1 submission; revisit for v2)

- **Financial features** declaration: v1 = "My app doesn't provide any financial
  features" (now truthful). v2 = declare the wallet/payments truthfully.
- **Data safety**: v1 — remove "Payment info" + "Purchase history". v2 — add back.
- **Store listing**: v1 — no mention of wallet/recharge/paid consultations.
  Screenshots must not show money screens. v2 — restore.

---

## What v1 actually is (so the review passes minimum-functionality)
A **free AI Vedic-astrology app**: chat with AI astrologers (free, effectively
unlimited), plus the free tools that work. No wallet, no payments, no human
astrologers, nothing that looks broken. The AI astrologers carry a clear **"AI"
disclosure** (deception-policy safe).
