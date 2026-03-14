import { Container, getContainer } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";

interface Env {
  WEB: Fetcher;
  LANDING: Fetcher;
  BACKEND: DurableObjectNamespace<BackendContainer>;
  // Non-sensitive vars
  LLM_PROVIDER: string;
  APPLE_MUSIC_TOKEN_TTL_SECONDS: string;
  APP_HOSTNAME: string;
  // Secrets
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_THINKING_BUDGET: string;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  APPLE_MUSIC_TEAM_ID: string;
  APPLE_MUSIC_KEY_ID: string;
  APPLE_MUSIC_PRIVATE_KEY: string;
  MINIMAX_API_KEY: string;
}

export class BackendContainer extends Container<Env> {
  defaultPort = 8001;
  sleepAfter = "5m";
  enableInternet = true;

  constructor(ctx: DurableObject["ctx"], env: Env) {
    super(ctx, env);
    this.envVars = {
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      DATABASE_URL: env.DATABASE_URL,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL,
      ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
      ANTHROPIC_THINKING_BUDGET: env.ANTHROPIC_THINKING_BUDGET,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      OPENAI_BASE_URL: env.OPENAI_BASE_URL,
      LLM_PROVIDER: env.LLM_PROVIDER,
      APPLE_MUSIC_TEAM_ID: env.APPLE_MUSIC_TEAM_ID,
      APPLE_MUSIC_KEY_ID: env.APPLE_MUSIC_KEY_ID,
      APPLE_MUSIC_PRIVATE_KEY: env.APPLE_MUSIC_PRIVATE_KEY,
      APPLE_MUSIC_TOKEN_TTL_SECONDS: env.APPLE_MUSIC_TOKEN_TTL_SECONDS,
      MINIMAX_API_KEY: env.MINIMAX_API_KEY,
    };
  }

  override onStart() {
    console.log("BackendContainer started on port 8001");
  }

  override onStop() {
    console.log("BackendContainer stopped");
  }

  override onError(error: unknown) {
    console.error("BackendContainer error:", error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const start = Date.now();

    // /api/waitlist → landing worker (waitlist API)
    if (url.pathname === "/api/waitlist") {
      return env.LANDING.fetch(request);
    }

    // /api/* → backend container
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/health") {
        return handleHealthCheck(env, start);
      }
      return proxyToContainer(request, env, url, start);
    }

    // Production: app.playheads.com → web worker directly
    if (env.APP_HOSTNAME && url.hostname === env.APP_HOSTNAME) {
      return env.WEB.fetch(request);
    }

    // /app/* → web worker (strip /app prefix)
    if (url.pathname.startsWith("/app")) {
      const webUrl = new URL(request.url);
      webUrl.pathname = url.pathname.replace(/^\/app/, "") || "/";
      return env.WEB.fetch(new Request(webUrl.toString(), request));
    }

    // Landing page: root path + landing-specific assets (/_astro/*)
    if (url.pathname === "/" || url.pathname.startsWith("/_astro/")) {
      // Logged-in users at root → redirect to app
      if (url.pathname === "/" && hasSessionCookie(request)) {
        if (env.APP_HOSTNAME) {
          return Response.redirect(`https://${env.APP_HOSTNAME}/`, 302);
        }
        return Response.redirect(`${url.origin}/app/`, 302);
      }
      return env.LANDING.fetch(request);
    }

    // Everything else → web worker (static assets, SPA routes)
    return env.WEB.fetch(request);
  },
};

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  return /sb-[^-]+-auth-token/.test(cookie);
}

async function handleHealthCheck(env: Env, start: number): Promise<Response> {
  let containerStatus = "unknown";
  try {
    const container = getContainer(env.BACKEND);
    const resp = await container.fetch(new Request("http://container/health"));
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;
      containerStatus = (data.status as string) || "healthy";
    } else {
      containerStatus = "unhealthy";
    }
  } catch {
    containerStatus = "unreachable";
  }

  return Response.json({
    status: containerStatus === "healthy" ? "healthy" : "degraded",
    worker: "healthy",
    container: containerStatus,
    latency_ms: Date.now() - start,
  });
}

async function proxyToContainer(
  request: Request,
  env: Env,
  url: URL,
  start: number
): Promise<Response> {
  const backendPath = url.pathname.replace(/^\/api/, "") || "/";
  const backendUrl = new URL(backendPath + url.search, "http://container");

  const container = getContainer(env.BACKEND);

  const proxyRequest = new Request(backendUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const response = await container.fetch(proxyRequest);
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
