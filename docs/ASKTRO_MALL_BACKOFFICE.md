# Asktro Mall — Back-Office Blueprint

**Principle:** every pixel of the storefront is controlled from the portal. Nothing
in the app is hard-coded. An employee logs into the portal, uploads/toggles/edits,
and the app reflects it instantly (Firestore live streams). This doc is the plan —
**no code is built from it until approved.**

Design goals:
- **One-stop:** catalog, storefront layout, media, reviews, orders, deliveries,
  settings — all in one "Asktro Mall" portal section.
- **Easy for non-technical staff:** clear labels, card-based layouts (matching the
  celestial portal theme), drag-to-reorder, inline previews, bulk actions.
- **Nothing static:** hero images, claim-strip phrases, section order, About/FAQ,
  testimonials, videos — every one is a portal field.

---

## 1. Audit — what exists today

**Built & live (backend):**
- `storeCategories`, `storeProducts`, `storeOrders`, `storeOrderBindings` collections.
- Server checkout (`createStoreOrder` / `verifyStoreOrder`) + Razorpay + webhook backstop; stock decrement in a transaction; human order numbers.
- Firestore rules (catalog public-read / admin-write; orders self-read / server-write), storage rules (`store_images`), composite indexes, rate limits.
- Seed script (6 categories × ~10 products) + `config/store` shipping defaults.

**Built & live (portal — minimal):**
- `/store` — Categories (name, emoji, blurb, image, sortOrder, active) + Products (title, description, category, price, MRP, stock, SKU, up-to-4 images, sortOrder, active).
- `/store-orders` — order list + fulfilment (status, courier, tracking, cancel).

**Built & live (app):**
- Storefront home (hero, chips, claim marquee, Best Sellers, All Products), category screen, product detail (image carousel + thumbnails), cart, checkout, order tracking, My Orders.

**Gaps (what this blueprint adds):**
- Categories are **flat** → need **nested/subcategories** (arbitrary depth).
- Products have a flat image list & no **variants**, no **media gallery管理** (reorder/primary/video/certificate), no HSN/GST, no weight/dims, no specs, no related products, no manual **rating/reviews**.
- The app home is **partly hard-coded** (hero art, claim phrases, section order, Best Sellers = "first N") → need a **Storefront Builder** so the admin composes the home.
- No **hero-banner carousel**, **testimonials**, **videos**, **combos/collections**, **discounts**, **About/FAQ**, **deliveries/Shiprocket**, **store settings/GST** management.

---

## 2. Portal information architecture — the "Asktro Mall" section

A dedicated top-level nav group (collapsible), so it's obvious and separate from the
consultation admin. Sub-pages:

```
🛍️  ASKTRO MALL
   ├ Dashboard            — today's orders, revenue, low-stock, to-ship count
   ├ Storefront Builder   — compose the app home: sections, order, toggles
   │    ├ Hero Banners        (upload carousel images + CTA + schedule)
   │    ├ Home Sections        (add/reorder/toggle rails, banners, video, testimonial blocks)
   │    └ Claim Strip          (the marquee phrases)
   ├ Categories           — nested tree (add child, drag-reparent, reorder, banner)
   ├ Products             — full product editor (media gallery, variants, tax, shipping, flags, specs)
   ├ Collections          — curated rails (manual list OR rule-based) that back home sections
   ├ Reviews              — add/seed reviews, moderate customer reviews, feature
   ├ Testimonials         — homepage social-proof cards
   ├ Videos               — "why us" / product reels
   ├ Discounts            — sales, promo codes, free-ship threshold, BOGO
   ├ Orders               — list, detail, invoice, timeline  (exists, expand)
   ├ Deliveries           — Shiprocket: serviceability, AWB, label, manifest, tracking, NDR/RTO
   ├ Customers            — store buyers: order history, addresses
   ├ Content              — About Asktro Mall, FAQ, policies (shipping/returns/cancellation)
   └ Settings             — GSTIN, legal entity, shipping fees, pickup locations, currency
```

Every page is card-based, mobile-responsive, with a **"Preview in app"** affordance
where it helps (hero, sections, product).

---

## 3. Section-by-section blueprint (portal field → app effect)

### 3.1 Storefront Builder — the heart of "nothing is static"

Model the app home as an **ordered list of typed section blocks** (`storeHomeSections`),
exactly like Shopify's theme sections. The app renders whatever the admin arranges.

**Section types & their fields:**

| Type | Portal fields | App render |
|---|---|---|
| `hero` | linked Hero-Banner set (see 3.2) | full-bleed auto-shuffling hero carousel |
| `claim_strip` | phrases[] (or link to Claim Strip page) | dark auto-scrolling marquee |
| `category_chips` | (auto: active categories) or manual subset + order | round category tiles |
| `product_rail` | title, eyebrow, source = Collection **or** rule (bestSeller/newLaunch/combo/onSale/newest) + limit + "View all" target | horizontal product cards |
| `banner` | single image + CTA deep-link | tappable promo image |
| `video_block` | linked Videos set | "why us" video reel row |
| `testimonial_block` | linked Testimonials set | review carousel |
| `category_grid` | which categories, columns | grid of category cards |
| `rich_text` | heading + body (About snippet) | text block |

Per section: `enabled`, `position` (drag to reorder), optional `schedule` (start/end),
optional `title`/`eyebrow`. Admin **adds, removes, reorders, toggles** sections → the
app home is whatever they build. Default layout is seeded so it works out of the box.

### 3.2 Hero Banners (carousel)
Per banner: **image** (upload; recommend a portrait/near-square crop guide), optional
**headline / subtext / kicker / CTA label** (or fully-baked image with text), **CTA
deep-link** (category / product / collection / external url), **display order**,
**active**, **schedule** (start/end). → App: full-bleed auto-shuffling hero.

### 3.3 Claim Strip
An ordered list of short phrases (e.g., "Energised by top astrologers", "100% Natural",
"Lab Certified", "Free shipping over ₹499"). Add/remove/reorder. → App: marquee.

### 3.4 Categories (nested, arbitrary depth)
Fields: **name, image, emoji/icon, parentId (tree picker), description, category-page
banner image, sortOrder among siblings, active, SEO**. Admin can **add a child, drag to
reparent, reorder siblings**. Data model: `parentId` + **materialized path** `pathIds[]`
(root→parent). Products denormalize `categoryPathIds[]` (self + ancestors) so "category +
all descendants" is a **single indexed query** (`array-contains`). → App: nested category
navigation + category page hero.

### 3.5 Products (the big editor)
A Shopify-style two-column editor. Fields:

- **Basics:** title, handle/slug, description (rich text), category (nested picker; optional secondary categories), tags, brand/vendor, **status** (active / draft / archived).
- **Media gallery (ordered):** multiple **images** + **video(s)** + **certificate image** + **lifestyle/model shots**; drag to reorder, set **primary**, alt text. → App: the product-detail **thumbnail strip** (the small floating cards under the main image) and the carousel.
- **Pricing:** price, **MRP/compare-at** (strike-through), **cost price** (margin, internal-only).
- **Variants/options:** define option axes (**Mukhi / Size / Carat / Metal**…), auto-generate the **variant matrix**; each variant owns **SKU, price, stock, image, weight, dimensions**. → App: variant selector on product detail; price/stock update per selection.
- **Inventory:** stock, low-stock threshold, allow-backorder, SKU, barcode. → App: out-of-stock state, "only N left".
- **Tax (India):** **HSN code, GST rate**, tax-inclusive flag. → App/invoice: per-line GST (CGST/SGST/IGST), GST invoice.
- **Shipping:** **weight, dimensions (L×B×H)**. → needed for Shiprocket rating/manifest.
- **Merch flags:** `bestSeller`, `newLaunch`, `combo`, `featured`, `onSale`. → App: which rails a product appears in + ribbons.
- **Rating & reviews:** manual **rating** + **review count** override, or auto from Reviews. → App: the ⭐ badge + reviews count.
- **Specifications:** free key–value list (Origin: Nepal, Beads: 108, Certification: Lab). → App: a specs table on detail.
- **Related / cross-sell products:** pick products. → App: "You may also like".
- **SEO:** title, description.

### 3.6 Collections (curated rails)
Named groups used to back `product_rail` home sections and menu links.
- **Manual:** hand-pick products (drag to order).
- **Rule-based:** auto-include by rule (price < X, tag = sale, category = Y, bestSeller = true).
Fields: name, image, type (manual/auto), rules/product list, active. → App: any rail or "shop the collection".

### 3.7 Reviews (manual + moderation)
Per product, a reviews list. Admin can **add/seed a review** (rating, title, body,
reviewer name, **verified** badge, date, optional **photo**), **moderate** customer-
submitted reviews (approve/hide/feature), and the product's **aggregate rating + count**
is auto-computed (with manual override). → App: reviews section on product detail + the
rating badge on cards.

### 3.8 Testimonials
Homepage social-proof cards: name, avatar, rating, quote, verified, order, active.
→ App: testimonial carousel section.

### 3.9 Videos
"Why Asktro Mall" reels / product videos: upload or URL, thumbnail, caption, link,
order, active. → App: video block row.

### 3.10 Discounts / Promotions
- Product/category **sale** (via compare-at or a scheduled automatic discount).
- **Cart promo codes** (percent/fixed, min cart, per-customer limit, usage cap, schedule).
- **Free-shipping threshold.**
- **BOGO** (buy X get Y). All server-validated at checkout. → App: sale prices, code entry, free-ship banner.

### 3.11 Orders (expand existing)
List + filters (To-Fulfil / Shipped / Delivered / Cancelled / RTO), order detail with
items + address + **tax breakdown**, **GST invoice** (frozen at order time), status
**timeline**, internal notes. Two-axis status: `financialStatus` (payment) ×
`fulfillmentStatus`/`shipmentStatus` (physical). → App: My Orders live status.

### 3.12 Deliveries — Shiprocket console
Pickup locations (registered in Shiprocket), **courier serviceability by pincode**,
**assign AWB**, **generate label + manifest**, **live tracking** (Shiprocket webhook →
order timeline), **NDR/RTO** action list, **returns**. Abstracted behind a
`ShippingProvider` interface so Delhivery/NimbusPost can swap later. Products need
weight/dims; orders need pickup + package details. → App: tracking number + courier +
live status on the order.

### 3.13 Customers
Store buyers: profile, **order history, saved addresses**, lifetime value. (Reuses the
existing users; a store-scoped view.)

### 3.14 Content
Editable **About Asktro Mall**, **FAQ** (Q/A list), and **policies** (Shipping, Returns,
Cancellation) — required for a compliant physical store. → App: About/FAQ section +
policy pages.

### 3.15 Settings
**GSTIN, legal entity name & address** (for invoices), **shipping fee + free-ship
threshold**, **currency**, **pickup location(s)**, Shiprocket connection, Razorpay/COD
toggle. → drives checkout math, invoices, shipping.

---

## 4. Firestore data model (additions)

```
storeHomeSections/{id}     type, position, enabled, title, eyebrow, config{...}, schedule
storeBanners/{id}          image, headline, subtext, cta{label,target}, order, active, schedule
storeCategories/{id}       + parentId, pathIds[], depth, description, bannerImage, seo
storeProducts/{id}         + categoryPathIds[], options[], media[]{type,url,thumb,alt,pos,primary},
                             compareAtPaise, costPaise, hsnCode, gstRate, weightGrams,
                             dimsCm{l,b,h}, specs[]{k,v}, relatedIds[], combo, featured, onSale, seo
storeProducts/{id}/variants/{vid}   sku, optionValues{}, pricePaise, stock, imageId, weightGrams, dimsCm
storeProducts/{id}/reviews/{rid}    rating, title, body, name, verified, photo, at, status
storeCollections/{id}      name, image, type(manual|auto), productIds[]|rules{}, active
storeTestimonials/{id}     name, avatar, rating, quote, verified, order, active
storeVideos/{id}           url, thumb, caption, link, order, active
storeDiscounts/{id}        type, code, value, scope, conditions, limits, schedule, active
storeOrders/{id}           + financialStatus, fulfillmentStatus, shipmentStatus, invoice{},
                             shiprocket{orderId,shipmentId,awb,courier,labelUrl,trackingUrl}, timeline[]
config/store               shippingFeePaise, freeShippingThresholdPaise, gstin, legalEntity{},
                             pickupLocations[], claimPhrases[], aboutHtml, faq[], policies{}
```

All money in **paise (integers)**. Prices/discounts computed **server-side**; `costPrice`
never leaves the server. Category-move re-stamps descendants + products via a Cloud
Function (rare op).

---

## 5. Phasing (build order)

**Phase A — Catalog depth** (unblocks a real catalog):
nested categories (tree editor + pathIds), product editor upgrade (media gallery reorder,
variants, HSN/GST, weight/dims, specs, flags, related), reviews (manual + rollup).

**Phase B — Storefront Builder** (kills all remaining static bits):
hero banners, claim strip, home sections (add/reorder/toggle), collections, testimonials,
videos, About/FAQ, settings. App home switches to render `storeHomeSections`.

**Phase C — Commerce ops:**
discounts engine, orders expansion + GST invoice, customers view, analytics.

**Phase D — Deliveries:**
Shiprocket integration (serviceability → AWB → label → manifest → webhook tracking → NDR/RTO/returns), behind a `ShippingProvider` interface.

Each phase ships portal + app together, with previews for approval before build.

---

## 6. Audit additions (gaps found on review — 2026-07)

The blueprint above is a solid Shopify-grade spine. Reviewing it against the Indian
D2C market **and** Asktro's own ecosystem surfaced the following missing pieces.
Grouped by why they matter.

### 6A. Ecosystem tie-ins (Asktro's unfair advantage — no competitor store has these)
1. **Pay with Asktro Wallet.** Users already keep a wallet balance for consultations.
   Let them **check out with wallet balance** (full or part) and/or **earn wallet
   cashback** on Mall purchases. This recycles money inside the platform and makes the
   store dramatically stickier. Server-side: reuse the wallet ledger; add a `walletPaise`
   line to the order total, debited atomically at checkout.
2. **Consultation → product cross-sell.** After a call/chat, the astrologer (or a portal
   ops rule) can **recommend a product** to that user; it surfaces as "Recommended for
   you / by your astrologer" on home + as a nudge. And every product page gets a
   **"Talk to an astrologer about this"** CTA that deep-links into consultation. This is
   the flywheel: consultations sell products, products sell consultations.
3. **Buy-for-your-sign / chart-aware picks.** Use the birth data we already hold to show
   "Gemstone for your Rashi" style curation. (Phase C personalization; data already exists.)

### 6B. Revenue levers the draft omitted
4. **Wishlist / Save for later** — per-user favourites; drives re-engagement + "back in
   stock" and "price dropped" nudges. Model: `users/{uid}/wishlist/{productId}`.
5. **Abandoned-cart recovery** — persist the cart server-side; a scheduled function nudges
   (push/WhatsApp) after N hours. Single biggest recovered-revenue lever in D2C.
6. **Back-in-stock notify** — "Notify me" on out-of-stock variants → captured list →
   auto push when restocked. Feeds off the inventory we already track.
7. **Store search + filters + sort** — the storefront has a search icon but no engine.
   Needs product search (title/tag), filters (category, price, rating, in-stock) and sort
   (popularity/price/newest). At catalog scale, back it with a search index
   (Typesense/Algolia) rather than Firestore queries.

### 6C. India commerce/compliance must-haves
8. **COD decision.** COD is ~50–60% of Indian D2C orders. Current checkout is Razorpay-only.
   Either enable COD (with a COD fee + serviceability check via Shiprocket) or make a
   deliberate prepaid-only call. Flag in Settings; wire in Deliveries (Phase D).
9. **Customer returns & refund flow.** Not just RTO. A customer **requests a return** from
   the app → ops approves → **reverse pickup** (Shiprocket) → **refund to Asktro Wallet or
   source**. Ties to 6A#1 (wallet refund is instant + keeps money in-platform).
10. **Transactional notifications.** Branded **order-placed / shipped / out-for-delivery /
    delivered** messages over **push + WhatsApp/SMS** (India expects WhatsApp). Templated,
    triggered by order status transitions.
11. **GST invoice numbering + sales/GST report.** Sequential, per-financial-year invoice
    numbers (legal requirement); a **GST/sales report** export (by HSN, by period) for
    filing. Invoice is frozen at order time (already noted in §3.11) — add the numbering
    sequence + reporting.

### 6D. Operational polish (make "nothing static" safe + easy)
12. **Announcement bar** — a dismissible top strip ("Free shipping over ₹499", "Navratri
    sale live") as a Settings field, separate from the marquee claim strip.
13. **Draft → Preview → Publish** for the Storefront Builder — edit a `home_draft`, preview
    in a phone pane, then publish (copy draft→live or flip a `publishedVersionId`). Stops a
    half-edited home from going live. (Research-backed; strongly recommended.)
14. **Reusable asset uploader** — one image/video component → Storage → returns
    `{url, thumb, w, h, blurhash}`, with a **Storage-triggered thumbnail/blurhash function**
    so the app gets instant placeholders. Used by banners, media, testimonials, categories.
15. **Store-scoped roles + audit log.** A `store-manager` sub-role (orders/inventory yes,
    pricing/settings no); every catalog/price change written to the existing **audit log**.
16. **Sparse-integer `position`** (100, 200, 300…) on every ordered list so a reorder
    rewrites one field, not the whole collection. Cloud Functions own all rollups (ratings,
    collection materialization, category-path propagation, inventory decrements).

### 6E. Nice-to-haves (later)
17. **Product Q&A** ("Ask a question") distinct from reviews.
18. **Recently viewed** + **"You may also like"** (related already in §3.5; add recently-viewed).
19. **Shareable product deep-links** (Firebase Dynamic Links / share sheet) for WhatsApp virality.
20. **Gift options** (gift wrap, message) — low priority for this category.

### Data-model deltas these add
```
users/{uid}/wishlist/{productId}         addedAt
users/{uid}/cart                          items[], updatedAt   (server-persisted for recovery)
storeStockNotify/{id}                     uid, productId, variantId, createdAt, notifiedAt
storeReturns/{id}                         orderId, uid, items[], reason, status, refundMode(wallet|source), refundPaise, timeline[]
storeRecommendations/{id}                 uid, productId, source(astrologer|rule), sessionId, createdAt
config/store  += codEnabled, codFeePaise, announcement{text,active}, invoiceSeq, walletPayEnabled, cashbackPercent
storeOrders/{id} += walletPaise, codPaise, invoiceNo, notifications[]
```

**Net:** items **1, 2, 9, 10, 13, 14** are the highest-leverage — they are what make Asktro
Mall *not* a generic store clone. I recommend folding **1 (wallet pay), 2 (consult
cross-sell), 13 (draft/publish), 14 (asset pipeline)** into the phase plan now, and
scheduling **9, 10** with Deliveries (Phase D) and **4–8** into Phase C.
