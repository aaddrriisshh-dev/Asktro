# ASKTRO — Firestore Data Model

Source of truth: **Part 7** of the product spec. All money/time fields are
written **only** by Cloud Functions. Clients read via realtime listeners and
never write balance, timer, or billing fields directly (enforced by rules).

Conventions:
- All timestamps are Firestore `Timestamp` (server time). Never device time.
- Monetary amounts stored in **paise (integer)** to avoid float drift.
  `₹9.00 = 900 paise`, `₹0.15/sec = 15 paise/sec`. UI divides by 100 for display.
- Enum-like fields stored as lowercase strings.
- `createdAt`/`updatedAt` on every document.

---

## `users/{userId}`
Customer profile. `userId` = Firebase Auth uid.

| field | type | writer | notes |
|---|---|---|---|
| name | string | user | |
| phone | string | user (verified) | E.164 |
| email | string? | user | |
| profilePhoto | string? | user | Storage URL |
| walletBalance | int (paise) | **functions only** | spendable |
| bonusBalance | int (paise) | **functions only** | promo credit |
| lockedBalance | int (paise) | **functions only** | reserved during active session |
| totalRecharge | int (paise) | functions | lifetime |
| totalSpent | int (paise) | functions | lifetime |
| pendingRefund | int (paise) | functions | |
| totalConsultations | int | functions | |
| referralCode | string | functions | unique, generated at signup |
| referredBy | string? | functions | referrer's code |
| favouriteAstrologers | string[] | user | astrologerIds |
| followingAstrologers | string[] | user | |
| notificationEnabled | bool | user | |
| fcmTokens | string[] | user | multi-device |
| accountStatus | string | admin/functions | `active` \| `blocked` \| `deleted` |
| createdAt / updatedAt | Timestamp | | |

## `astrologers/{astrologerId}`
| field | type | writer | notes |
|---|---|---|---|
| name | string | astrologer/admin | edits may need approval |
| phone / email | string | admin | |
| profilePhoto | string? | astrologer | |
| about | string | astrologer | |
| experience | int (years) | astrologer | |
| languages | string[] | astrologer | |
| expertise | string[] | astrologer | tags |
| rating | double | **functions only** | rolling average |
| totalReviews | int | functions | |
| totalConsultations | int | functions | |
| followers | int | functions | |
| responseTimeSec | int | functions | avg |
| earnings | int (paise) | **functions only** | lifetime gross |
| pendingPayout | int (paise) | functions | |
| onlineStatus | bool | astrologer | realtime toggle |
| available | bool | astrologer/functions | false while in active session |
| verified | bool | admin | badge |
| featured | bool | admin | home rail |
| accountStatus | string | admin | `pending` \| `approved` \| `suspended` \| `rejected` \| `disabled` |
| quickReplies | string[] | astrologer | |
| availability | map | astrologer | workingDays, hours, holiday, vacation |
| bankDetails / upiId | map/string | astrologer | payout (restricted read) |
| createdAt / updatedAt | Timestamp | | |

## `consultations/{consultationId}`
The billing session. Written **only** by functions.

| field | type | notes |
|---|---|---|
| customerId | string | |
| astrologerId | string | |
| type | string | `chat` \| `voice` \| `video` |
| pricePerMinute | int (paise) | snapshot of global price at start |
| pricePerSecond | int (paise) | derived |
| status | string | `waiting` \| `active` \| `paused` \| `completed` \| `cancelled` \| `expired` |
| paymentStatus | string | `pending` \| `settled` |
| networkStatus | string | `ok` \| `reconnecting` |
| startTime | Timestamp | first activation |
| endTime | Timestamp? | |
| lastTickAt | Timestamp | last billed instant (drives deduction) |
| billedSeconds | int | accumulated across pause/resume |
| duration | int (sec) | final |
| walletBefore | int (paise) | |
| walletAfter | int (paise) | |
| totalCharged | int (paise) | |
| pausedAccumMs | int | time spent paused (excluded from billing) |
| agoraChannel | string? | voice/video |
| rating | double? | set by rateConsultation |
| review | string? | |
| receiptNo | string? | |
| createdAt / updatedAt | Timestamp | |

### `consultations/{id}/messages/{messageId}` (subcollection)
Never one giant collection. Per Part 7.

| field | type | notes |
|---|---|---|
| senderId | string | user or astrologer id |
| type | string | `text` \| `image` \| `voice` \| `system` |
| text | string? | |
| image | string? | Storage URL |
| voice | string? | Storage URL |
| durationMs | int? | voice note length |
| timestamp | Timestamp | |
| delivered | bool | |
| seen | bool | |

## `walletTransactions/{transactionId}`
Immutable ledger. Functions only.

| field | type | notes |
|---|---|---|
| userId | string | |
| kind | string | `recharge` \| `consultation` \| `refund` \| `bonus` \| `coupon` \| `adjustment` |
| amount | int (paise) | signed: credit +, debit − |
| balanceBefore / balanceAfter | int (paise) | |
| refId | string? | consultationId / paymentId / couponId |
| note | string? | |
| createdAt | Timestamp | |

## `rechargePlans/{planId}`  (admin-managed)
amount, walletCredit, bonus (all paise), popular(bool), recommended(bool), active(bool), displayOrder(int).

## `coupons/{couponId}`  (admin-managed)
code, type(`flat`|`percentage`), amount(paise), percentage(int), maxDiscount(paise), minimumRecharge(paise), applicablePlans(string[]?), expiry(Timestamp), usageLimit(int), perUserOnce(bool), usedCount(int), active(bool).

## `couponRedemptions/{id}`  enforces usage limits: couponId, userId, createdAt.

## `banners/{bannerId}`  (admin-managed)
title, subtitle, image, deeplink, cta, placement(`home`|`recharge`|`referral`), priority(int), startDate, endDate, active(bool).

## `notifications/{notificationId}`
userId(or `role:*` for broadcast), title, body, type, deeplink, read(bool), createdAt.

## `referrals/{referralId}`
referrerId, referredId, referrerReward(paise), referredReward(paise), status(`pending`|`credited`|`expired`), triggeredByPaymentId?, createdAt.

## `payouts/{payoutId}`
astrologerId, amount(paise), method(`bank`|`upi`), bank/upi(map/string), status(`pending`|`approved`|`rejected`|`processed`), processedBy?, createdAt.

## `supportTickets/{ticketId}`
customerId?, astrologerId?, subject, body, priority, status(`open`|`assigned`|`closed`), assignedTo?, thread(subcollection), createdAt.

## `config/global`  (single doc, admin-managed; mirrored to Remote Config)
consultationPricePerMinute(paise, default 900), minWalletToStart(paise), warnLevel1Sec(default 120), warnLevel2Sec(default 30), reconnectTimeoutSec, sessionTimeoutSec, requestTimeoutSec(default 30), commissionPercent, refundRules(map), featureFlags(map).

## `auditLogs/{id}`  (immutable — admin actions)
actorUid, actorRole, action, targetType, targetId, before?, after?, reason?, ip?, createdAt.

## `adminUsers/{uid}`  role(`super`|`ops`|`finance`|`support`|`marketing`|`analyst`), permissions(map), active(bool).

---

## Custom claims (Auth)
- customers: no special claim (default).
- astrologers: `{ role: "astrologer", approved: bool }`.
- admins: `{ role: "admin", adminRole: "<super|ops|...>" }`.

Set by Cloud Functions only. Rules key off these claims.
