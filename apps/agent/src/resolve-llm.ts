/**
 * Resolves an LLM provider for a given caller type (chat, title).
 *
 * Reads caller → resource binding from `llm_caller_config`, looks up the
 * resource in `llm_provider_config`, matches it to a ModelCard, and returns
 * a ready-to-use model + providerOptions + metadata.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  lookupCard,
  buildProviderOptions,
  type ModelCard,
  type CallerType,
} from "@playheads/llm-config";
import type { Env } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row shape returned by the caller→resource JOIN query. */
interface ResourceRow {
  // llm_provider_config columns
  id: string;
  providerType: string;
  model: string;
  gateway: string;
  gatewayAccountId: string | null;
  gatewayId: string | null;
  apiKey: string;
  baseUrl: string | null;
  thinkingEnabled: number;
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
// Decrypt helper (mirrors apps/admin/src/index.ts)
// ---------------------------------------------------------------------------

async function decryptApiKey(encoded: string, env: Env): Promise<string> {
  const hex = (env as unknown as Record<string, string>)["ADMIN_ENCRYPTION_KEY"];
  if (!hex || hex.length < 64) return encoded;
  try {
    const raw = new Uint8Array(
      hex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16))
    );
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf.slice(0, 12) },
      key,
      buf.slice(12)
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
 *
 * Priority: DB caller binding → env var fallback.
 */
export async function resolveLLM(
  env: Env,
  callerType: CallerType
): Promise<ResolvedLLM> {
  // 1. Query caller → resource from DB
  const resource = await env.DB.prepare(`
    SELECT r.id, r.providerType, r.model, r.gateway,
           r.gatewayAccountId, r.gatewayId, r.apiKey,
           r.baseUrl, r.thinkingEnabled
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
  const apiKeyEncrypted = resource?.apiKey;
  const apiKey = apiKeyEncrypted
    ? await decryptApiKey(apiKeyEncrypted, env)
    : "";
  const thinkingEnabled = resource?.thinkingEnabled === 1;

  // 3. Look up model card
  const card = lookupCard(providerType, modelName) ?? null;

  // 4. Resolve base URL & gateway
  let baseURL: string | undefined;
  const useGateway = resource
    ? resource.gateway === "cf_ai_gateway"
    : !!env.CLOUDFLARE_ACCOUNT_ID; // env fallback: use gateway when account is configured

  if (useGateway) {
    const accountId =
      resource?.gatewayAccountId || env.CLOUDFLARE_ACCOUNT_ID;
    const gwId = resource?.gatewayId || env.AI_GATEWAY_ID;
    // Use card's gatewayPathSegment (e.g. "anthropic", "xai", "openai")
    // or fall back to providerType-based heuristic
    const gwSegment =
      card?.gatewayPathSegment ||
      (providerType === "anthropic" ? "anthropic" : providerType === "openai" ? "openai" : "openai-compatible");
    baseURL = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gwId}/${gwSegment}`;
  } else {
    baseURL =
      resource?.baseUrl ||
      card?.defaultBaseUrl ||
      undefined;
  }

  // 5. Create provider SDK + model
  let model: unknown;
  let anthropicInstance: ReturnType<typeof createAnthropic> | undefined;

  // When using CF AI Gateway (unified billing), always use CF_AIG_TOKEN.
  // Otherwise use the DB-stored key or provider-specific env fallback.
  const effectiveKey = apiKey || (useGateway ? env.CF_AIG_TOKEN : "") || env.CF_AIG_TOKEN;

  if (card?.sdk === "anthropic" || (!card && providerType === "anthropic")) {
    const anthropic = createAnthropic({
      apiKey: effectiveKey,
      baseURL,
    });
    anthropicInstance = anthropic;
    model = anthropic(card?.modelId || modelName);
  } else {
    const provider = createOpenAICompatible({
      name: card?.sdkName || providerType,
      apiKey: effectiveKey,
      baseURL: baseURL || "https://api.openai.com/v1",
    });
    model = provider(card?.modelId || modelName);
  }

  // 6. Build providerOptions from card
  const providerOptions = card
    ? buildProviderOptions(card, thinkingEnabled)
    : undefined;

  // 7. Resolve maxOutputTokens
  const maxOutputTokens =
    thinkingEnabled && card?.maxOutputTokensWithThinking
      ? card.maxOutputTokensWithThinking
      : card?.maxOutputTokens || 4096;

  // Log which model this call resolved to
  console.log(
    JSON.stringify({
      event: "resolveLLM",
      callerType,
      provider: providerType,
      model: card?.modelId || modelName,
      thinkingEnabled,
      maxOutputTokens,
      baseURL: baseURL || "(default)",
      gateway: resource?.gateway || "env_fallback",
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
