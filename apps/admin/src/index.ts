import { drizzle } from "drizzle-orm/d1";
import { schema } from "@playheads/auth";
import { eq, inArray, count, asc } from "drizzle-orm";
import { MODEL_REGISTRY, CALLER_TYPES } from "@playheads/llm-config";

interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  ADMIN_ENCRYPTION_KEY?: string; // 32-byte hex, used for AES-256-GCM key encryption
}

// ---------------------------------------------------------------------------
// LLM Provider Config types
// ---------------------------------------------------------------------------
interface LlmProviderRow {
  id: string;
  name: string;
  providerType: string;
  model: string;
  gateway: string;          // 'direct' | 'cf_ai_gateway'
  gatewayAccountId: string | null;
  gatewayId: string | null;
  apiKey: string;           // encrypted; for CF gateway, store CF_AIG_TOKEN here
  baseUrl: string | null;
  thinkingEnabled: number;  // 0 | 1
  isActive: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Search Provider Config types
// ---------------------------------------------------------------------------
interface SearchProviderRow {
  id: string;
  name: string;
  providerType: string; // 'brave' | 'tavily' | 'none'
  apiKey: string; // encrypted
  isActive: number;
  createdAt: number;
  updatedAt: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Auto-migrate: create config tables if missing
    try {
      await ensureLlmTable(env);
      await ensureSearchTable(env);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(`DB init error: ${msg}`, { status: 500 });
    }

    if (url.pathname === "/") return serveHTML();
    if (url.pathname === "/api/waitlist" && request.method === "GET") return handleList(request, env);
    if (url.pathname === "/api/waitlist" && request.method === "PATCH") return handleAction(request, env);
    if (url.pathname === "/api/invite" && request.method === "POST") return handleInvite(request, env);

    // LLM config endpoints
    if (url.pathname === "/api/llm-config" && request.method === "GET") return handleLlmList(env);
    if (url.pathname === "/api/llm-config" && request.method === "POST") return handleLlmCreate(request, env);
    const llmEditMatch = url.pathname.match(/^\/api\/llm-config\/([^/]+)$/);
    if (llmEditMatch) {
      const id = llmEditMatch[1];
      if (request.method === "PATCH") return handleLlmUpdate(id, request, env);
      if (request.method === "DELETE") return handleLlmDelete(id, env);
    }
    const llmActivateMatch = url.pathname.match(/^\/api\/llm-config\/([^/]+)\/activate$/);
    if (llmActivateMatch && request.method === "POST") return handleLlmActivate(llmActivateMatch[1], env);
    const llmTestMatch = url.pathname.match(/^\/api\/llm-config\/([^/]+)\/test$/);
    if (llmTestMatch && request.method === "POST") return handleLlmTest(llmTestMatch[1], env);

    // LLM caller binding endpoints
    if (url.pathname === "/api/llm-callers" && request.method === "GET") return handleCallerList(env);
    if (url.pathname === "/api/llm-callers" && request.method === "PUT") return handleCallerUpdate(request, env);

    // Model registry endpoint (for frontend)
    if (url.pathname === "/api/model-registry" && request.method === "GET") return handleModelRegistry();

    // Search config endpoints
    if (url.pathname === "/api/search-config" && request.method === "GET") return handleSearchList(env);
    if (url.pathname === "/api/search-config" && request.method === "POST") return handleSearchCreate(request, env);
    const searchEditMatch = url.pathname.match(/^\/api\/search-config\/([^/]+)$/);
    if (searchEditMatch) {
      const id = searchEditMatch[1];
      if (request.method === "PATCH") return handleSearchUpdate(id, request, env);
      if (request.method === "DELETE") return handleSearchDelete(id, env);
    }
    const searchActivateMatch = url.pathname.match(/^\/api\/search-config\/([^/]+)\/activate$/);
    if (searchActivateMatch && request.method === "POST") return handleSearchActivate(searchActivateMatch[1], env);

    return new Response("Not found", { status: 404 });
  },
};

// --- Email ---

async function sendApprovalEmail(apiKey: string, to: string): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "The Playheads <auth@playheads.ai>",
      to,
      subject: "You're in! Welcome to The Playheads",
      html: [
        '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:32px 0">',
        '<h1 style="font-size:24px;font-weight:600;margin-bottom:16px">You\'re in! 🎵</h1>',
        '<p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:24px">Great news — your spot on The Playheads is ready. You can now sign in and start listening.</p>',
        '<a href="https://playheads.ai" style="display:inline-block;background:#111827;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px">Open The Playheads</a>',
        '<p style="font-size:14px;color:#9ca3af;margin-top:32px">See you inside,<br>The Playheads Team</p>',
        "</div>",
      ].join(""),
    }),
  });
}

// --- API ---

async function handleList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  const db = drizzle(env.DB);

  // Build query
  let query = db.select().from(schema.waitlist).orderBy(asc(schema.waitlist.createdAt)).limit(limit).offset(offset);
  if (statusFilter) {
    query = query.where(eq(schema.waitlist.status, statusFilter)) as typeof query;
  }
  const data = await query;

  // Count totals
  const countAll = async (s?: string) => {
    let q = db.select({ value: count() }).from(schema.waitlist);
    if (s) q = q.where(eq(schema.waitlist.status, s)) as typeof q;
    const [r] = await q;
    return r?.value ?? 0;
  };

  const [totalAll, pending, approved, rejected] = await Promise.all([
    countAll(), countAll("pending"), countAll("approved"), countAll("rejected"),
  ]);

  const total = statusFilter
    ? { "pending": pending, "approved": approved, "rejected": rejected }[statusFilter] ?? totalAll
    : totalAll;

  return Response.json({
    data,
    pagination: { page, limit, total },
    stats: { total: totalAll, pending, approved, rejected },
  });
}

async function handleAction(request: Request, env: Env): Promise<Response> {
  const { ids, action } = (await request.json()) as { ids: string[]; action: string };
  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "ids[] required" }, { status: 400 });
  }
  if (!["approve", "reject"].includes(action)) {
    return Response.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  const db = drizzle(env.DB);
  const now = Date.now();
  const newStatus = action === "approve" ? "approved" : "rejected";

  const updates: Record<string, unknown> = {
    status: newStatus,
    updatedAt: now,
  };
  if (action === "approve") {
    updates.approvedAt = now;
    updates.approvedBy = "admin";
  }

  await db.update(schema.waitlist).set(updates).where(inArray(schema.waitlist.id, ids));

  // Sync waitlist approval to user table + send notification emails
  if (action === "approve") {
    const entries = await db.select({ email: schema.waitlist.email })
      .from(schema.waitlist)
      .where(inArray(schema.waitlist.id, ids));

    for (const entry of entries) {
      await syncWaitlistApproval(db, entry.email);
      if (env.RESEND_API_KEY) {
        await sendApprovalEmail(env.RESEND_API_KEY, entry.email);
      }
    }
  }

  return Response.json({ success: true, updated: ids.length });
}

async function handleInvite(request: Request, env: Env): Promise<Response> {
  const { email } = (await request.json()) as { email: string };
  if (!email || typeof email !== "string") {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return Response.json({ error: "Invalid email format" }, { status: 400 });
  }

  const db = drizzle(env.DB);
  const now = Date.now();

  const [existing] = await db.select({ id: schema.waitlist.id, status: schema.waitlist.status })
    .from(schema.waitlist)
    .where(eq(schema.waitlist.email, normalized));

  if (existing) {
    if (existing.status === "approved") {
      return Response.json({ success: true, message: "Already approved" });
    }
    await db.update(schema.waitlist).set({
      status: "approved", approvedAt: now, approvedBy: "admin", updatedAt: now,
    }).where(eq(schema.waitlist.id, existing.id));
  } else {
    await db.insert(schema.waitlist).values({
      id: crypto.randomUUID(), email: normalized, status: "approved",
      approvedAt: now, approvedBy: "admin", createdAt: now, updatedAt: now,
    });
  }

  await syncWaitlistApproval(db, normalized);

  // Send approval notification email
  if (env.RESEND_API_KEY) {
    await sendApprovalEmail(env.RESEND_API_KEY, normalized);
  }

  return Response.json({ success: true, message: `${normalized} has been granted access` });
}

async function syncWaitlistApproval(db: ReturnType<typeof drizzle>, email: string): Promise<void> {
  // Update the user's waitlistApproved field in better-auth user table
  const [user] = await db.select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email.toLowerCase()));

  if (!user) return;

  await db.update(schema.user).set({ waitlistApproved: true })
    .where(eq(schema.user.id, user.id));
}

// ---------------------------------------------------------------------------
// LLM Config — DB migration
// ---------------------------------------------------------------------------

async function ensureLlmTable(env: Env): Promise<void> {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS llm_provider_config (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    providerType     TEXT NOT NULL,
    model            TEXT NOT NULL,
    gateway          TEXT NOT NULL DEFAULT 'direct',
    gatewayAccountId TEXT,
    gatewayId        TEXT,
    apiKey           TEXT NOT NULL,
    baseUrl          TEXT,
    thinkingEnabled  INTEGER NOT NULL DEFAULT 0,
    isActive         INTEGER NOT NULL DEFAULT 0,
    createdAt        INTEGER NOT NULL,
    updatedAt        INTEGER NOT NULL
  )`).run();

  // Migration: add thinkingEnabled column if missing (existing installs)
  try {
    await env.DB.prepare("SELECT thinkingEnabled FROM llm_provider_config LIMIT 1").first();
  } catch {
    await env.DB.prepare("ALTER TABLE llm_provider_config ADD COLUMN thinkingEnabled INTEGER NOT NULL DEFAULT 0").run();
  }

  // Caller → Resource binding table
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS llm_caller_config (
    callerType TEXT PRIMARY KEY,
    resourceId TEXT,
    updatedAt  INTEGER NOT NULL
  )`).run();
}

// ---------------------------------------------------------------------------
// LLM Config — Encryption (AES-256-GCM via Web Crypto)
// ---------------------------------------------------------------------------

async function getEncKey(env: Env): Promise<CryptoKey | null> {
  const hex = env.ADMIN_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) return null;
  const raw = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(text: string, env: Env): Promise<string> {
  const key = await getEncKey(env);
  if (!key) return text; // no key configured → store plaintext (dev mode)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  const buf = new Uint8Array(12 + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...buf));
}

async function decrypt(encoded: string, env: Env): Promise<string> {
  const key = await getEncKey(env);
  if (!key) return encoded;
  try {
    const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const iv = buf.slice(0, 12);
    const ct = buf.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return encoded; // not encrypted (legacy plaintext)
  }
}

function maskKey(k: string): string {
  if (k.length <= 4) return "••••";
  return "••••" + k.slice(-4);
}

// ---------------------------------------------------------------------------
// LLM Config — API handlers
// ---------------------------------------------------------------------------

async function handleLlmList(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT * FROM llm_provider_config ORDER BY isActive DESC, createdAt ASC"
  ).all<LlmProviderRow>();

  const data = await Promise.all((rows.results || []).map(async (r) => ({
    ...r,
    apiKey: maskKey(await decrypt(r.apiKey, env)),
  })));

  return Response.json({ data });
}

async function handleLlmCreate(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Partial<LlmProviderRow>;
  const requiresApiKey = body.gateway !== "cf_ai_gateway";
  if (!body.providerType || !body.model || (requiresApiKey && !body.apiKey)) {
    return Response.json({ error: "providerType, model, apiKey required" }, { status: 400 });
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  const encKey = await encrypt(body.apiKey || "", env);
  await env.DB.prepare(
    `INSERT INTO llm_provider_config (id,name,providerType,model,gateway,gatewayAccountId,gatewayId,apiKey,baseUrl,thinkingEnabled,isActive,createdAt,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)`
  ).bind(id, body.name || body.providerType, body.providerType, body.model,
    body.gateway || "direct", body.gatewayAccountId || null, body.gatewayId || null,
    encKey, body.baseUrl || null, body.thinkingEnabled ? 1 : 0, now, now).run();
  return Response.json({ success: true, id });
}

async function handleLlmUpdate(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Partial<LlmProviderRow>;
  const now = Date.now();
  const updates: string[] = ["updatedAt = ?"];
  const vals: unknown[] = [now];

  if (body.name !== undefined) { updates.push("name = ?"); vals.push(body.name); }
  if (body.providerType !== undefined) { updates.push("providerType = ?"); vals.push(body.providerType); }
  if (body.model !== undefined) { updates.push("model = ?"); vals.push(body.model); }
  if (body.gateway !== undefined) { updates.push("gateway = ?"); vals.push(body.gateway); }
  if (body.gatewayAccountId !== undefined) { updates.push("gatewayAccountId = ?"); vals.push(body.gatewayAccountId || null); }
  if (body.gatewayId !== undefined) { updates.push("gatewayId = ?"); vals.push(body.gatewayId || null); }
  if (body.apiKey !== undefined && body.apiKey && !body.apiKey.startsWith("••••")) {
    updates.push("apiKey = ?"); vals.push(await encrypt(body.apiKey, env));
  }
  if (body.baseUrl !== undefined) { updates.push("baseUrl = ?"); vals.push(body.baseUrl || null); }
  if (body.thinkingEnabled !== undefined) { updates.push("thinkingEnabled = ?"); vals.push(body.thinkingEnabled ? 1 : 0); }

  vals.push(id);
  await env.DB.prepare(`UPDATE llm_provider_config SET ${updates.join(", ")} WHERE id = ?`).bind(...vals).run();
  return Response.json({ success: true });
}

async function handleLlmDelete(id: string, env: Env): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM llm_provider_config WHERE id = ?").bind(id),
    env.DB.prepare("UPDATE llm_caller_config SET resourceId = NULL WHERE resourceId = ?").bind(id),
  ]);
  return Response.json({ success: true });
}

async function handleLlmActivate(id: string, env: Env): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare("UPDATE llm_provider_config SET isActive = 0, updatedAt = ?").bind(Date.now()),
    env.DB.prepare("UPDATE llm_provider_config SET isActive = 1, updatedAt = ? WHERE id = ?").bind(Date.now(), id),
  ]);
  return Response.json({ success: true });
}

async function handleLlmTest(id: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT * FROM llm_provider_config WHERE id = ?"
  ).bind(id).first<LlmProviderRow>();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const apiKey = await decrypt(row.apiKey, env);
  const isGateway = row.gateway === "cf_ai_gateway";

  if (!apiKey) {
    return Response.json({
      success: false,
      error: "No API key stored — when using CF AI Gateway without an explicit key, the agent uses its CF_AIG_TOKEN env var (not testable from admin)",
    });
  }

  try {
    if (row.providerType === "anthropic") {
      // Mirror agent: use gatewayAccountId/gatewayId from row (same as DB config path)
      const baseURL = (isGateway && row.gatewayAccountId && row.gatewayId)
        ? `https://gateway.ai.cloudflare.com/v1/${row.gatewayAccountId}/${row.gatewayId}/anthropic`
        : "https://api.anthropic.com";
      const res = await fetch(`${baseURL}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: row.model,
          max_tokens: 8,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      const body = await res.json() as Record<string, unknown>;
      if (res.ok) return Response.json({ success: true, model: body["model"] });
      return Response.json({ success: false, error: (body["error"] as Record<string,unknown>)?.["message"] || res.statusText });
    } else {
      // OpenAI-compatible — mirror agent URL logic
      const baseURL = row.baseUrl ||
        (row.providerType === "doubao" ? "https://ark.cn-beijing.volces.com/api/v3" : "https://api.openai.com/v1");
      let finalBaseURL = baseURL;
      if (isGateway && row.gatewayAccountId && row.gatewayId) {
        const cfBase = `https://gateway.ai.cloudflare.com/v1/${row.gatewayAccountId}/${row.gatewayId}`;
        finalBaseURL = row.providerType === "openai" ? `${cfBase}/openai` : `${cfBase}/openai-compatible`;
      }
      const res = await fetch(`${finalBaseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: row.model,
          max_tokens: 8,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      const body = await res.json() as Record<string, unknown>;
      if (res.ok) return Response.json({ success: true, model: (body["model"] as string) || row.model });
      const err = body["error"] as Record<string, unknown> | undefined;
      return Response.json({ success: false, error: (err?.["message"] as string) || res.statusText });
    }
  } catch (e) {
    return Response.json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
}

// ---------------------------------------------------------------------------
// LLM Caller binding — API handlers
// ---------------------------------------------------------------------------

async function handleCallerList(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT callerType, resourceId FROM llm_caller_config"
  ).all<{ callerType: string; resourceId: string | null }>();
  return Response.json({ data: rows.results || [] });
}

async function handleCallerUpdate(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { callerType: string; resourceId: string | null };
  if (!body.callerType || !CALLER_TYPES.includes(body.callerType as "chat" | "title")) {
    return Response.json({ error: "Invalid callerType" }, { status: 400 });
  }
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO llm_caller_config (callerType, resourceId, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(callerType) DO UPDATE SET resourceId = excluded.resourceId, updatedAt = excluded.updatedAt`
  ).bind(body.callerType, body.resourceId || null, now).run();
  return Response.json({ success: true });
}

function handleModelRegistry(): Response {
  const cards = Object.fromEntries(
    Object.entries(MODEL_REGISTRY).map(([id, card]) => [
      id,
      {
        label: card.label,
        group: card.group,
        sdk: card.sdk,
        providerType: id.split("/")[0],
        modelId: card.modelId,
        hasThinking: !!card.thinking,
        defaultBaseUrl: card.defaultBaseUrl || null,
      },
    ])
  );
  return Response.json({ data: cards });
}

// ---------------------------------------------------------------------------
// Search Config — DB migration
// ---------------------------------------------------------------------------

async function ensureSearchTable(env: Env): Promise<void> {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS search_provider_config (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    providerType TEXT NOT NULL,
    apiKey       TEXT NOT NULL DEFAULT '',
    isActive     INTEGER NOT NULL DEFAULT 0,
    createdAt    INTEGER NOT NULL,
    updatedAt    INTEGER NOT NULL
  )`).run();
}

// ---------------------------------------------------------------------------
// Search Config — API handlers
// ---------------------------------------------------------------------------

async function handleSearchList(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT * FROM search_provider_config ORDER BY isActive DESC, createdAt ASC"
  ).all<SearchProviderRow>();

  const data = await Promise.all((rows.results || []).map(async (r) => ({
    ...r,
    apiKey: r.apiKey ? maskKey(await decrypt(r.apiKey, env)) : "",
  })));

  return Response.json({ data });
}

async function handleSearchCreate(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Partial<SearchProviderRow>;
  if (!body.providerType) {
    return Response.json({ error: "providerType required" }, { status: 400 });
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  const encKey = body.apiKey ? await encrypt(body.apiKey, env) : "";
  await env.DB.prepare(
    `INSERT INTO search_provider_config (id,name,providerType,apiKey,isActive,createdAt,updatedAt) VALUES (?,?,?,?,0,?,?)`
  ).bind(id, body.name || body.providerType, body.providerType, encKey, now, now).run();
  return Response.json({ success: true, id });
}

async function handleSearchUpdate(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Partial<SearchProviderRow>;
  const now = Date.now();
  const updates: string[] = ["updatedAt = ?"];
  const vals: unknown[] = [now];

  if (body.name !== undefined) { updates.push("name = ?"); vals.push(body.name); }
  if (body.providerType !== undefined) { updates.push("providerType = ?"); vals.push(body.providerType); }
  if (body.apiKey !== undefined && body.apiKey && !body.apiKey.startsWith("••••")) {
    updates.push("apiKey = ?"); vals.push(await encrypt(body.apiKey, env));
  }

  vals.push(id);
  await env.DB.prepare(`UPDATE search_provider_config SET ${updates.join(", ")} WHERE id = ?`).bind(...vals).run();
  return Response.json({ success: true });
}

async function handleSearchDelete(id: string, env: Env): Promise<Response> {
  await env.DB.prepare("DELETE FROM search_provider_config WHERE id = ?").bind(id).run();
  return Response.json({ success: true });
}

async function handleSearchActivate(id: string, env: Env): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare("UPDATE search_provider_config SET isActive = 0, updatedAt = ?").bind(Date.now()),
    env.DB.prepare("UPDATE search_provider_config SET isActive = 1, updatedAt = ? WHERE id = ?").bind(Date.now(), id),
  ]);
  return Response.json({ success: true });
}

// --- HTML ---

function serveHTML(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" href="data:image/png;base64,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" />
<title>The Playheads Admin</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; color: #111827; font-size: 14px; }

  /* Layout */
  .app { display: flex; height: 100vh; background: #f8f9fb; }

  /* Sidebar */
  .sidebar { width: 220px; background: #111827; color: #fff; display: flex; flex-direction: column; flex-shrink: 0; }
  .sidebar-brand { padding: 20px 20px 24px; display: flex; align-items: center; gap: 10px; }
  .sidebar-brand h1 { font-size: 16px; font-weight: 600; letter-spacing: -0.3px; }
  .sidebar-brand span { font-size: 10px; background: rgba(255,255,255,0.12); padding: 2px 8px; border-radius: 4px; font-weight: 500; color: #9ca3af; }
  .sidebar-nav { flex: 1; padding: 0 8px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; cursor: pointer; color: #9ca3af; font-size: 13px; font-weight: 500; transition: all 0.15s; margin-bottom: 2px; border: none; background: none; width: 100%; text-align: left; }
  .nav-item:hover { color: #fff; background: rgba(255,255,255,0.06); }
  .nav-item.active { color: #fff; background: rgba(255,255,255,0.1); }
  .nav-item svg { width: 18px; height: 18px; opacity: 0.7; }
  .nav-item.active svg { opacity: 1; }
  /* Main */
  .main { flex: 1; overflow-y: auto; }
  .main-header { padding: 20px 32px; border-bottom: 1px solid #eee; background: #fff; display: flex; justify-content: space-between; align-items: center; }
  .main-header h2 { font-size: 16px; font-weight: 600; }
  .main-body { padding: 24px 32px; }

  /* Buttons */
  .btn { padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; cursor: pointer; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s; }
  .btn-primary { background: #111; color: #fff; }
  .btn-primary:hover { background: #333; }
  .btn-green { background: #dcfce7; color: #15803d; }
  .btn-green:hover { background: #bbf7d0; }
  .btn-red { background: #fef2f2; color: #b91c1c; }
  .btn-red:hover { background: #fecaca; }
  .btn-ghost { background: #f3f4f6; color: #6b7280; }
  .btn-ghost:hover { background: #e5e7eb; }
  .btn-ghost.active { background: #111; color: #fff; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat { padding: 18px; border-radius: 12px; background: #fff; border: 1px solid #f0f0f0; }
  .stat-num { font-size: 28px; font-weight: 600; }
  .stat-label { font-size: 12px; margin-top: 4px; color: #9ca3af; }

  /* Toolbar */
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 8px; }
  .filters { display: flex; gap: 6px; }
  .bulk { display: flex; gap: 6px; }

  /* Table */
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #f0f0f0; }
  th { text-align: left; padding: 10px 14px; font-size: 11px; color: #9ca3af; font-weight: 500; border-bottom: 1px solid #f0f0f0; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 11px 14px; border-bottom: 1px solid #fafafa; }
  tr:hover td { background: #fafbfc; }
  .email-cell { font-family: "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .badge { font-size: 11px; padding: 2px 10px; border-radius: 999px; display: inline-block; font-weight: 500; }
  .badge-pending { background: #fefce8; color: #a16207; }
  .badge-approved { background: #dcfce7; color: #15803d; }
  .badge-rejected { background: #fef2f2; color: #b91c1c; }
  .date { color: #9ca3af; font-size: 12px; }
  .actions { text-align: right; }
  .actions .btn { margin-left: 4px; }
  .pagination { display: flex; justify-content: center; gap: 8px; margin-top: 16px; align-items: center; }
  .pagination span { font-size: 12px; color: #9ca3af; }
  .empty { text-align: center; color: #9ca3af; padding: 48px; }

  /* Modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(2px); }
  .modal { background: #fff; border-radius: 16px; width: 100%; max-width: 420px; padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
  .modal h3 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .modal p { font-size: 13px; color: #6b7280; margin-bottom: 20px; }
  .modal .form-group { margin-bottom: 16px; }
  .modal label { font-size: 12px; font-weight: 500; color: #6b7280; display: block; margin-bottom: 6px; }
  .modal input { width: 100%; height: 42px; padding: 0 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; outline: none; }
  .modal input:focus { border-color: #111; box-shadow: 0 0 0 3px rgba(17,17,17,0.06); }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .modal .msg { padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  .msg-ok { background: #dcfce7; color: #15803d; }
  .msg-err { background: #fef2f2; color: #b91c1c; }

  /* Toast */
  .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 200; box-shadow: 0 4px 20px rgba(0,0,0,0.12); animation: toast-in 0.3s ease; }
  @keyframes toast-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>
</head>
<body>
<div id="app"></div>
<script>
// State
let currentPage = 'waitlist';
let entries = [];
let stats = { total: 0, pending: 0, approved: 0, rejected: 0 };
let filter = '';
let page = 1;
let totalPages = 1;
let selected = new Set();
let loading = false;
let showInviteModal = false;
let inviteMsg = '';
let inviteMsgType = '';

// LLM Config state
let llmProviders = [];
let llmLoading = false;
let llmModal = null; // null | { mode: 'add'|'edit', data: {} }
let llmMsg = '';
let llmMsgType = '';
let llmKeyVisible = false;

// Search Config state
let searchProviders = [];
let searchLoading = false;
let searchModal = null; // null | { mode: 'add'|'edit', data: {} }
let searchMsg = '';
let searchMsgType = '';
let searchKeyVisible = false;

const SEARCH_PROVIDER_PRESETS = {
  brave:  { label: 'Brave Search', keyLabel: 'API Key', keyPlaceholder: 'BSAxxxxxxxx' },
  tavily: { label: 'Tavily', keyLabel: 'API Key', keyPlaceholder: 'tvly-...' },
  none:   { label: 'None (disabled)', keyLabel: 'API Key (not needed)', keyPlaceholder: '' },
};

// Model cards loaded from /api/model-registry (shared from @playheads/llm-config)
let MODEL_CARDS = {};
// Caller bindings state
let callerBindings = []; // [{ callerType, resourceId }]

// Icons (inline SVG)
const icons = {
  waitlist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
};

// Render
function render() {
  document.getElementById('app').innerHTML = renderApp();
  bind();
}

function renderApp() {
  const navItems = [
    { id: 'waitlist', label: 'Waitlist', icon: icons.waitlist },
    { id: 'llm-config', label: 'LLM Config', icon: icons.key },
    { id: 'search-config', label: 'Search Config', icon: icons.search },
  ];

  return \`<div class="app">
    <div class="sidebar">
      <div class="sidebar-brand">
        <h1>The Playheads</h1>
        <span>Admin</span>
      </div>
      <div class="sidebar-nav">
        \${navItems.map(n => \`
          <button class="nav-item \${currentPage === n.id ? 'active' : ''}" onclick="navigateTo('\${n.id}')">
            \${n.icon} \${n.label}
          </button>
        \`).join('')}
      </div>
    </div>
    <div class="main">
      \${renderPageContent()}
    </div>
    \${showInviteModal ? renderInviteModal() : ''}
    \${llmModal ? renderLlmModal() : ''}
    \${searchModal ? renderSearchModal() : ''}
  </div>\`;
}

function renderPageContent() {
  if (currentPage === 'waitlist') return renderWaitlistPage();
  if (currentPage === 'llm-config') return renderLlmConfigPage();
  if (currentPage === 'search-config') return renderSearchConfigPage();
  return '<div class="main-body"><p class="empty">Coming soon</p></div>';
}

function renderLlmConfigPage() {
  // Caller bindings section
  const callerRows = ['chat', 'title'].map(ct => {
    const binding = callerBindings.find(b => b.callerType === ct);
    const resId = binding?.resourceId || '';
    const res = llmProviders.find(p => p.id === resId);
    return \`<tr>
      <td style="font-weight:600;text-transform:capitalize">\${ct}</td>
      <td>
        <select onchange="callerAssign('\${ct}', this.value)" style="width:100%;max-width:300px;height:36px;padding:0 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;background:#fff">
          <option value="">— env fallback —</option>
          \${llmProviders.map(p => \`<option value="\${p.id}" \${resId===p.id?'selected':''}>\${p.name} (\${p.model})</option>\`).join('')}
        </select>
      </td>
      <td style="font-size:12px;color:#9ca3af">\${res ? (res.thinkingEnabled ? 'Thinking ON' : 'Thinking OFF') : '—'}</td>
    </tr>\`;
  }).join('');

  const callerSection = \`
    <div style="margin-bottom:24px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Caller Bindings</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px">Assign an LLM resource to each usage point. Unassigned callers fall back to env vars.</div>
      <table>
        <thead><tr><th>Caller</th><th>Resource</th><th>Info</th></tr></thead>
        <tbody>\${callerRows}</tbody>
      </table>
    </div>\`;

  const rows = llmProviders.map(p => {
    const cardId = p.providerType + '/' + p.model;
    const card = MODEL_CARDS[cardId];
    return \`
    <tr>
      <td>
        <div>
          <div style="font-weight:500">\${p.name}</div>
          <div style="font-size:11px;color:#9ca3af">\${card?.group || p.providerType} · \${card?.label || p.model}</div>
        </div>
      </td>
      <td style="font-family:monospace;font-size:12px">\${p.model}</td>
      <td><span class="badge \${p.gateway === 'cf_ai_gateway' ? 'badge-approved' : 'badge-pending'}">\${p.gateway === 'cf_ai_gateway' ? 'CF Gateway' : 'Direct'}</span></td>
      <td>\${p.thinkingEnabled ? '<span class="badge badge-approved">Thinking</span>' : ''}</td>
      <td style="font-family:monospace;font-size:12px;color:#9ca3af">\${p.apiKey}</td>
      <td class="actions">
        <button class="btn btn-ghost" onclick="llmTest('\${p.id}', this)">Test</button>
        <button class="btn btn-ghost" onclick="llmEdit('\${p.id}')">Edit</button>
        <button class="btn btn-red" onclick="llmDelete('\${p.id}')">Delete</button>
      </td>
    </tr>\`;
  }).join('');

  return \`
    <div class="main-header">
      <h2>LLM Configuration</h2>
      <button class="btn btn-primary" onclick="llmOpenAdd()">\${icons.plus} Add Resource</button>
    </div>
    <div class="main-body">
      \${callerSection}
      \${llmLoading ? '<p class="empty">Loading...</p>' :
        llmProviders.length === 0 ? '<p class="empty">No resources configured</p>' : \`
        <table>
          <thead><tr>
            <th>Resource</th><th>Model</th><th>Gateway</th><th>Thinking</th><th>API Key</th><th style="text-align:right">Actions</th>
          </tr></thead>
          <tbody>\${rows}</tbody>
        </table>\`}
    </div>\`;
}

function renderLlmModal() {
  const d = llmModal.data || {};
  const isEdit = llmModal.mode === 'edit';
  const currentCardId = d.providerType && d.model ? d.providerType + '/' + d.model : '';
  const currentCard = MODEL_CARDS[currentCardId];
  const isCfGateway = (d.gateway || 'direct') === 'cf_ai_gateway';

  // Group cards by group for optgroup
  const groups = {};
  Object.entries(MODEL_CARDS).forEach(([id, c]) => {
    if (!groups[c.group]) groups[c.group] = [];
    groups[c.group].push({ id, ...c });
  });
  const modelOptions = Object.entries(groups).map(([g, cards]) =>
    \`<optgroup label="\${g}">\${cards.map(c =>
      \`<option value="\${c.id}" \${currentCardId===c.id?'selected':''}>\${c.label}</option>\`
    ).join('')}</optgroup>\`
  ).join('');

  const gwFields = isCfGateway ? \`
    <div class="form-group">
      <label>CF Account ID</label>
      <input id="lm_gatewayAccountId" value="\${d.gatewayAccountId || ''}" placeholder="44af79e51582..." />
    </div>
    <div class="form-group">
      <label>CF Gateway ID</label>
      <input id="lm_gatewayId" value="\${d.gatewayId || ''}" placeholder="clash" />
    </div>\` : '';

  const apiKeyLabel = isCfGateway ? 'CF Gateway Token' : 'API Key';
  const apiKeyPlaceholder = isCfGateway ? 'CF AI Gateway token' : 'sk-...';

  const showThinking = currentCard?.hasThinking;

  return \`<div class="modal-overlay" id="llmModalOverlay">
    <div class="modal" style="max-width:480px;max-height:90vh;overflow-y:auto">
      <h3>\${isEdit ? 'Edit Resource' : 'Add LLM Resource'}</h3>
      <p>Configure an LLM resource. API keys are encrypted at rest (AES-256-GCM).</p>
      \${llmMsg ? \`<div class="msg \${llmMsgType === 'error' ? 'msg-err' : 'msg-ok'}">\${llmMsg}</div>\` : ''}
      <form id="llmForm">
        <div class="form-group">
          <label>Display Name</label>
          <input id="lm_name" value="\${d.name || ''}" placeholder="My Anthropic Config" />
        </div>
        <div class="form-group">
          <label>Model</label>
          <select id="lm_cardId" onchange="llmOnCardChange()" style="width:100%;height:42px;padding:0 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;background:#fff">
            <option value="">— Select a model —</option>
            \${modelOptions}
          </select>
        </div>
        \${showThinking ? \`
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="lm_thinking" \${d.thinkingEnabled ? 'checked' : ''} style="width:auto" />
            Enable Thinking / Reasoning
          </label>
        </div>\` : ''}
        <div class="form-group">
          <label>Gateway</label>
          <select id="lm_gateway" onchange="llmOnGatewayChange()" style="width:100%;height:42px;padding:0 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;background:#fff">
            <option value="direct" \${!isCfGateway?'selected':''}>Direct</option>
            <option value="cf_ai_gateway" \${isCfGateway?'selected':''}>Cloudflare AI Gateway</option>
          </select>
        </div>
        \${gwFields}
        <div class="form-group">
          <label>\${apiKeyLabel}\${isEdit ? ' (leave masked to keep existing)' : ''}</label>
          <div style="position:relative">
            <input id="lm_apiKey" type="\${llmKeyVisible ? 'text' : 'password'}" value="\${d.apiKey || ''}" placeholder="\${apiKeyPlaceholder}" style="padding-right:44px" />
            <button type="button" onclick="llmToggleKey()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;font-size:16px">\${llmKeyVisible ? '🙈' : '👁'}</button>
          </div>
        </div>
        <div class="form-group">
          <label>Base URL (optional, auto-filled from model card)</label>
          <input id="lm_baseUrl" value="\${d.baseUrl || currentCard?.defaultBaseUrl || ''}" placeholder="https://api.example.com/v1" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="llmCloseModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">\${isEdit ? 'Save Changes' : 'Add Resource'}</button>
        </div>
      </form>
    </div>
  </div>\`;
}

function renderSearchConfigPage() {
  const active = searchProviders.find(p => p.isActive);
  const activeCard = active ? \`
    <div style="background:#fff;border:2px solid #111;border-radius:12px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:11px;color:#9ca3af;font-weight:500;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Active Search Provider</div>
        <div style="font-weight:600;font-size:15px">\${active.name}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">\${SEARCH_PROVIDER_PRESETS[active.providerType]?.label || active.providerType}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block"></span>
        <span style="font-size:12px;color:#15803d;font-weight:500">Active</span>
      </div>
    </div>\` : \`
    <div style="background:#fefce8;border:1px solid #fef08a;border-radius:12px;padding:16px 20px;margin-bottom:24px;font-size:13px;color:#a16207">
      No active search provider. Falls back to env vars (SEARCH_PROVIDER / BRAVE_SEARCH_API_KEY / TAVILY_API_KEY).
    </div>\`;

  const rows = searchProviders.map(p => \`
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          \${p.isActive ? '<span style="font-size:14px">★</span>' : '<span style="font-size:14px;opacity:.2">★</span>'}
          <div>
            <div style="font-weight:500">\${p.name}</div>
            <div style="font-size:11px;color:#9ca3af">\${SEARCH_PROVIDER_PRESETS[p.providerType]?.label || p.providerType}</div>
          </div>
        </div>
      </td>
      <td style="font-family:monospace;font-size:12px;color:#9ca3af">\${p.apiKey || '—'}</td>
      <td class="actions">
        \${!p.isActive ? \`<button class="btn btn-green" onclick="searchActivate('\${p.id}')">Activate</button>\` : ''}
        <button class="btn btn-ghost" onclick="searchEdit('\${p.id}')">Edit</button>
        <button class="btn btn-red" onclick="searchDelete('\${p.id}')">Delete</button>
      </td>
    </tr>\`).join('');

  return \`
    <div class="main-header">
      <h2>Search Configuration</h2>
      <button class="btn btn-primary" onclick="searchOpenAdd()">\${icons.plus} Add Provider</button>
    </div>
    <div class="main-body">
      \${activeCard}
      \${searchLoading ? '<p class="empty">Loading...</p>' :
        searchProviders.length === 0 ? '<p class="empty">No search providers configured</p>' : \`
        <table>
          <thead><tr>
            <th>Provider</th><th>API Key</th><th style="text-align:right">Actions</th>
          </tr></thead>
          <tbody>\${rows}</tbody>
        </table>\`}
    </div>\`;
}

function renderSearchModal() {
  const d = searchModal.data || {};
  const isEdit = searchModal.mode === 'edit';
  const preset = SEARCH_PROVIDER_PRESETS[d.providerType || 'brave'];

  return \`<div class="modal-overlay" id="searchModalOverlay">
    <div class="modal" style="max-width:440px">
      <h3>\${isEdit ? 'Edit Search Provider' : 'Add Search Provider'}</h3>
      <p>Configure a web search provider for the AI assistant. API keys are encrypted at rest.</p>
      \${searchMsg ? \`<div class="msg \${searchMsgType === 'error' ? 'msg-err' : 'msg-ok'}">\${searchMsg}</div>\` : ''}
      <form id="searchForm">
        <div class="form-group">
          <label>Display Name</label>
          <input id="sm_name" value="\${d.name || ''}" placeholder="My Brave Search" />
        </div>
        <div class="form-group">
          <label>Provider Type</label>
          <select id="sm_providerType" onchange="searchOnProviderChange()" style="width:100%;height:42px;padding:0 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;background:#fff">
            \${Object.entries(SEARCH_PROVIDER_PRESETS).map(([k,v]) =>
              \`<option value="\${k}" \${(d.providerType||'brave')===k?'selected':''}>\${v.label}</option>\`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label id="sm_keyLabel">\${preset?.keyLabel || 'API Key'} \${isEdit ? '(leave masked to keep existing)' : ''}</label>
          <div style="position:relative">
            <input id="sm_apiKey" type="\${searchKeyVisible ? 'text' : 'password'}" value="\${d.apiKey || ''}" placeholder="\${preset?.keyPlaceholder || ''}" style="padding-right:44px" />
            <button type="button" onclick="searchToggleKey()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;font-size:16px">\${searchKeyVisible ? '🙈' : '👁'}</button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="searchCloseModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">\${isEdit ? 'Save Changes' : 'Add Provider'}</button>
        </div>
      </form>
    </div>
  </div>\`;
}

function renderWaitlistPage() {
  const statItems = [
    { label: 'Total', value: stats.total, color: '#111827' },
    { label: 'Pending', value: stats.pending, color: '#a16207' },
    { label: 'Approved', value: stats.approved, color: '#15803d' },
    { label: 'Rejected', value: stats.rejected, color: '#b91c1c' },
  ];

  const rows = entries.map(e => \`<tr>
    <td><input type="checkbox" data-id="\${e.id}" \${selected.has(e.id) ? 'checked' : ''} /></td>
    <td class="email-cell">\${e.email}</td>
    <td><span class="badge badge-\${e.status}">\${e.status}</span></td>
    <td class="date">\${new Date(e.createdAt).toLocaleDateString()}</td>
    <td class="actions">\${e.status === 'pending' ? \`
      <button class="btn btn-green" onclick="doAction(['\${e.id}'],'approve')">Approve</button>
      <button class="btn btn-red" onclick="doAction(['\${e.id}'],'reject')">Reject</button>
    \` : ''}</td>
  </tr>\`).join('');

  return \`
    <div class="main-header">
      <h2>Waitlist</h2>
      <button class="btn btn-primary" onclick="openInvite()">\${icons.plus} Grant Access</button>
    </div>
    <div class="main-body">
      <div class="stats">
        \${statItems.map(s => \`<div class="stat">
          <div class="stat-num" style="color:\${s.color}">\${s.value ?? 0}</div>
          <div class="stat-label">\${s.label}</div>
        </div>\`).join('')}
      </div>
      <div class="toolbar">
        <div class="filters">
          \${['', 'pending', 'approved', 'rejected'].map(s => \`
            <button class="btn btn-ghost \${filter === s ? 'active' : ''}" onclick="setFilter('\${s}')">\${s || 'All'}</button>
          \`).join('')}
        </div>
        <div class="bulk" style="display:\${selected.size > 0 ? 'flex' : 'none'}">
          <button class="btn btn-green" onclick="bulkAction('approve')">Approve (\${selected.size})</button>
          <button class="btn btn-red" onclick="bulkAction('reject')">Reject (\${selected.size})</button>
        </div>
      </div>
      \${loading ? '<p class="empty">Loading...</p>' :
        entries.length === 0 ? '<p class="empty">No entries</p>' : \`
        <table>
          <thead><tr>
            <th style="width:40px"><input type="checkbox" id="selectAll" \${selected.size === entries.length && entries.length > 0 ? 'checked' : ''} /></th>
            <th>Email</th><th>Status</th><th>Joined</th><th style="text-align:right">Actions</th>
          </tr></thead>
          <tbody>\${rows}</tbody>
        </table>\`}
      \${totalPages > 1 ? \`<div class="pagination">
        <button class="btn btn-ghost" onclick="setPage(\${page - 1})" \${page <= 1 ? 'disabled' : ''}>Prev</button>
        <span>Page \${page} / \${totalPages}</span>
        <button class="btn btn-ghost" onclick="setPage(\${page + 1})" \${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>\` : ''}
    </div>\`;
}

function renderInviteModal() {
  return \`<div class="modal-overlay" id="modalOverlay">
    <div class="modal">
      <h3>Grant Access</h3>
      <p>Manually grant access to an email address. They will be added to the waitlist as approved.</p>
      \${inviteMsg ? \`<div class="msg \${inviteMsgType === 'error' ? 'msg-err' : 'msg-ok'}">\${inviteMsg}</div>\` : ''}
      <form id="inviteForm">
        <div class="form-group">
          <label>Email address</label>
          <input type="email" id="inviteEmail" placeholder="user@example.com" required />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="closeInvite()">Cancel</button>
          <button type="submit" class="btn btn-primary">Grant Access</button>
        </div>
      </form>
    </div>
  </div>\`;
}

// Bind events
function bind() {
  const sa = document.getElementById('selectAll');
  if (sa) sa.onchange = () => {
    if (selected.size === entries.length) selected.clear();
    else entries.forEach(e => selected.add(e.id));
    render();
  };
  document.querySelectorAll('input[data-id]').forEach(el => {
    el.onchange = () => {
      const id = el.dataset.id;
      selected.has(id) ? selected.delete(id) : selected.add(id);
      render();
    };
  });

  const inf = document.getElementById('inviteForm');
  if (inf) inf.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('inviteEmail').value;
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        inviteMsg = data.message || 'Access granted!';
        inviteMsgType = 'ok';
        render();
        setTimeout(() => { closeInvite(); fetchData(); }, 1200);
      } else {
        inviteMsg = data.error || 'Failed to grant access';
        inviteMsgType = 'error';
        render();
      }
    } catch {
      inviteMsg = 'Network error';
      inviteMsgType = 'error';
      render();
    }
  };

  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.onclick = (e) => {
    if (e.target === overlay) closeInvite();
  };

  const llmOverlay = document.getElementById('llmModalOverlay');
  if (llmOverlay) llmOverlay.onclick = (e) => {
    if (e.target === llmOverlay) llmCloseModal();
  };

  const searchOverlay = document.getElementById('searchModalOverlay');
  if (searchOverlay) searchOverlay.onclick = (e) => {
    if (e.target === searchOverlay) searchCloseModal();
  };

  const searchForm = document.getElementById('searchForm');
  if (searchForm) searchForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById('sm_name').value.trim(),
      providerType: document.getElementById('sm_providerType').value,
      apiKey: document.getElementById('sm_apiKey').value,
    };
    if (!body.name) body.name = SEARCH_PROVIDER_PRESETS[body.providerType]?.label || body.providerType;
    try {
      const isEdit = searchModal.mode === 'edit';
      const url = isEdit ? \`/api/search-config/\${searchModal.data.id}\` : '/api/search-config';
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) { searchMsg = isEdit ? 'Saved!' : 'Provider added!'; searchMsgType = 'ok'; render(); setTimeout(() => { searchCloseModal(); fetchSearchData(); }, 900); }
      else { searchMsg = data.error || 'Failed'; searchMsgType = 'error'; render(); }
    } catch { searchMsg = 'Network error'; searchMsgType = 'error'; render(); }
  };

  const llmForm = document.getElementById('llmForm');
  if (llmForm) llmForm.onsubmit = async (e) => {
    e.preventDefault();
    const cardId = document.getElementById('lm_cardId')?.value || '';
    const card = MODEL_CARDS[cardId];
    const [providerType, ...modelParts] = cardId.split('/');
    const model = modelParts.join('/');
    const thinkingEl = document.getElementById('lm_thinking');
    const body = {
      name: document.getElementById('lm_name').value.trim(),
      providerType: providerType || llmModal.data?.providerType || '',
      model: model || llmModal.data?.model || '',
      gateway: document.getElementById('lm_gateway').value,
      gatewayAccountId: document.getElementById('lm_gatewayAccountId')?.value.trim() || null,
      gatewayId: document.getElementById('lm_gatewayId')?.value.trim() || null,
      apiKey: document.getElementById('lm_apiKey').value,
      baseUrl: document.getElementById('lm_baseUrl').value.trim() || null,
      thinkingEnabled: thinkingEl ? thinkingEl.checked : false,
    };
    if (!body.providerType || !body.model) { llmMsg = 'Please select a model'; llmMsgType = 'error'; render(); return; }
    if (!body.name) body.name = card?.label || body.providerType;
    try {
      const isEdit = llmModal.mode === 'edit';
      const url = isEdit ? \`/api/llm-config/\${llmModal.data.id}\` : '/api/llm-config';
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) { llmMsg = isEdit ? 'Saved!' : 'Resource added!'; llmMsgType = 'ok'; render(); setTimeout(() => { llmCloseModal(); fetchLlmData(); }, 900); }
      else { llmMsg = data.error || 'Failed'; llmMsgType = 'error'; render(); }
    } catch { llmMsg = 'Network error'; llmMsgType = 'error'; render(); }
  };
}

// Data
async function fetchData() {
  loading = true; render();
  const params = new URLSearchParams({ page: String(page) });
  if (filter) params.set('status', filter);
  const res = await fetch('/api/waitlist?' + params);
  const json = await res.json();
  entries = json.data || [];
  stats = json.stats || stats;
  totalPages = Math.ceil((json.pagination?.total || 0) / (json.pagination?.limit || 50));
  selected.clear();
  loading = false;
  render();
}

// Actions
window.setFilter = (f) => { filter = f; page = 1; fetchData(); };
window.setPage = (p) => { page = p; fetchData(); };
window.openInvite = () => { showInviteModal = true; inviteMsg = ''; render(); document.getElementById('inviteEmail')?.focus(); };
window.closeInvite = () => { showInviteModal = false; inviteMsg = ''; render(); };

window.doAction = async (ids, action) => {
  await fetch('/api/waitlist', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action }),
  });
  fetchData();
};
window.bulkAction = (action) => { doAction([...selected], action); };

// LLM Config actions
async function fetchLlmData() {
  llmLoading = true; render();
  const [provRes, callerRes, registryRes] = await Promise.all([
    fetch('/api/llm-config'),
    fetch('/api/llm-callers'),
    Object.keys(MODEL_CARDS).length === 0 ? fetch('/api/model-registry') : null,
  ]);
  const provJson = await provRes.json();
  const callerJson = await callerRes.json();
  llmProviders = provJson.data || [];
  callerBindings = callerJson.data || [];
  if (registryRes) {
    const regJson = await registryRes.json();
    MODEL_CARDS = regJson.data || {};
  }
  llmLoading = false;
  render();
}

window.llmOpenAdd = () => { llmModal = { mode: 'add', data: {} }; llmMsg = ''; llmKeyVisible = false; render(); };
window.llmEdit = (id) => {
  const p = llmProviders.find(x => x.id === id);
  if (p) { llmModal = { mode: 'edit', data: { ...p } }; llmMsg = ''; llmKeyVisible = false; render(); }
};
window.llmCloseModal = () => { llmModal = null; llmMsg = ''; render(); };
window.llmToggleKey = () => { llmKeyVisible = !llmKeyVisible; render(); };
window.llmOnCardChange = () => {
  const cardId = document.getElementById('lm_cardId')?.value || '';
  const card = MODEL_CARDS[cardId];
  if (card) {
    const baseEl = document.getElementById('lm_baseUrl');
    if (baseEl) baseEl.value = card.defaultBaseUrl || '';
    const nameEl = document.getElementById('lm_name');
    if (nameEl && !nameEl.value) nameEl.value = card.label;
  }
  // Update modal data so thinking checkbox re-renders correctly
  if (llmModal) {
    const [pt, ...mp] = cardId.split('/');
    llmModal.data.providerType = pt;
    llmModal.data.model = mp.join('/');
    render();
  }
};
window.callerAssign = async (callerType, resourceId) => {
  await fetch('/api/llm-callers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callerType, resourceId: resourceId || null }),
  });
  const res = await fetch('/api/llm-callers');
  const json = await res.json();
  callerBindings = json.data || [];
  render();
};
window.llmOnGatewayChange = () => {
  if (llmModal) { llmModal.data.gateway = document.getElementById('lm_gateway').value; render(); }
};
window.llmTest = async (id, btn) => {
  const orig = btn.textContent;
  btn.textContent = 'Testing…';
  btn.disabled = true;
  try {
    const res = await fetch(\`/api/llm-config/\${id}/test\`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      btn.textContent = '✓ OK';
      btn.style.background = '#dcfce7';
      btn.style.color = '#15803d';
    } else {
      btn.textContent = '✗ Fail';
      btn.style.background = '#fef2f2';
      btn.style.color = '#b91c1c';
      btn.title = data.error || 'Unknown error';
    }
  } catch {
    btn.textContent = '✗ Error';
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = orig; btn.style = ''; btn.title = ''; }, 4000);
  }
};
window.llmDelete = async (id) => {
  if (!confirm('Delete this provider?')) return;
  await fetch(\`/api/llm-config/\${id}\`, { method: 'DELETE' });
  fetchLlmData();
};

// Search Config actions
async function fetchSearchData() {
  searchLoading = true; render();
  const res = await fetch('/api/search-config');
  const json = await res.json();
  searchProviders = json.data || [];
  searchLoading = false;
  render();
}

window.searchOpenAdd = () => { searchModal = { mode: 'add', data: {} }; searchMsg = ''; searchKeyVisible = false; render(); };
window.searchEdit = (id) => {
  const p = searchProviders.find(x => x.id === id);
  if (p) { searchModal = { mode: 'edit', data: { ...p } }; searchMsg = ''; searchKeyVisible = false; render(); }
};
window.searchCloseModal = () => { searchModal = null; searchMsg = ''; render(); };
window.searchToggleKey = () => { searchKeyVisible = !searchKeyVisible; render(); };
window.searchOnProviderChange = () => {
  const type = document.getElementById('sm_providerType').value;
  const preset = SEARCH_PROVIDER_PRESETS[type];
  if (preset) {
    const labelEl = document.getElementById('sm_keyLabel');
    if (labelEl) labelEl.textContent = preset.keyLabel;
    const keyEl = document.getElementById('sm_apiKey');
    if (keyEl) keyEl.placeholder = preset.keyPlaceholder;
  }
};
window.searchActivate = async (id) => {
  await fetch(\`/api/search-config/\${id}/activate\`, { method: 'POST' });
  fetchSearchData();
};
window.searchDelete = async (id) => {
  if (!confirm('Delete this search provider?')) return;
  await fetch(\`/api/search-config/\${id}\`, { method: 'DELETE' });
  fetchSearchData();
};

// Navigate hook: load data when switching pages
window.navigateTo = (p) => {
  currentPage = p;
  if (p === 'llm-config' && llmProviders.length === 0) fetchLlmData();
  if (p === 'search-config' && searchProviders.length === 0) fetchSearchData();
  render();
};

fetchData();
<\/script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
