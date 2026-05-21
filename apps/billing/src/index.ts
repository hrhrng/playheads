// Billing worker entry — bound to the gateway as `BILLING` and reached
// via service binding (NOT a public custom domain). The gateway is the
// only direct caller; Polar webhooks come in through the gateway too,
// then get forwarded here. Keeping billing off the public internet
// means we don't need a separate domain or WAF rule.
//
// Routes:
//   GET  /billing/summary?userId=...
//   POST /billing/checkout       { userId, tier, customerEmail? }
//   POST /billing/portal         { userId }
//   POST /webhooks/polar         (Polar Standard-Webhooks signed body)
//
// Gateway proxies under /api/* — it strips the /api prefix before
// forwarding so our handlers see /billing/* and /webhooks/polar.

import {
  handleSummary,
  handleCreateCheckout,
  handleCreatePortal,
  handlePolarWebhook,
} from "./routes.js";
import type { BillingEnv } from "./types.js";

export default {
  async fetch(request: Request, env: BillingEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/billing/summary" && request.method === "GET") {
      return handleSummary(request, env);
    }
    if (url.pathname === "/billing/checkout" && request.method === "POST") {
      return handleCreateCheckout(request, env);
    }
    if (url.pathname === "/billing/portal" && request.method === "POST") {
      return handleCreatePortal(request, env);
    }
    if (url.pathname === "/webhooks/polar" && request.method === "POST") {
      return handlePolarWebhook(request, env);
    }
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  },
};
