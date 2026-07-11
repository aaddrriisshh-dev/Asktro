/**
 * Alert delivery — forwards every new `alerts/{id}` doc to Slack so a human
 * actually sees it, instead of it sitting unread in Firestore.
 *
 * The money/trust paths already WRITE alert rows (payment-credit-failed, refund
 * clawback shortfall, user reports, flagged messages). This trigger is the
 * delivery leg: on each new alert it posts a formatted message to the Slack
 * incoming webhook. It fires on CREATE only, so the retry paths that re-`set`
 * the same fixed-id alert doc (e.g. `credit_<paymentId>`) don't re-notify.
 *
 * Set the webhook URL once, then deploy this function:
 *   firebase functions:secrets:set SLACK_ALERT_WEBHOOK
 *   firebase deploy --only functions:deliverAlert
 * Delivery is best-effort: a Slack outage never throws back into Firestore.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

export const SLACK_ALERT_WEBHOOK = defineSecret('SLACK_ALERT_WEBHOOK');

export const deliverAlert = onDocumentCreated(
  { document: 'alerts/{alertId}', secrets: [SLACK_ALERT_WEBHOOK] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const a = snap.data() ?? {};

    const webhook = SLACK_ALERT_WEBHOOK.value();
    if (!webhook) {
      // Not configured yet — log and move on; the alert is still safe in Firestore.
      logger.warn('deliverAlert: SLACK_ALERT_WEBHOOK not set — alert not delivered', {
        alertId: event.params.alertId,
      });
      return;
    }

    const severity = String(a.severity ?? 'info');
    const emoji = severity === 'critical' ? '🔴' : severity === 'warning' ? '⚠️' : 'ℹ️';
    const kind = String(a.kind ?? 'alert');
    const message = String(a.message ?? '(no message)');
    const refId = a.refId ? String(a.refId) : '';

    // Critical alerts (payment not credited, etc.) force-notify every member of
    // the channel with <!channel>; warnings stay quiet so the channel isn't spammy.
    const mention = severity === 'critical' ? '<!channel> ' : '';
    const text =
      `${mention}${emoji} *${severity.toUpperCase()} — ${kind}*\n` +
      `${message}` +
      (refId ? `\n\`ref: ${refId}\`` : '') +
      `\n_Asktro · alert ${event.params.alertId}_`;

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.error('deliverAlert: Slack post failed', {
          alertId: event.params.alertId,
          status: res.status,
          body: body.slice(0, 200),
        });
      }
    } catch (e) {
      logger.error('deliverAlert: Slack post threw', {
        alertId: event.params.alertId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
);
