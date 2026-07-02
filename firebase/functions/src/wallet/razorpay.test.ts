import { createHmac } from 'crypto';
import { verifyPaymentSignature, verifyWebhookSignature } from './razorpay';

const SECRET = 'test_secret_123';

describe('verifyPaymentSignature', () => {
  const orderId = 'order_ABC';
  const paymentId = 'pay_XYZ';
  const valid = createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

  it('accepts a correct signature', () => {
    expect(verifyPaymentSignature(orderId, paymentId, valid, SECRET)).toBe(true);
  });
  it('rejects a tampered signature', () => {
    expect(verifyPaymentSignature(orderId, paymentId, valid.replace(/.$/, '0'), SECRET)).toBe(false);
  });
  it('rejects a wrong secret', () => {
    expect(verifyPaymentSignature(orderId, paymentId, valid, 'other')).toBe(false);
  });
  it('rejects garbage input safely', () => {
    expect(verifyPaymentSignature(orderId, paymentId, 'not-hex', SECRET)).toBe(false);
    expect(verifyPaymentSignature(orderId, paymentId, '', SECRET)).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ event: 'payment.captured', id: 'pay_1' });
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');

  it('accepts a correct webhook signature', () => {
    expect(verifyWebhookSignature(body, sig, SECRET)).toBe(true);
  });
  it('rejects an altered body', () => {
    expect(verifyWebhookSignature(body + ' ', sig, SECRET)).toBe(false);
  });
});
