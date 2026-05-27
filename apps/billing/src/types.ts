// Subset of the gateway Env this module needs. Keep narrow so the
// module is testable without the full gateway Env.
export interface BillingEnv {
  DB: D1Database;

  // Public (vars in wrangler.*.toml):
  /** "https://api.polar.sh" (prod) or "https://sandbox-api.polar.sh" (test). */
  POLAR_API_BASE?: string;
  POLAR_ORG_ID?: string;
  POLAR_PRODUCT_PLUS_ID?: string;
  POLAR_PRODUCT_PRO_ID?: string;
  /** Origin to redirect the user back to after checkout. e.g. https://app.playheads.ai */
  APP_ORIGIN?: string;

  // Secrets (wrangler secret put):
  POLAR_API_KEY?: string;
  POLAR_WEBHOOK_SECRET?: string;
}
