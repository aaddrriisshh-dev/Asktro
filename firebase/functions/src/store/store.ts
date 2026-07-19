/**
 * AstroMall store — physical-goods checkout.
 *
 *  - createStoreOrder (callable): server builds the cart total from REAL
 *    storeProducts docs (client never supplies prices), creates a Razorpay
 *    order, and writes a `storeOrders` doc in `pending_payment` + a
 *    `storeOrderBindings` doc so the webhook can resolve the payment later.
 *  - verifyStoreOrder (callable): verifies the checkout signature and marks the
 *    order paid (idempotent), decrementing stock in a transaction.
 *  - confirmStoreOrderPaid: shared idempotent "mark paid" used by both the
 *    callable and the razorpay webhook backstop (see wallet/recharge.ts).
 *
 * Physical goods are paid via Razorpay (NOT Google/Apple IAP) — this is exactly
 * what both stores require for tangible products, and it reuses the same money
 * plumbing already trusted for wallet recharges.
 */
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db, FieldValue } from '../common/admin';
import { Collections } from '../common/collections';
import { assertAuthed, badRequest, failedPrecondition, notFound } from '../common/errors';
import { enforceRateLimit } from '../common/rateLimit';
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from '../common/secrets';
import { createOrder, verifyPaymentSignature } from '../wallet/razorpay';

// Shipping defaults; overridable in `config/store` ({ shippingFeePaise,
// freeShippingThresholdPaise }) without a redeploy.
const DEFAULT_SHIPPING_PAISE = 4900; // ₹49 flat
const DEFAULT_FREE_SHIPPING_THRESHOLD_PAISE = 49900; // free over ₹499
const MAX_QTY_PER_ITEM = 10;

interface CartLine { productId: string; qty: number }
interface Address {
  name: string; phone: string; line1: string; line2?: string;
  city: string; state: string; pincode: string; landmark?: string;
}

function cleanAddress(raw: unknown): Address {
  const a = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const addr: Address = {
    name: s(a.name), phone: s(a.phone), line1: s(a.line1), line2: s(a.line2),
    city: s(a.city), state: s(a.state), pincode: s(a.pincode), landmark: s(a.landmark),
  };
  if (!addr.name || !addr.phone || !addr.line1 || !addr.city || !addr.state || !addr.pincode) {
    badRequest('A complete delivery address (name, phone, address, city, state, pincode) is required.');
  }
  if (!/^\d{6}$/.test(addr.pincode)) badRequest('Enter a valid 6-digit pincode.');
  if (!/^\+?\d[\d\s-]{7,14}$/.test(addr.phone)) badRequest('Enter a valid phone number.');
  return addr;
}

/**
 * Resolve the shipping fee for a destination. A per-region zone (matched by the
 * delivery state) overrides the flat fee and, optionally, the free-shipping
 * threshold; otherwise the global config (or built-in defaults) applies. A
 * coupon that waives shipping, or crossing the free-shipping threshold, makes it
 * free. All values are read from `config/store` — never trusted from the client.
 */
function resolveShipping(
  cfg: Record<string, unknown>,
  state: string,
  subtotalPaise: number,
  couponFreeShip: boolean,
): number {
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
  const zones = Array.isArray(cfg.zones) ? (cfg.zones as Record<string, unknown>[]) : [];
  const zone = zones.find(
    (z) => Array.isArray(z.states) && (z.states as unknown[]).some((zs) => norm(zs) === norm(state)),
  );

  const baseFee = Math.round(Number(cfg.shippingFeePaise ?? DEFAULT_SHIPPING_PAISE));
  const freeEnabled = cfg.freeShippingEnabled !== false;
  const baseFree = freeEnabled
    ? Math.round(Number(cfg.freeShippingThresholdPaise ?? DEFAULT_FREE_SHIPPING_THRESHOLD_PAISE))
    : 0;

  const fee = zone && Number.isFinite(Number(zone.feePaise)) ? Math.round(Number(zone.feePaise)) : baseFee;
  const freeOver = zone && Number(zone.freeThresholdPaise) > 0
    ? Math.round(Number(zone.freeThresholdPaise))
    : baseFree;

  if (couponFreeShip) return 0;
  if (freeOver > 0 && subtotalPaise >= freeOver) return 0;
  return Math.max(0, fee);
}

/**
 * Validate a coupon code against the cart subtotal and return the discount.
 * Server-authoritative — the client never supplies the discount amount. Throws a
 * clear failedPrecondition if the code is invalid/expired/below the minimum.
 */
async function applyCoupon(
  code: string,
  subtotalPaise: number,
): Promise<{ code: string; discountPaise: number; freeShipping: boolean }> {
  const snap = await db.collection(Collections.storeCoupons).doc(code).get();
  if (!snap.exists) failedPrecondition('That coupon code is not valid.');
  const c = snap.data()!;
  if (c.active === false) failedPrecondition('That coupon is no longer active.');
  const exp = typeof c.expiresAt?.toMillis === 'function'
    ? c.expiresAt.toMillis()
    : (typeof c.expiresAt === 'number' ? c.expiresAt : 0);
  if (exp && Date.now() > exp) failedPrecondition('That coupon has expired.');
  const minCart = Math.round(Number(c.minCartPaise) || 0);
  if (subtotalPaise < minCart) {
    failedPrecondition(`Add ₹${Math.ceil((minCart - subtotalPaise) / 100)} more to use this coupon.`);
  }
  const usageLimit = Math.round(Number(c.usageLimit) || 0);
  const usedCount = Math.round(Number(c.usedCount) || 0);
  if (usageLimit > 0 && usedCount >= usageLimit) failedPrecondition('This coupon has reached its usage limit.');

  let discount = 0;
  if (c.type === 'percent') {
    discount = Math.round((subtotalPaise * (Number(c.value) || 0)) / 100);
    const cap = Math.round(Number(c.maxDiscountPaise) || 0);
    if (cap > 0) discount = Math.min(discount, cap);
  } else {
    discount = Math.round(Number(c.value) || 0); // fixed amount in paise
  }
  discount = Math.max(0, Math.min(discount, subtotalPaise));
  return { code, discountPaise: discount, freeShipping: c.freeShipping === true };
}

/** Allocate the next human-readable order number (AST-100001, …). */
async function nextOrderNo(): Promise<string> {
  const ref = db.collection(Collections.counters).doc('storeOrders');
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = ((snap.data()?.value ?? 100000) as number) + 1;
    tx.set(ref, { value: next }, { merge: true });
    return next;
  });
  return `AST-${seq}`;
}

export const createStoreOrder = onCall(
  { secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] },
  async (req) => {
    const userId = assertAuthed(req);
    await enforceRateLimit('createStoreOrder', userId);
    const { items, address, couponCode: rawCoupon } =
      (req.data ?? {}) as { items?: CartLine[]; address?: unknown; couponCode?: unknown };
    if (!Array.isArray(items) || items.length === 0) badRequest('Your cart is empty.');
    if (items.length > 50) badRequest('Too many items in one order.');
    const deliverTo = cleanAddress(address);

    // Build the order from authoritative product docs — the client's prices are
    // never trusted. Collapse duplicate productIds and clamp per-item quantity.
    const wanted = new Map<string, number>();
    for (const it of items) {
      const pid = typeof it?.productId === 'string' ? it.productId : '';
      const qty = Math.max(1, Math.min(MAX_QTY_PER_ITEM, Math.round(Number(it?.qty) || 0)));
      if (!pid) badRequest('Invalid item in cart.');
      wanted.set(pid, Math.min(MAX_QTY_PER_ITEM, (wanted.get(pid) ?? 0) + qty));
    }

    const lines: Array<{
      productId: string; title: string; image: string | null;
      pricePaise: number; qty: number; lineTotalPaise: number;
    }> = [];
    let subtotalPaise = 0;
    for (const [pid, qty] of wanted) {
      const snap = await db.collection(Collections.storeProducts).doc(pid).get();
      if (!snap.exists) notFound(`A product in your cart is no longer available.`);
      const p = snap.data()!;
      if (p.active === false) failedPrecondition(`"${p.title ?? 'A product'}" is no longer available.`);
      const price: number = Math.round(Number(p.pricePaise) || 0);
      if (price <= 0) failedPrecondition(`"${p.title ?? 'A product'}" is not purchasable right now.`);
      // Soft stock check — only block when stock is explicitly tracked and 0.
      if (typeof p.stock === 'number' && p.stock < qty) {
        failedPrecondition(`"${p.title ?? 'A product'}" is out of stock.`);
      }
      const lineTotal = price * qty;
      subtotalPaise += lineTotal;
      lines.push({
        productId: pid,
        title: (p.title as string) ?? 'Product',
        image: (Array.isArray(p.images) && p.images[0]) ? String(p.images[0]) : null,
        pricePaise: price, qty, lineTotalPaise: lineTotal,
      });
    }

    // Coupon (server-validated; discount never trusted from the client).
    const couponCode = typeof rawCoupon === 'string' ? rawCoupon.trim().toUpperCase() : '';
    let discountPaise = 0;
    let appliedCoupon = '';
    let couponFreeShip = false;
    if (couponCode) {
      const applied = await applyCoupon(couponCode, subtotalPaise);
      discountPaise = applied.discountPaise;
      appliedCoupon = applied.code;
      couponFreeShip = applied.freeShipping;
    }

    // Shipping (config-overridable, per-region aware; a coupon may waive it).
    const cfg = (await db.doc('config/store').get()).data() ?? {};
    const shippingPaise = resolveShipping(cfg, deliverTo.state, subtotalPaise, couponFreeShip);
    const totalPaise = subtotalPaise - discountPaise + shippingPaise;
    if (totalPaise <= 0) failedPrecondition('Order total must be greater than zero.');

    const orderNo = await nextOrderNo();
    const storeOrderRef = db.collection(Collections.storeOrders).doc();

    const rzp = await createOrder(
      RAZORPAY_KEY_ID.value(),
      RAZORPAY_KEY_SECRET.value(),
      totalPaise,
      `st_${userId.slice(0, 8)}_${storeOrderRef.id.slice(0, 10)}`,
      { userId, storeOrderId: storeOrderRef.id, type: 'store' },
    );

    await storeOrderRef.set({
      orderNo,
      userId,
      items: lines,
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      subtotalPaise,
      shippingPaise,
      discountPaise,
      couponCode: appliedCoupon || null,
      totalPaise,
      address: deliverTo,
      status: 'pending_payment',
      razorpayOrderId: rzp.id,
      paymentId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: [{ status: 'pending_payment', at: Date.now() }],
    });
    // Binding the webhook resolves against (payment.captured → order_id).
    await db.collection(Collections.storeOrderBindings).doc(rzp.id).set({
      storeOrderId: storeOrderRef.id, userId, totalPaise,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      storeOrderId: storeOrderRef.id,
      orderNo,
      orderId: rzp.id,
      amount: rzp.amount,
      currency: rzp.currency,
      keyId: RAZORPAY_KEY_ID.value(),
      subtotalPaise, shippingPaise, discountPaise, totalPaise,
      couponCode: appliedCoupon || null,
    };
  },
);

export const verifyStoreOrder = onCall(
  { secrets: [RAZORPAY_KEY_SECRET] },
  async (req) => {
    const userId = assertAuthed(req);
    await enforceRateLimit('verifyStoreOrder', userId);
    const { orderId, paymentId, signature } = (req.data ?? {}) as {
      orderId?: string; paymentId?: string; signature?: string;
    };
    if (!orderId || !paymentId || !signature) {
      badRequest('orderId, paymentId, signature are required.');
    }
    if (!verifyPaymentSignature(orderId!, paymentId!, signature!, RAZORPAY_KEY_SECRET.value())) {
      failedPrecondition('PAYMENT_SIGNATURE_INVALID');
    }

    const bind = (await db.collection(Collections.storeOrderBindings).doc(orderId!).get()).data();
    if (!bind) failedPrecondition('ORDER_NOT_FOUND');
    if (bind!.userId !== userId) failedPrecondition('ORDER_OWNER_MISMATCH');

    const result = await confirmStoreOrderPaid(bind!.storeOrderId as string, paymentId!, 'callable');
    return result;
  },
);

/**
 * Idempotently mark a store order paid + confirmed and decrement stock. Safe to
 * call twice (callable + webhook race) — a second call is a no-op. Never throws
 * on an already-paid order.
 */
export async function confirmStoreOrderPaid(
  storeOrderId: string,
  paymentId: string,
  source: 'callable' | 'webhook',
): Promise<{ storeOrderId: string; orderNo: string; status: string; alreadyPaid: boolean }> {
  return db.runTransaction(async (tx) => {
    const ref = db.collection(Collections.storeOrders).doc(storeOrderId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`storeOrder ${storeOrderId} missing`);
    const o = snap.data()!;
    const orderNo = (o.orderNo as string) ?? storeOrderId;
    if (o.status !== 'pending_payment') {
      // Already handled by the other path — idempotent no-op.
      return { storeOrderId, orderNo, status: o.status as string, alreadyPaid: true };
    }

    // Read every product first (Firestore requires all reads before writes).
    const lines = (o.items as Array<{ productId: string; qty: number }>) ?? [];
    const prodSnaps = await Promise.all(
      lines.map((l) => tx.get(db.collection(Collections.storeProducts).doc(l.productId))),
    );

    tx.update(ref, {
      status: 'confirmed',
      paymentId,
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({ status: 'confirmed', at: Date.now(), source }),
    });

    // Decrement stock only where it is explicitly tracked (numeric). Clamp at 0
    // so a race can't push it negative; an oversell is fixed by the admin, never
    // by blocking a paid customer.
    lines.forEach((l, i) => {
      const ps = prodSnaps[i];
      if (ps.exists && typeof ps.data()!.stock === 'number') {
        const left = Math.max(0, (ps.data()!.stock as number) - l.qty);
        tx.update(ps.ref, { stock: left });
      }
    });

    // Count coupon usage only on a paid order (never on abandoned checkouts).
    const coupon = o.couponCode as string | undefined;
    if (coupon) {
      tx.set(
        db.collection(Collections.storeCoupons).doc(coupon),
        { usedCount: FieldValue.increment(1) },
        { merge: true },
      );
      // Immutable per-order redemption record (keyed by orderId → written exactly
      // once, since confirmStoreOrderPaid early-returns on an already-confirmed
      // order). Gives an audit trail and lets checkout enforce a per-user coupon
      // limit against real redemptions instead of only the global usedCount.
      tx.set(db.collection('storeCouponRedemptions').doc(storeOrderId), {
        couponCode: coupon,
        userId: (o.userId as string) ?? null,
        orderId: storeOrderId,
        redeemedAt: FieldValue.serverTimestamp(),
      });
    }

    logger.info('store order confirmed', { storeOrderId, orderNo, paymentId, source });
    return { storeOrderId, orderNo, status: 'confirmed', alreadyPaid: false };
  });
}

/**
 * Webhook backstop: if a captured Razorpay payment belongs to a store order
 * (resolvable via storeOrderBindings), confirm it and return true. Returns false
 * for anything that isn't a store order, so the caller falls through to the
 * recharge path unchanged.
 */
export async function tryConfirmStoreCapture(
  entity: { id?: string; order_id?: string; amount?: number },
): Promise<boolean> {
  const orderId = entity.order_id;
  const paymentId = entity.id;
  if (!orderId || !paymentId) return false;
  const bind = (await db.collection(Collections.storeOrderBindings).doc(orderId).get()).data();
  if (!bind) return false; // not a store order — let the recharge path handle it
  // Amount guard: a store binding whose captured amount differs from what we
  // bound is suspicious — do NOT confirm; leave it pending for manual review.
  if (typeof entity.amount === 'number' && typeof bind.totalPaise === 'number' && entity.amount !== bind.totalPaise) {
    logger.error('store webhook: captured amount != bound total', { orderId, paymentId, captured: entity.amount, bound: bind.totalPaise });
    return true; // it IS a store order (handled = true) — just not auto-confirmed
  }
  try {
    await confirmStoreOrderPaid(bind.storeOrderId as string, paymentId, 'webhook');
  } catch (e) {
    logger.error('store webhook: confirm failed', { orderId, paymentId, error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}
