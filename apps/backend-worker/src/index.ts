import { Container, getContainer } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";

interface Env {
  BACKEND: DurableObjectNamespace<BackendContainer>;
  // Non-sensitive vars
  LLM_PROVIDER: string;
  APPLE_MUSIC_TOKEN_TTL_SECONDS: string;
  // Secrets
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  DATABASE_URL: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  D1_DATABASE_ID: string;
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
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
      D1_DATABASE_ID: env.D1_DATABASE_ID,
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

    console.log(JSON.stringify({
      event: "request_start",
      method: request.method,
      path: url.pathname,
      has_BACKEND: !!env.BACKEND,
      BACKEND_type: typeof env.BACKEND,
      env_keys: Object.keys(env).filter(k => !["SUPABASE_KEY", "DATABASE_URL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "APPLE_MUSIC_PRIVATE_KEY", "MINIMAX_API_KEY"].includes(k)),
    }));

    if (!env.BACKEND) {
      console.error("env.BACKEND is undefined — DO binding missing");
      return Response.json({ error: "BACKEND binding not configured" }, { status: 503 });
    }

    if (url.pathname === "/health") {
      let containerStatus = "unknown";
      try {
        const container = getContainer(env.BACKEND);
        const resp = await container.fetch(
          new Request("http://container/health")
        );
        if (resp.ok) {
          const data = (await resp.json()) as Record<string, unknown>;
          containerStatus = (data.status as string) || "healthy";
        } else {
          containerStatus = "unhealthy";
        }
      } catch (e) {
        console.error("Health check failed:", e);
        containerStatus = "unreachable";
      }

      return Response.json({
        status: containerStatus === "healthy" ? "healthy" : "degraded",
        worker: "healthy",
        container: containerStatus,
        latency_ms: Date.now() - start,
      });
    }

    try {
      const container = getContainer(env.BACKEND);
      console.log(JSON.stringify({
        event: "got_container",
        container_type: typeof container,
        has_CF_ACCOUNT_ID: !!env.CLOUDFLARE_ACCOUNT_ID,
        has_CF_API_TOKEN: !!env.CLOUDFLARE_API_TOKEN,
        has_D1_DATABASE_ID: !!env.D1_DATABASE_ID,
      }));

      const backendUrl = new URL(
        url.pathname + url.search,
        "http://container"
      );

      const proxyRequest = new Request(backendUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      const response = await container.fetch(proxyRequest);
      const latency = Date.now() - start;

      console.log(JSON.stringify({
        event: "request_done",
        method: request.method,
        path: url.pathname,
        status: response.status,
        latency_ms: latency,
      }));

      return response;
    } catch (e) {
      const latency = Date.now() - start;
      console.error(JSON.stringify({
        event: "request_error",
        method: request.method,
        path: url.pathname,
        error: String(e),
        stack: (e as Error).stack,
        latency_ms: latency,
      }));
      return Response.json({ error: String(e) }, { status: 502 });
    }
  },
};
