// Polar webhook handling. Standard Webhooks signature verification +
// payload parsing delegated to @polar-sh/sdk.

import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { tierFromProductId } from "./tiers.js";
import type { BillingEnv } from "./types.js";

export { WebhookVerificationError };

// Trimmed to the events we care about. Polar emits many more — ignored
// events still return 200 to avoid the retry loop, but only the cases
// below mutate our DB.
export type PolarEvent =
  | { type: "subscription.created"; data: Subscription }
  | { type: "subscription.active"; data: Subscription }
  | { type: "subscription.updated"; data: Subscription }
  | { type: "subscription.uncanceled"; data: Subscription }
  | { type: "subscription.canceled"; data: Subscription }
  | { type: "subscription.revoked"; data: Subscription }
  | { type: "subscription.past_due"; data: Subscription }
  | { type: string; data: unknown };

export function verifyAndParse(
  body: string,
  headers: Record<string, string>,
  secret: string,
): PolarEvent {
  return validateEvent(body, headers, secret) as unknown as PolarEvent;
}

export async function recordEventOrSkip(
  env: BillingEnv,
  webhookId: string,
  type: string,
  rawBody: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO polarWebhookEvent
       (eventId, type, payloadJson, receivedAt)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(webhookId, type, rawBody, Date.now())
    .run();
  const changes = (result.meta as { changes?: number } | undefined)?.changes;
  return (changes ?? 0) > 0;
}

export async function markProcessed(
  env: BillingEnv,
  webhookId: string,
  error?: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE polarWebhookEvent SET processedAt = ?, processError = ? WHERE eventId = ?`,
  )
    .bind(Date.now(), error ?? null, webhookId)
    .run();
}

export async function dispatch(env: BillingEnv, ev: PolarEvent): Promise<void> {
  switch (ev.type) {
    case "subscription.created":
    case "subscription.active":
    case "subscription.updated":
    case "subscription.uncanceled":
      await upsertSubscription(env, ev.data as Subscription, ev.type);
      return;
    case "subscription.canceled":
    case "subscription.revoked":
    case "subscription.past_due":
      await markSubscriptionEnded(env, ev.data as Subscription, ev.type);
      return;
    default:
      // order.* / refund.* / checkout.* etc. — informational for us.
      console.log(`[billing] ignored webhook type: ${ev.type}`);
  }
}

async function upsertSubscription(
  env: BillingEnv,
  sub: Subscription,
  eventType: string,
): Promise<void> {
  const userId = sub.customer?.externalId;
  if (!userId) {
    console.warn(`[billing] ${eventType} missing customer.externalId: ${sub.id}`);
    return;
  }
  const tier = tierFromProductId(env, sub.productId);
  if (!tier) {
    console.warn(
      `[billing] ${eventType} on unknown product ${sub.productId} — sub ${sub.id} not stored`,
    );
    return;
  }
  const status =
    eventType === "subscription.uncanceled" ? "active" : (sub.status ?? "active");

  const id = `sub_${crypto.randomUUID()}`;
  const now = Date.now();
  const periodStart = sub.currentPeriodStart ? new Date(sub.currentPeriodStart).getTime() : null;
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;

  await env.DB.prepare(
    `INSERT INTO subscription (
       id, userId, polarSubscriptionId, polarCustomerId, polarProductId,
       tier, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd,
       createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(polarSubscriptionId) DO UPDATE SET
       tier = excluded.tier,
       status = excluded.status,
       currentPeriodStart = excluded.currentPeriodStart,
       currentPeriodEnd = excluded.currentPeriodEnd,
       cancelAtPeriodEnd = excluded.cancelAtPeriodEnd,
       updatedAt = excluded.updatedAt`,
  )
    .bind(
      id,
      userId,
      sub.id,
      sub.customerId ?? "",
      sub.productId ?? "",
      tier,
      status,
      periodStart,
      periodEnd,
      sub.cancelAtPeriodEnd ? 1 : 0,
      now,
      now,
    )
    .run();
}

async function markSubscriptionEnded(
  env: BillingEnv,
  sub: Subscription,
  eventType: string,
): Promise<void> {
  const status = eventType.replace("subscription.", "");
  await env.DB.prepare(
    `UPDATE subscription
        SET status = ?, cancelAtPeriodEnd = ?, updatedAt = ?
      WHERE polarSubscriptionId = ?`,
  )
    .bind(status, sub.cancelAtPeriodEnd ? 1 : 0, Date.now(), sub.id)
    .run();
}
