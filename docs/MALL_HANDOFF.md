# Asktro Mall — Handoff & Plan

_Last updated: 2026-07-15_

This is the running plan for finishing the **Asktro Mall** e-commerce ecosystem.
Read top-to-bottom: the audit plan comes first (that's how we find everything
that's broken), then the pending build work.

---

## 0. FIRST THING TOMORROW — verify what shipped today

Before any new work, confirm today's three changes actually work in production
(portal redeployed + hard-refreshed):

- [ ] **Date filter** on the Mall dashboard drops down the full list (Today →
      Custom) and changing it updates every card + its header label.
- [ ] **Inventory page** (left menu → *Inventory*): "Set stock" box and
      "Restock" button both save.
- [ ] **Coupons** apply at checkout in the app (createStoreOrder is now
      deployed with the coupon logic).

Deploy state as of tonight:
- Functions deployed: `createStoreOrder`, `verifyStoreOrder`, `razorpayWebhook`,
  `firestore:rules` — **all confirmed updated.**
- Portal: redeploying to `asktro-admin.vercel.app` (final verify pending).
- Customer app: still needs a fresh **release build + install** to pick up the
  storefront features (banners, address book, coupons, reviews, combos).

---

## 1. THE HARD AUDIT (top priority)

We do this as a set of **separate, focused audits** — one lens at a time — so
nothing hides in the gaps. Each audit produces a written list of findings
(bug / severity / where / proposed fix). We fix in priority order after.

### Audit A — Money & order integrity (highest risk)
Every path where money or stock moves, hunted for races and holes:
- `createStoreOrder`: server rebuilds all totals, client can't inject price/discount.
- Coupon apply + re-validation server-side; `usedCount` increments only on paid.
- Stock decrement is transactional; no oversell under concurrent orders.
- Razorpay verify + webhook backstop; idempotent confirm; no double-credit.
- COD path (once built) — no Razorpay, but same server-authoritative totals.
- Refund/cancel path reverses stock + coupon usage correctly.

### Audit B — Storefront (customer app) functional + UX
Walk every screen and every button in the app:
- Home (banners carousel, claim strip, rails, trust banner, categories, all-products,
  testimonials, videos, FAQs), category + subcategory, product detail (specs,
  reviews, combo bundle, cart stepper), cart, checkout (address book, coupon, COD),
  order history/status.
- Empty states, error states, loading states, release-mode crashes.
- Image rendering (no black backgrounds, correct crop/aspect everywhere).

### Audit C — Portal (admin) functional + permissions
Every store menu: Dashboard, Catalog, Inventory, Orders, Discounts, Content,
Storefront, Home Screen.
- CRUD correctness, validation, image crop everywhere images upload.
- Order management actions (mark packed/shipped, tracking, cancel/refund).
- Role gating (super / ops) — who can see & edit what.

### Audit D — Data model & Firestore rules
- Security rules for **every** store collection (products, categories, orders,
  coupons, banners, reviews, addresses, homeSections) — least privilege.
- Required composite indexes vs. current single-field + client-sort approach.
- Orphaned / undeclared fields; schema drift vs. `types.ts` / `DATA_MODEL.md`.

### Audit E — Design / visual QA
- Celestial + emerald/ghee consistency across app and portal.
- Responsiveness, spacing, full-bleed edges, the crop "base" holds for real
  product photos.
- Regression check on the transparent-PNG → black-background fix.

### Audit F — Stability / Crashlytics
- Agora RTC crash (guarded — confirm no recurrence in new Crashlytics data).
- **Task #30**: pinpoint the 2px RenderFlex overflow widget (astrologer app).
- Release-mode error routing (overflow → non-fatal) still correct in both apps.

### Audit G — End-to-end purchase test (the real thing)
One real order, start to finish: browse → cart → apply coupon → checkout with
saved address → pay (and separately, COD) → order confirmed → stock decremented
→ status moves in portal → customer sees updates. Note every rough edge.

### Audit H — Performance / scale
- Dashboard fetches `storeOrders` with `limit(1000)` + client filter — fine now,
  needs rollups/pagination before the order count grows.
- Query cost, index needs, image sizes.

---

## 2. PENDING BUILD WORK (the ecosystem gaps)

Ordered roughly by importance to a "full-fledged" store:

- [ ] **COD (Cash on Delivery)** — its own order path with no Razorpay step;
      server-authoritative totals; status starts at confirmed/processing.
- [ ] **Order management in portal** — mark packed / shipped, add tracking
      number, cancel, trigger refund; customer-visible status updates.
- [ ] **Product variants** — size / weight / type with per-variant price + stock,
      wired through the money path and stock decrement.
- [ ] **Shipping integration (Shiprocket)** — rates, label, AWB/tracking, webhook
      status back into the order.
- [ ] **GST invoice** — generate + store a proper tax invoice per order
      (HSN, GST rate, breakup — fields already captured on products).
- [ ] **Returns / refunds flow** — customer request → portal approve → refund +
      stock/coupon reversal.
- [ ] **Wallet / ecosystem tie-ins** — pay with Asktro wallet; cross-sell between
      consultations and the store.
- [ ] **Storefront search & filters** — search box, price/category filters, sort.
- [ ] **Verified-purchase reviews + moderation** — only buyers review; portal
      moderates.
- [ ] **Order notifications** — push/email on confirmed, packed, shipped, delivered.

---

## 3. NON-STORE PENDING

- [ ] **Task #30** — pinpoint the actual 2px RenderFlex overflow widget
      (astrologer app). Overflow is currently routed as non-fatal; still want
      the real culprit fixed.

---

## 4. DONE RECENTLY (for context)

- Full storefront + content management + portal-in-portal (emerald/ghee theme).
- Image crop/reposition tool everywhere; white-background fix.
- Address book, coupons (server-authoritative), trust banner, combos, subcategories,
  8 product photos, taller hero banner.
- Mall e-commerce dashboard (KPIs, charts, top products, inventory health) with a
  shared date-range filter + previous-period comparison.
- Inventory management page (set stock + restock).
- Agora RTC in-call-control crash guarded.
