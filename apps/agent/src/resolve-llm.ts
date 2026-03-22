/**
 * Resolves an LLM provider for a given caller type (chat, title).
 *
 * Supports two auth modes:
 * - Direct API key: stored encrypted in DB, decrypted at runtime, calls provider directly or via gateway
 * - CF AI Gateway unified billing: no API key in DB, uses CF_AIG_TOKEN
 *
 * Reads caller → resource binding from `llm_caller_config`, looks up the
 * resource in `llm_provider_config`, matches it to a ModelCard, and returns
 * a ready-to-use model + providerOptions + metadata.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  lookupCard,
  type ModelCard,
  type CallerType,
} from "@playheads/llm-config";
import type { Env } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row shape returned by the caller→resource JOIN query. */
interface ResourceRow {
  id: string;
  providerType: string;
  model: string;
  apiKey: string; // encrypted; empty = CF AI Gateway unified billing
  /** JSON string of provider-specific params */
  params: string | null;
}

export interface ResolvedLLM {
  model: unknown; // LanguageModelV1 — typed as unknown to avoid cross-SDK type issues
  card: ModelCard | null;
  providerOptions: Record<string, unknown> | undefined;
  maxOutputTokens: number;
  /** Anthropic provider instance, needed for native webSearch tool. */
  anthropicInstance?: ReturnType<typeof createAnthropic>;
}

// ---------------------------------------------------------------------------
// Decrypt helper
// ---------------------------------------------------------------------------

async function decryptApiKey(encoded: string, env: Env): Promise<string> {
  const hex = (env as unknown as Record<string, string>)["ADMIN_ENCRYPTION_KEY"];
  if (!hex || hex.length < 64) return encoded;
  try {
    const raw = new Uint8Array(
      hex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16))
    );
    const key = await crypto.subtle.importKey(
      "raw", raw, { name: "AES-GCM" }, false, ["decrypt"]
    );
    const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12)
    );
    return new TextDecoder().decode(pt);
  } catch {
    return encoded;
  }
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a fully-configured LLM for a given caller type.
 * Priority: DB caller binding → env var fallback.
 */
export async function resolveLLM(
  env: Env,
  callerType: CallerType
): Promise<ResolvedLLM> {
  // 1. Query caller → resource from DB
  const resource = await env.DB.prepare(`
    SELECT r.id, r.providerType, r.model, r.apiKey, r.params
    FROM llm_caller_config c
    JOIN llm_provider_config r ON c.resourceId = r.id
    WHERE c.callerType = ?
  `)
    .bind(callerType)
    .first<ResourceRow>()
    .catch(() => null);

  // 2. Resolve provider details (DB or env fallback)
  const providerType =
    resource?.providerType || env.LLM_PROVIDER || "anthropic";
  const modelName =
    resource?.model || env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  // Parse params JSON from DB (null/empty = no thinking)
  let dbParams: Record<string, unknown> | null = null;
  if (resource?.params) {
    try { dbParams = JSON.parse(resource.params); } catch { /* ignore bad JSON */ }
  }
  const thinkingEnabled = dbParams !== null;

  // 3. Look up model card
  const card = lookupCard(providerType, modelName) ?? null;

  // 4. Resolve API key, base URL, and headers
  // All traffic goes through CF AI Gateway.
  // - No DB key: CF_AIG_TOKEN as apiKey (BYOK / unified billing)
  // - Has DB key: provider key as apiKey + cf-aig-authorization header for gateway auth
  const hasDbKey = resource?.apiKey ? resource.apiKey.length > 0 : false;
  const providerKey = hasDbKey
    ? await decryptApiKey(resource!.apiKey, env)
    : null;

  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const gwId = env.AI_GATEWAY_ID;
  const gwSegment =
    card?.gatewayPathSegment ||
    (providerType === "anthropic" ? "anthropic" : "openai-compatible");
  const baseURL = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gwId}/${gwSegment}`;

  // SDK apiKey = provider key if available, otherwise CF_AIG_TOKEN
  const apiKey = providerKey || env.CF_AIG_TOKEN;
  // When using own provider key through gateway, need cf-aig-authorization header
  const extraHeaders: Record<string, string> = providerKey
    ? { "cf-aig-authorization": `Bearer ${env.CF_AIG_TOKEN}` }
    : {};

  // 5. Create provider SDK + model
  let model: unknown;
  let anthropicInstance: ReturnType<typeof createAnthropic> | undefined;

  if (card?.sdk === "anthropic" || (!card && providerType === "anthropic")) {
    const anthropic = createAnthropic({ apiKey, baseURL, headers: extraHeaders });
    anthropicInstance = anthropic;
    model = anthropic(card?.modelId || modelName);
  } else {
    const provider = createOpenAICompatible({
      name: card?.sdkName || providerType,
      apiKey,
      baseURL,
      headers: extraHeaders,
    });
    model = provider(card?.modelId || modelName);
  }

  // 6. Build providerOptions from DB params
  let providerOptions: Record<string, unknown> | undefined;
  if (dbParams && card?.thinking) {
    providerOptions = { [card.thinking.providerOptionsKey]: dbParams };
  }

  // 7. Resolve maxOutputTokens
  const maxOutputTokens =
    thinkingEnabled && card?.maxOutputTokensWithThinking
      ? card.maxOutputTokensWithThinking
      : card?.maxOutputTokens || 4096;

  // Log resolved model
  console.log(
    JSON.stringify({
      event: "resolveLLM",
      callerType,
      provider: providerType,
      model: card?.modelId || modelName,
      thinkingEnabled,
      maxOutputTokens,
      authMode: providerKey ? "own_key+gateway" : "cf_byok",
      source: resource ? "db" : "env_fallback",
    })
  );

  return {
    model,
    card,
    providerOptions,
    maxOutputTokens,
    anthropicInstance,
  };
}
