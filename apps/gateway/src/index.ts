import { createAuthWithApple } from "@playheads/auth";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "@playheads/auth";
import { eq } from "drizzle-orm";
import { hasSessionCookie } from "./session";
import {
  handleListConversations,
  handleCreateConversation,
  handleDeleteConversation,
  handleUpdateConversation,
  handleGetConversationTitle,
  handleGetConversation,
  handleCreateSession,
  handleGetState,
  handleSyncState,
  handleGetQueue,
  handleSyncQueue,
} from "./d1-handlers";
import { handleUploadImage, handleGetUpload } from "./uploads";

interface Env {
  WEB: Fetcher;
  LANDING: Fetcher;
  ADMIN: Fetcher;
  AGENT: Fetcher;
  DB: D1Database;
  UPLOADS: R2Bucket;
  /** Empty in production (uploads stay behind our gateway); set to a public
   *  r2.dev managed domain in preview so external LLM providers can fetch
   *  images without going through Cloudflare Access. */
  UPLOADS_PUBLIC_URL_BASE: string;
  APP_HOSTNAME: string;
  ADMIN_HOSTNAME: string;
  PREVIEW_DOMAIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS: string;
  APPLE_CLIENT_ID: string;
  APPLE_KEY_ID: string;
  APPLE_TEAM_ID: string;
  APPLE_PRIVATE_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
}

function laneProxy(
  type: "web" | "landing" | "admin",
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

    // admin hostname → admin worker directly (must be before /api/* routing)
    if (env.ADMIN_HOSTNAME && url.hostname === env.ADMIN_HOSTNAME) {
      if (lane) return laneProxy("admin", lane, env.PREVIEW_DOMAIN, request);
      return env.ADMIN.fetch(request);
    }

    // /agents/* → agent worker (WebSocket + HTTP for useAgentChat)
    if (url.pathname.startsWith("/agents/") && env.AGENT) {
      return env.AGENT.fetch(request);
    }

    // /api/auth/* → better-auth handler
    if (url.pathname.startsWith("/api/auth")) {
      const db = drizzle(env.DB);
      const auth = await createAuthWithApple(db, env);
      return auth.handler(request);
    }

    // /api/waitlist → landing worker (waitlist API)
    if (url.pathname === "/api/waitlist") {
      if (lane) return laneProxy("landing", lane, env.PREVIEW_DOMAIN, request);
      return env.LANDING.fetch(request);
    }

    // /api/profile → D1 profile CRUD
    if (url.pathname.startsWith("/api/profile")) {
      return handleProfile(request, env);
    }

    // /api/conversations/* → D1 native (no Python needed)
    if (url.pathname === "/api/conversations" && request.method === "GET") {
      return handleListConversations(request, env.DB);
    }
    if (url.pathname === "/api/conversations/create" && request.method === "POST") {
      return handleCreateConversation(request, env.DB);
    }
    if (url.pathname.match(/^\/api\/conversations\/[^/]+\/title$/) && request.method === "GET") {
      const id = url.pathname.split("/api/conversations/")[1].replace("/title", "");
      return handleGetConversationTitle(id, request, env.DB);
    }
    if (url.pathname.match(/^\/api\/conversations\/[^/]+$/) && request.method === "GET") {
      const id = url.pathname.split("/api/conversations/")[1];
      return handleGetConversation(id, request, env.DB);
    }
    if (url.pathname.startsWith("/api/conversations/") && request.method === "DELETE") {
      const id = url.pathname.split("/api/conversations/")[1];
      return handleDeleteConversation(id, request, env.DB);
    }
    if (url.pathname.startsWith("/api/conversations/") && request.method === "PATCH") {
      const id = url.pathname.split("/api/conversations/")[1];
      return handleUpdateConversation(id, request, env.DB);
    }

    // /api/session/create → D1 native
    if (url.pathname === "/api/session/create" && request.method === "POST") {
      return handleCreateSession(request, env.DB);
    }

    // /api/state → D1 native
    if (url.pathname === "/api/state" && request.method === "GET") {
      return handleGetState(request, env.DB);
    }

    // /api/state/sync → D1 native
    if (url.pathname === "/api/state/sync" && request.method === "POST") {
      return handleSyncState(request, env.DB);
    }

    // /api/queue → global user-level queue
    if (url.pathname === "/api/queue" && request.method === "GET") {
      return handleGetQueue(request, env.DB);
    }
    if (url.pathname === "/api/queue/sync" && request.method === "POST") {
      return handleSyncQueue(request, env.DB);
    }

    // /api/uploads/image → POST image to R2
    if (url.pathname === "/api/uploads/image" && request.method === "POST") {
      return handleUploadImage(request, env.UPLOADS, env.UPLOADS_PUBLIC_URL_BASE);
    }
    // /api/uploads/<key> → GET image from R2 (key includes "uploads/" prefix)
    if (url.pathname.startsWith("/api/uploads/") && request.method === "GET") {
      const key = url.pathname.replace(/^\/api\/uploads\//, "");
      return handleGetUpload(request, env.UPLOADS, key);
    }

    // /api/* → agent worker
    if (url.pathname.startsWith("/api/")) {
      const agentPath =
        url.pathname === "/api/health"
          ? "/health" + url.search
          : (url.pathname.replace(/^\/api/, "") || "/") + url.search;

      const agentReq = new Request(
        new URL(agentPath, "http://agent").toString(),
        {
          method: request.method,
          headers: request.headers,
          body: request.body,
        }
      );

      const response = await env.AGENT.fetch(agentReq);
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

    // app hostname → web worker directly
    if (env.APP_HOSTNAME && url.hostname === env.APP_HOSTNAME) {
      if (lane) return laneProxy("web", lane, env.PREVIEW_DOMAIN, request);
      return env.WEB.fetch(request);
    }

    // Landing page: root path + landing-specific assets
    if (url.pathname === "/" || url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/artists/")) {
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

async function handleProfile(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.DB);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return Response.json({ error: "userId required" }, { status: 400 });
    }

    const [p] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.id, userId));

    if (!p) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json(p);
  }

  if (request.method === "PUT") {
    const body = (await request.json()) as {
      userId: string;
      displayName?: string;
      avatarUrl?: string;
      appleMusicToken?: string;
    };

    if (!body.userId) {
      return Response.json({ error: "userId required" }, { status: 400 });
    }

    const now = Date.now();

    // Single upsert via INSERT ... ON CONFLICT — 1 query instead of 3
    await db
      .insert(schema.profile)
      .values({
        id: body.userId,
        displayName: body.displayName ?? null,
        avatarUrl: body.avatarUrl ?? null,
        appleMusicToken: body.appleMusicToken ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.profile.id,
        set: {
          ...(body.displayName !== undefined && {
            displayName: body.displayName,
          }),
          ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
          ...(body.appleMusicToken !== undefined && {
            appleMusicToken: body.appleMusicToken,
          }),
          updatedAt: now,
        },
      });

    const [updated] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.id, body.userId));

    return Response.json(updated);
  }

  return Response.json({ error: "method not allowed" }, { status: 405 });
}
