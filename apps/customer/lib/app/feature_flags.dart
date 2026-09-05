/// App-wide compile-time feature flags.
///
/// ── kMonetizationEnabled ──────────────────────────────────────────────────
/// Master switch for every money / financial surface in the app.
///
///  • `false`  → "Free v1" build for the Google Play launch on the current
///               (personal/individual) developer account. Google requires an
///               ORGANISATION account (D-U-N-S) for apps that offer financial
///               features, so v1 ships with NO money surfaces at all:
///                 - no Wallet tab, no recharge / Razorpay, no transactions
///                 - no Mall purchases, no coupons / offers / referral credit
///                 - AI consultations are FREE (no balance gate, no per-min UI)
///                 - only AI astrologers are shown (human = paid = hidden)
///               This keeps the app genuinely free of financial features so the
///               "My app doesn't provide any financial features" Play
///               declaration is truthful.
///
///  • `true`   → full app with wallet, Razorpay, paid consultations, Mall,
///               coupons, referral and human astrologers — the real product.
///
/// RESTORE FOR v2: once the organisation account / D-U-N-S is approved, flip
/// this to `true`, rebuild, and submit v2 (Google reviews it normally). Nothing
/// was deleted — every money feature is only *hidden* behind this flag. See
/// docs/FREE_V1_RESTORE.md for the full restore checklist.
const bool kMonetizationEnabled = true;

/// v2 keeps Kundli / Kundali Match **FREE** even though money is on (paid Kundli
/// is deferred to v3). This is a SEPARATE switch so enabling monetization never
/// re-introduces the ₹49 Kundali-Match paywall. Flip to `true` only in v3 when a
/// compliant paid-Kundli flow is built.
const bool kKundliMatchPaid = false;

/// Bottom-nav index of the Profile tab. Wallet + Mall sit between Consults and
/// Profile only when monetization is on, so Profile is index 4 with money on
/// and index 2 with money off. Anything that jumps to the Profile tab must use
/// this instead of a hard-coded number.
const int kProfileTabIndex = kMonetizationEnabled ? 4 : 2;
