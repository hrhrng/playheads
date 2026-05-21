// Plan definitions. Tier label is the source of truth in our DB —
// product IDs come from env so the same code runs against sandbox.polar.sh
// (Polar test) and api.polar.sh (live).
//
// Prices below are reference values only; the actual amount charged is
// whatever you set on the Polar product. Update both if they diverge.

import type { BillingEnv } from "./types.js";

export type Tier = "free" | "plus" | "pro";

export interface TierConfig {
  tier: Tier;
  /** Price in cents (USD), reference only — Polar product is the source of truth. */
  monthlyPriceCents: number;
  /** Env var holding the Polar product id. Undefined for free. */
  polarProductEnvKey?: keyof BillingEnv;
}

export const TIERS: Record<Tier, TierConfig> = {
  free: { tier: "free", monthlyPriceCents: 0 },
  plus: { tier: "plus", monthlyPriceCents: 999, polarProductEnvKey: "POLAR_PRODUCT_PLUS_ID" },
  pro:  { tier: "pro",  monthlyPriceCents: 1999, polarProductEnvKey: "POLAR_PRODUCT_PRO_ID"  },
};

export function tierFromProductId(env: BillingEnv, productId: string | null | undefined): Tier | null {
  if (!productId) return null;
  if (env.POLAR_PRODUCT_PLUS_ID && env.POLAR_PRODUCT_PLUS_ID === productId) return "plus";
  if (env.POLAR_PRODUCT_PRO_ID && env.POLAR_PRODUCT_PRO_ID === productId) return "pro";
  return null;
}
