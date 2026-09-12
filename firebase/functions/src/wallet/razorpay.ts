/**
 * Razorpay helpers — order creation and HMAC-SHA256 signature verification.
 * The key secret and webhook secret live ONLY in Functions secrets, never in
 * the client. Verification is pure crypto so it is unit-testable.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';

/** Verify the checkout signature: HMAC_SHA256(order_id|payment_id, keySecret). */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  const expected = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/** Verify a Razorpay webhook body signature. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string,
): boolean {
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Create a Razorpay order for a recharge (amount in paise). */
export async function createOrder(
  keyId: string,
  keySecret: string,
  amountPaise: number,
  receipt: string,
  notes: Record<string, string>,
): Promise<{ id: string; amount: number; currency: string }> {
  const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  // Cap the SDK call so a slow Razorpay can't hang the paying user for the full
  // function timeout — fail fast into the callable's error path instead (the
  // customer just retries; no order/money is created on a timeout).
  const order = await Promise.race([
    instance.orders.create({ amount: amountPaise, currency: 'INR', receipt, notes }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Razorpay order timed out')), 15_000)),
  ]);
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}
