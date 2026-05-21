// Thin Polar SDK wrapper. Use the official @polar-sh/sdk for both REST
// calls and webhook signature verification.

import { Polar } from "@polar-sh/sdk";
import type { BillingEnv } from "./types.js";

export function polarClient(env: BillingEnv): Polar {
  if (!env.POLAR_API_KEY) {
    throw new Error("POLAR_API_KEY secret is not configured");
  }
  // Default to production unless POLAR_API_BASE explicitly points elsewhere.
  // Pass serverURL explicitly so a typo in POLAR_API_BASE fails loudly instead
  // of silently routing to production.
  const serverURL = env.POLAR_API_BASE ?? "https://api.polar.sh";
  return new Polar({ accessToken: env.POLAR_API_KEY, serverURL });
}

export interface CreateCheckoutInput {
  productId: string;
  /** Our user id — Polar echoes this back on every webhook as
   *  `customer.externalId`, used to route subscription updates. */
  externalCustomerId: string;
  customerEmail?: string;
  successUrl: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface PolarCheckoutResponse {
  id: string;
  url: string;
  status: string;
}

export async function createCheckout(
  env: BillingEnv,
  input: CreateCheckoutInput,
): Promise<PolarCheckoutResponse> {
  const polar = polarClient(env);
  const checkout = await polar.checkouts.create({
    products: [input.productId],
    externalCustomerId: input.externalCustomerId,
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
    successUrl: input.successUrl,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  return { id: checkout.id, url: checkout.url, status: checkout.status };
}

/**
 * Generate a one-time customer portal URL so the user can manage / cancel
 * their subscription on Polar's hosted UI. Polar issues a short-lived
 * authentication token bound to the customer.
 */
export async function createCustomerPortalUrl(
  env: BillingEnv,
  polarCustomerId: string,
): Promise<string> {
  const polar = polarClient(env);
  const session = await polar.customerSessions.create({ customerId: polarCustomerId });
  return session.customerPortalUrl;
}
