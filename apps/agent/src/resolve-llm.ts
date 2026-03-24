/**
 * Resolves an LLM provider for a given caller type (chat, title).
 *
 * Reads caller → resource binding from DB, looks up the ModelCard,
 * and delegates to the shared createLLMModel factory.
 */
import {
  lookupCard,
  createLLMModel,
  type ModelCard,
  type CallerType,
  type LLMModelResult,
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

export interface ResolvedLLM extends LLMModelResult {
  card: ModelCard | null;
}

// ---------------------------------------------------------------------------
// Decrypt helper
// ---------------------------------------------------------------------------

export async function decryptApiKey(encoded: string, env: Env): Promise<string> {
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
    try { dbParams = JSON.parse(resource.params); } catch { /* ignore */ }
  }

  // 3. Look up model card
  const card = lookupCard(providerType, modelName) ?? null;

  // 4. Resolve provider API key (decrypt if stored in DB)
  const hasDbKey = resource?.apiKey ? resource.apiKey.length > 0 : false;
  const providerKey = hasDbKey
    ? await decryptApiKey(resource!.apiKey, env)
    : null;

  // 5. Create model via shared factory
  if (!card) {
    // Unknown model — can't route without a card
    throw new Error(`Unknown model: ${providerType}/${modelName}`);
  }

  const result = createLLMModel({
    card,
    providerKey,
    cfAigToken: env.CF_AIG_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: env.AI_GATEWAY_ID,
    params: dbParams,
  });

  // Log resolved model
  console.log(
    JSON.stringify({
      event: "resolveLLM",
      callerType,
      provider: providerType,
      model: card.modelId,
      thinkingEnabled: dbParams !== null,
      maxOutputTokens: result.maxOutputTokens,
      authMode: providerKey ? "own_key+gateway" : "cf_byok",
      source: resource ? "db" : "env_fallback",
    })
  );

  return { ...result, card };
}
