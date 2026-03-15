interface Env {
  WEB: Fetcher;
  LANDING: Fetcher;
  BACKEND: Fetcher;
  ADMIN: Fetcher;
  APP_HOSTNAME: string;
  ADMIN_HOSTNAME: string;
  PREVIEW_DOMAIN: string; // e.g. "pw.playheads.ai", empty in production
}

function laneProxy(
  type: "web" | "landing" | "backend" | "admin",
  lane: string,
  previewDomain: string,
  request: Request,
  path?: string
): Promise<Response> {
  const target = new URL(request.url);
  target.hostname = `${type}-${lane}.${previewDomain}`;
  if (path !== undefined) {
    target.pathname = path;
  }
  return fetch(new Request(target.toString(), request));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const start = Date.now();

    // Lane routing: only active when PREVIEW_DOMAIN is set
    const lane =
      env.PREVIEW_DOMAIN && request.headers.get("X-Lane")
        ? request.headers.get("X-Lane")!
        : null;

    // /api/waitlist → landing worker (waitlist API)
    if (url.pathname === "/api/waitlist") {
      if (lane) return laneProxy("landing", lane, env.PREVIEW_DOMAIN, request);
      return env.LANDING.fetch(request);
    }

    // /api/* → backend worker
    if (url.pathname.startsWith("/api/")) {
      const backendPath =
        url.pathname === "/api/health"
          ? "/health" + url.search
          : (url.pathname.replace(/^\/api/, "") || "/") + url.search;

      if (lane) {
        const target = new URL(request.url);
        target.hostname = `backend-${lane}.${env.PREVIEW_DOMAIN}`;
        target.pathname = backendPath.split("?")[0];
        target.search = url.search;
        const backendReq = new Request(target.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
        return fetch(backendReq);
      }

      const backendReq = new Request(
        new URL(backendPath, "http://backend").toString(),
        {
          method: request.method,
          headers: request.headers,
          body: request.body,
        }
      );

      const response = await env.BACKEND.fetch(backendReq);
      const latency = Date.now() - start;

      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          method: request.method,
          path: url.pathname,
          status: response.status,
          latency_ms: latency,
        })
      );

      return response;
    }

    // admin hostname → admin worker directly
    if (env.ADMIN_HOSTNAME && url.hostname === env.ADMIN_HOSTNAME) {
      if (lane) return laneProxy("admin", lane, env.PREVIEW_DOMAIN, request);
      return env.ADMIN.fetch(request);
    }

    // app hostname → web worker directly
    if (env.APP_HOSTNAME && url.hostname === env.APP_HOSTNAME) {
      if (lane) return laneProxy("web", lane, env.PREVIEW_DOMAIN, request);
      return env.WEB.fetch(request);
    }

    // Landing page: root path + landing-specific assets (/_astro/*)
    if (url.pathname === "/" || url.pathname.startsWith("/_astro/")) {
      // Logged-in users at root → redirect to app
      if (url.pathname === "/" && hasSessionCookie(request)) {
        if (env.APP_HOSTNAME) {
          return Response.redirect(`https://${env.APP_HOSTNAME}/`, 302);
        }
      }
      if (lane) return laneProxy("landing", lane, env.PREVIEW_DOMAIN, request);
      return env.LANDING.fetch(request);
    }

    // Everything else → web worker (static assets, SPA routes)
    if (lane) return laneProxy("web", lane, env.PREVIEW_DOMAIN, request);
    return env.WEB.fetch(request);
  },
};

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  return /sb-[^-]+-auth-token/.test(cookie);
}
