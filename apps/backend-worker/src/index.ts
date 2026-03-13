import { Container, getContainer } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";

interface Env {
  BACKEND: DurableObjectNamespace<BackendContainer>;
  LLM_PROVIDER: string;
  APPLE_MUSIC_TOKEN_TTL_SECONDS: string;
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
    const container = getContainer(env.BACKEND);

    if (url.pathname === "/health") {
      try {
        const resp = await container.fetch(
          new Request("http://container/health")
        );
        if (resp.ok) {
          const data = (await resp.json()) as Record<string, unknown>;
          return Response.json({
            status: "healthy",
            container: data.status || "healthy",
          });
        }
        return Response.json({ status: "unhealthy" }, { status: 503 });
      } catch {
        return Response.json({ status: "unreachable" }, { status: 503 });
      }
    }

    // Proxy everything to the container
    const containerUrl = new URL(url.pathname + url.search, "http://container");
    return container.fetch(
      new Request(containerUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })
    );
  },
};
