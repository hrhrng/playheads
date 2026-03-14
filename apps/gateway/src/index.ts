interface Env {
  WEB: Fetcher;
  BACKEND_WORKER: Fetcher; // service binding (both production and preview)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const start = Date.now();

    // /api/* → backend worker
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/health") {
        return handleHealthCheck(env, url, start);
      }
      return proxyToBackend(request, env, url, start);
    }

    // Everything else → web worker (static assets + SPA)
    return env.WEB.fetch(request);
  },
};

async function handleHealthCheck(
  env: Env,
  url: URL,
  start: number
): Promise<Response> {
  try {
    const resp = await fetchBackend(env, "/health", "GET");
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;
      return Response.json({
        status: "healthy",
        container: data.status || "healthy",
        latency_ms: Date.now() - start,
      });
    }
    return Response.json(
      { status: "unhealthy", latency_ms: Date.now() - start },
      { status: 503 }
    );
  } catch {
    return Response.json(
      { status: "unreachable", latency_ms: Date.now() - start },
      { status: 503 }
    );
  }
}

async function proxyToBackend(
  request: Request,
  env: Env,
  url: URL,
  start: number
): Promise<Response> {
  const backendPath = url.pathname.replace(/^\/api/, "") || "/";

  const response = await fetchBackend(env, backendPath + url.search, request.method, request.headers, request.body);
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

async function fetchBackend(
  env: Env,
  path: string,
  method: string,
  headers?: Headers,
  body?: ReadableStream<Uint8Array> | null
): Promise<Response> {
  const req = new Request(new URL(path, "http://backend").toString(), {
    method,
    headers,
    body,
  });
  return env.BACKEND_WORKER.fetch(req);
}
