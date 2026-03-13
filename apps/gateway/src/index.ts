import { Container } from "@cloudflare/containers";

interface Env {
  WEB: Fetcher;
  BACKEND: DurableObjectNamespace;
  // Non-sensitive vars
  LLM_PROVIDER: string;
  APPLE_MUSIC_TOKEN_TTL_SECONDS: string;
  // Secrets
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  APPLE_MUSIC_TEAM_ID: string;
  APPLE_MUSIC_KEY_ID: string;
  APPLE_MUSIC_PRIVATE_KEY: string;
  MINIMAX_API_KEY: string;
}

export class BackendContainer extends Container {
  defaultPort = 8001;
  sleepAfter = "5m";

  override getEnv(env: Env): Record<string, string> {
    return {
      DATABASE_URL: env.DATABASE_URL,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const start = Date.now();

    // /api/* → backend container
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/health") {
        return handleHealthCheck(env, start);
      }
      return proxyToContainer(request, env, url, start);
    }

    // Everything else → web worker (static assets + SPA)
    return env.WEB.fetch(request);
  },
};

async function handleHealthCheck(env: Env, start: number): Promise<Response> {
  let containerStatus = "unknown";
  try {
    const id = env.BACKEND.idFromName("backend");
    const stub = env.BACKEND.get(id);
    const resp = await stub.fetch(new Request("http://container/health"));
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

  const id = env.BACKEND.idFromName("backend");
  const stub = env.BACKEND.get(id);

  const proxyRequest = new Request(backendUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const response = await stub.fetch(proxyRequest);
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
