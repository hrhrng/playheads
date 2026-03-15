import { createAuth } from "@playheads/auth";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "@playheads/auth";
import { eq } from "drizzle-orm";
import { hasSessionCookie } from "./session";

interface Env {
  WEB: Fetcher;
  LANDING: Fetcher;
  BACKEND: Fetcher;
  ADMIN: Fetcher;
  DB: D1Database;
  APP_HOSTNAME: string;
  ADMIN_HOSTNAME: string;
  PREVIEW_DOMAIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS: string;
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

    // admin hostname → admin worker directly (must be before /api/* routing)
    if (env.ADMIN_HOSTNAME && url.hostname === env.ADMIN_HOSTNAME) {
      if (lane) return laneProxy("admin", lane, env.PREVIEW_DOMAIN, request);
      return env.ADMIN.fetch(request);
    }

    // /api/auth/* → better-auth handler
    if (url.pathname.startsWith("/api/auth")) {
      const db = drizzle(env.DB);
      const auth = createAuth(db, {
        BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: env.BETTER_AUTH_URL,
        BETTER_AUTH_TRUSTED_ORIGINS: env.BETTER_AUTH_TRUSTED_ORIGINS,
      });
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

    // Upsert: try update, if no rows affected, insert
    const existing = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.id, body.userId));

    if (existing.length > 0) {
      await db
        .update(schema.profile)
        .set({
          ...(body.displayName !== undefined && {
            displayName: body.displayName,
          }),
          ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
          ...(body.appleMusicToken !== undefined && {
            appleMusicToken: body.appleMusicToken,
          }),
          updatedAt: now,
        })
        .where(eq(schema.profile.id, body.userId));
    } else {
      await db.insert(schema.profile).values({
        id: body.userId,
        displayName: body.displayName ?? null,
        avatarUrl: body.avatarUrl ?? null,
        appleMusicToken: body.appleMusicToken ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [updated] = await db
      .select()
      .from(schema.profile)
      .where(eq(schema.profile.id, body.userId));

    return Response.json(updated);
  }

  return Response.json({ error: "method not allowed" }, { status: 405 });
}
