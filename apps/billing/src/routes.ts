// HTTP handlers for /api/billing/* and /api/webhooks/polar.
//
// Auth model: routes that need to know the user (summary, checkout,
// portal) read userId from a query-param or JSON body. The web client
// always has the userId from useAuth() in hand, so it just passes it
// along — same pattern as /api/profile and /api/conversations.

import { TIERS, type Tier } from "./tiers.js";
import { createCheckout, createCustomerPortalUrl } from "./polar.js";
import {
  verifyAndParse,
  recordEventOrSkip,
  markProcessed,
  dispatch,
  WebhookVerificationError,
} from "./webhook.js";
import type { BillingEnv } from "./types.js";

interface SubscriptionRow {
  id: string;
  tier: string;
  status: string;
  polarCustomerId: string;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: number;
}

async function activeSubscription(env: BillingEnv, userId: string): Promise<SubscriptionRow | null> {
  return await env.DB.prepare(
    `SELECT id, tier, status, polarCustomerId, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd
       FROM subscription
      WHERE userId = ?
        AND status IN ('active', 'trialing', 'past_due')
      ORDER BY createdAt DESC
      LIMIT 1`,
  )
    .bind(userId)
    .first<SubscriptionRow>();
}

// GET /api/billing/summary?userId=...
export async function handleSummary(request: Request, env: BillingEnv): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const sub = await activeSubscription(env, userId);
  const tier: Tier = (sub?.tier as Tier) ?? "free";

  return Response.json({
    tier,
    status: sub?.status ?? "none",
    current_period_start: sub?.currentPeriodStart ?? null,
    current_period_end: sub?.currentPeriodEnd ?? null,
    cancel_at_period_end: !!sub?.cancelAtPeriodEnd,
    has_customer: !!sub?.polarCustomerId,
  });
}

// POST /api/billing/checkout { userId, tier, customerEmail? }
export async function handleCreateCheckout(request: Request, env: BillingEnv): Promise<Response> {
  const body = await request.json<{
    userId?: string;
    tier?: Tier;
    customerEmail?: string;
    successUrl?: string;
  }>().catch(() => ({} as Record<string, never>));

  if (!body.userId) return Response.json({ error: "userId required" }, { status: 400 });
  if (body.tier !== "plus" && body.tier !== "pro") {
    return Response.json({ error: "tier must be 'plus' or 'pro'" }, { status: 400 });
  }

  const tierCfg = TIERS[body.tier];
  const envKey = tierCfg.polarProductEnvKey;
  const productId = envKey ? (env[envKey] as string | undefined) : undefined;
  if (!productId) {
    return Response.json(
      { error: `Polar product not configured for tier '${body.tier}'` },
      { status: 500 },
    );
  }

  const appOrigin = env.APP_ORIGIN ?? new URL(request.url).origin;
  const successUrl = body.successUrl ?? `${appOrigin}/?checkout=success`;

  try {
    const checkout = await createCheckout(env, {
      productId,
      externalCustomerId: body.userId,
      customerEmail: body.customerEmail,
      successUrl,
      metadata: { user_id: body.userId, tier: body.tier },
    });
    return Response.json({
      checkout_id: checkout.id,
      checkout_url: checkout.url,
      status: checkout.status,
    });
  } catch (err) {
    console.error(`[billing] createCheckout failed: ${(err as Error)?.message ?? err}`);
    return Response.json({ error: "checkout creation failed" }, { status: 502 });
  }
}

// POST /api/billing/portal { userId }
export async function handleCreatePortal(request: Request, env: BillingEnv): Promise<Response> {
  const body = await request.json<{ userId?: string }>().catch(() => ({} as Record<string, never>));
  if (!body.userId) return Response.json({ error: "userId required" }, { status: 400 });

  const sub = await activeSubscription(env, body.userId);
  if (!sub?.polarCustomerId) {
    return Response.json({ error: "no active subscription" }, { status: 404 });
  }

  try {
    const portalUrl = await createCustomerPortalUrl(env, sub.polarCustomerId);
    return Response.json({ portal_url: portalUrl });
  } catch (err) {
    console.error(`[billing] customer portal failed: ${(err as Error)?.message ?? err}`);
    return Response.json({ error: "portal creation failed" }, { status: 502 });
  }
}

// POST /api/webhooks/polar
export async function handlePolarWebhook(request: Request, env: BillingEnv): Promise<Response> {
  if (!env.POLAR_WEBHOOK_SECRET) {
    console.error("[billing] POLAR_WEBHOOK_SECRET is not configured");
    return Response.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  // Read raw body BEFORE parsing — the HMAC is over the exact bytes.
  const rawBody = await request.text();
  const headerObj: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headerObj[k.toLowerCase()] = v;
  });

  let event;
  try {
    event = verifyAndParse(rawBody, headerObj, env.POLAR_WEBHOOK_SECRET);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return Response.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(`[billing] webhook parse failed: ${(err as Error)?.message ?? err}`);
    return Response.json({ error: "malformed event" }, { status: 400 });
  }

  const webhookId = headerObj["webhook-id"];
  if (!webhookId) return Response.json({ error: "missing webhook-id header" }, { status: 400 });

  const fresh = await recordEventOrSkip(env, webhookId, event.type, rawBody);
  if (!fresh) return Response.json({ ok: true, deduplicated: true });

  try {
    await dispatch(env, event);
    await markProcessed(env, webhookId);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error(`[billing] webhook dispatch failed for ${webhookId} (${event.type}): ${msg}`);
    await markProcessed(env, webhookId, msg);
    // Still 200 — Polar retry won't fix a code bug. Manual reprocess
    // via polarWebhookEvent.processError if needed.
  }
  return Response.json({ ok: true });
}
