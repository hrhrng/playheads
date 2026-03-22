/**
 * Resolves an LLM provider for a given caller type (chat, title).
 *
 * All providers go through CF AI Gateway. API keys are managed in the
 * Cloudflare dashboard (BYOK) — we only need CF_AIG_TOKEN for gateway auth.
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
  /** JSON string of provider-specific params, e.g. {"thinking":{"type":"enabled","budgetTokens":8192}} */
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
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a fully-configured LLM for a given caller type.
 *
 * All traffic routes through CF AI Gateway. The gateway handles upstream
 * authentication via BYOK — we authenticate to the gateway with CF_AIG_TOKEN.
 *
 * Priority: DB caller binding → env var fallback.
 */
export async function resolveLLM(
  env: Env,
  callerType: CallerType
): Promise<ResolvedLLM> {
  // 1. Query caller → resource from DB
  const resource = await env.DB.prepare(`
    SELECT r.id, r.providerType, r.model, r.params
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

  // 4. Build CF AI Gateway URL
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const gwId = env.AI_GATEWAY_ID;
  const gwSegment =
    card?.gatewayPathSegment ||
    (providerType === "anthropic" ? "anthropic" : "openai-compatible");
  const baseURL = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gwId}/${gwSegment}`;

  // 5. Create provider SDK + model (all using CF_AIG_TOKEN)
  let model: unknown;
  let anthropicInstance: ReturnType<typeof createAnthropic> | undefined;
  const apiKey = env.CF_AIG_TOKEN;

  if (card?.sdk === "anthropic" || (!card && providerType === "anthropic")) {
    const anthropic = createAnthropic({ apiKey, baseURL });
    anthropicInstance = anthropic;
    model = anthropic(card?.modelId || modelName);
  } else {
    const provider = createOpenAICompatible({
      name: card?.sdkName || providerType,
      apiKey,
      baseURL,
    });
    model = provider(card?.modelId || modelName);
  }

  // 6. Build providerOptions
  // DB params is the raw provider-specific params (e.g. {"thinking":{"type":"enabled","budgetTokens":8192}})
  // Wrap it with the providerOptionsKey from the card
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
      baseURL,
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
