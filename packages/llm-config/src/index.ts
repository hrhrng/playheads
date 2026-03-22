/**
 * Shared LLM configuration — Model Card registry.
 *
 * Each card captures provider-specific details (SDK type, thinking params,
 * output limits, etc.) so that consumers (agent, admin) don't need to
 * hard-code per-provider logic.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a single configurable param field for the admin UI. */
export interface ParamField {
  /** Dot-path key into the params JSON, e.g. "thinking.budgetTokens" */
  key: string;
  /** Human-readable label */
  label: string;
  /** Control type */
  type: "toggle" | "number" | "select";
  /** For select: available options */
  options?: string[];
  /** For number: constraints */
  min?: number;
  max?: number;
  step?: number;
  /** Default value */
  defaultValue?: unknown;
}

export interface ModelCard {
  /** Registry key, e.g. "anthropic/claude-haiku-4-5" */
  id: string;
  /** Human-readable label */
  label: string;
  /** Grouping for admin UI (optgroup) */
  group: string;

  // -- Provider SDK ----------------------------------------------------------
  sdk: "anthropic" | "openai-compatible";
  /** For openai-compatible: the `name` passed to createOpenAICompatible() */
  sdkName?: string;
  /** Model ID sent to the provider API */
  modelId: string;
  /** Default base URL for openai-compatible providers */
  defaultBaseUrl?: string;

  // -- Thinking / Reasoning --------------------------------------------------
  /**
   * `false` = model does not support thinking.
   * Otherwise, defines the providerOptions shape to enable thinking.
   */
  thinking:
    | false
    | {
        /** Key inside providerOptions, e.g. "anthropic", "doubao", "openai" */
        providerOptionsKey: string;
        /** Provider-specific default params merged into providerOptions[key] */
        params: Record<string, unknown>;
      };

  // -- Params schema (for admin UI) -------------------------------------------
  /** Structured form fields for admin. Empty array = no configurable params. */
  paramsSchema?: ParamField[];

  // -- Output limits ---------------------------------------------------------
  maxOutputTokens: number;
  maxOutputTokensWithThinking?: number;

  // -- CF AI Gateway ----------------------------------------------------------
  /** Path segment for CF AI Gateway URL, e.g. "anthropic", "openai", "xai" */
  gatewayPathSegment?: string;

  // -- Misc ------------------------------------------------------------------
  /** Cheap model for title generation (same provider SDK) */
  titleModelId?: string;
  /** Anthropic-only: supports native webSearch tool */
  nativeSearch?: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const MODEL_REGISTRY: Record<string, ModelCard> = {
  // ── Anthropic ──────────────────────────────────────────
  "anthropic/claude-opus-4-6": {
    id: "anthropic/claude-opus-4-6",
    label: "Claude Opus 4.6",
    group: "Anthropic",
    sdk: "anthropic",
    modelId: "claude-opus-4-6",
    gatewayPathSegment: "anthropic",
    thinking: {
      providerOptionsKey: "anthropic",
      params: { thinking: { type: "adaptive" } },
    },
    paramsSchema: [
      { key: "thinking.type", label: "Thinking", type: "select", options: ["adaptive", "disabled"], defaultValue: "adaptive" },
    ],
    maxOutputTokens: 4096,
    maxOutputTokensWithThinking: 128000,
    titleModelId: "claude-haiku-4-5-20251001",
    nativeSearch: true,
  },
  "anthropic/claude-sonnet-4-6": {
    id: "anthropic/claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    group: "Anthropic",
    sdk: "anthropic",
    modelId: "claude-sonnet-4-6",
    gatewayPathSegment: "anthropic",
    thinking: {
      providerOptionsKey: "anthropic",
      params: { thinking: { type: "adaptive" } },
    },
    paramsSchema: [
      { key: "thinking.type", label: "Thinking", type: "select", options: ["adaptive", "disabled"], defaultValue: "adaptive" },
    ],
    maxOutputTokens: 4096,
    maxOutputTokensWithThinking: 64000,
    titleModelId: "claude-haiku-4-5-20251001",
    nativeSearch: true,
  },
  "anthropic/claude-haiku-4-5": {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    group: "Anthropic",
    sdk: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    gatewayPathSegment: "anthropic",
    thinking: {
      providerOptionsKey: "anthropic",
      params: { thinking: { type: "enabled", budgetTokens: 4096 } },
    },
    paramsSchema: [
      { key: "thinking.type", label: "Thinking", type: "select", options: ["enabled", "disabled"], defaultValue: "enabled" },
      { key: "thinking.budgetTokens", label: "Budget Tokens", type: "number", min: 1024, max: 64000, step: 1024, defaultValue: 4096 },
    ],
    maxOutputTokens: 4096,
    maxOutputTokensWithThinking: 64000,
    titleModelId: "claude-haiku-4-5-20251001",
    nativeSearch: true,
  },

  // ── Doubao (火山方舟) ──────────────────────────────────
  "doubao/doubao-seed-2.0-pro": {
    id: "doubao/doubao-seed-2.0-pro",
    label: "Doubao Seed 2.0 Pro",
    group: "Doubao",
    sdk: "openai-compatible",
    sdkName: "doubao",
    modelId: "doubao-seed-2-0-pro-260215",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    gatewayPathSegment: "custom-doubao",
    thinking: {
      providerOptionsKey: "doubao",
      params: { reasoning_effort: "medium" },
    },
    paramsSchema: [
      { key: "reasoning_effort", label: "Reasoning Effort", type: "select", options: ["minimal", "low", "medium", "high"], defaultValue: "medium" },
    ],
    maxOutputTokens: 4096,
    maxOutputTokensWithThinking: 128000,
    titleModelId: "doubao-seed-2-0-lite-260215",
  },
  "doubao/doubao-seed-2.0-lite": {
    id: "doubao/doubao-seed-2.0-lite",
    label: "Doubao Seed 2.0 Lite",
    group: "Doubao",
    sdk: "openai-compatible",
    sdkName: "doubao",
    modelId: "doubao-seed-2-0-lite-260215",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    gatewayPathSegment: "custom-doubao",
    thinking: {
      providerOptionsKey: "doubao",
      params: { reasoning_effort: "medium" },
    },
    paramsSchema: [
      { key: "reasoning_effort", label: "Reasoning Effort", type: "select", options: ["minimal", "low", "medium", "high"], defaultValue: "medium" },
    ],
    maxOutputTokens: 4096,
    maxOutputTokensWithThinking: 128000,
  },
  "doubao/doubao-1.5-pro-32k": {
    id: "doubao/doubao-1.5-pro-32k",
    label: "Doubao 1.5 Pro (Legacy)",
    group: "Doubao",
    sdk: "openai-compatible",
    sdkName: "doubao",
    modelId: "doubao-1.5-pro-32k",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    gatewayPathSegment: "custom-doubao",
    thinking: false,
    maxOutputTokens: 4096,
    titleModelId: "doubao-seed-2-0-lite-260215",
  },

  // ── x.ai (Grok) ───────────────────────────────────────
  "xai/grok-4.20-reasoning": {
    id: "xai/grok-4.20-reasoning",
    label: "Grok 4.20 Reasoning",
    group: "x.ai",
    sdk: "openai-compatible",
    sdkName: "xai",
    modelId: "grok-4.20-0309-reasoning",
    defaultBaseUrl: "https://api.x.ai/v1",
    gatewayPathSegment: "xai",
    thinking: false, // Grok 4 has built-in reasoning, no external params
    maxOutputTokens: 16384,
  },
  "xai/grok-4-1-fast-reasoning": {
    id: "xai/grok-4-1-fast-reasoning",
    label: "Grok 4.1 Fast Reasoning",
    group: "x.ai",
    sdk: "openai-compatible",
    sdkName: "xai",
    modelId: "grok-4-1-fast-reasoning",
    defaultBaseUrl: "https://api.x.ai/v1",
    gatewayPathSegment: "xai",
    thinking: false, // Grok 4 has built-in reasoning, no external params
    maxOutputTokens: 16384,
  },
  "xai/grok-4-1-fast": {
    id: "xai/grok-4-1-fast",
    label: "Grok 4.1 Fast (Non-reasoning)",
    group: "x.ai",
    sdk: "openai-compatible",
    sdkName: "xai",
    modelId: "grok-4-1-fast-non-reasoning",
    defaultBaseUrl: "https://api.x.ai/v1",
    gatewayPathSegment: "xai",
    thinking: false,
    maxOutputTokens: 16384,
  },

  // ── OpenAI ─────────────────────────────────────────────
  "openai/gpt-5.4": {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    group: "OpenAI",
    sdk: "openai-compatible",
    sdkName: "openai",
    modelId: "gpt-5.4",
    gatewayPathSegment: "openai",
    thinking: {
      providerOptionsKey: "openai",
      params: { reasoning: { effort: "medium", summary: "auto" } },
    },
    paramsSchema: [
      { key: "reasoning.effort", label: "Reasoning Effort", type: "select", options: ["low", "medium", "high"], defaultValue: "medium" },
      { key: "reasoning.summary", label: "Summary", type: "select", options: ["auto", "none"], defaultValue: "auto" },
    ],
    maxOutputTokens: 16384,
    maxOutputTokensWithThinking: 128000,
    titleModelId: "gpt-5.4-nano",
  },
  "openai/gpt-5.4-mini": {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    group: "OpenAI",
    sdk: "openai-compatible",
    sdkName: "openai",
    modelId: "gpt-5.4-mini",
    gatewayPathSegment: "openai",
    thinking: {
      providerOptionsKey: "openai",
      params: { reasoning: { effort: "medium", summary: "auto" } },
    },
    paramsSchema: [
      { key: "reasoning.effort", label: "Reasoning Effort", type: "select", options: ["low", "medium", "high"], defaultValue: "medium" },
      { key: "reasoning.summary", label: "Summary", type: "select", options: ["auto", "none"], defaultValue: "auto" },
    ],
    maxOutputTokens: 16384,
    maxOutputTokensWithThinking: 128000,
    titleModelId: "gpt-5.4-nano",
  },
  "openai/gpt-5.4-nano": {
    id: "openai/gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    group: "OpenAI",
    sdk: "openai-compatible",
    sdkName: "openai",
    modelId: "gpt-5.4-nano",
    gatewayPathSegment: "openai",
    thinking: {
      providerOptionsKey: "openai",
      params: { reasoning: { effort: "low", summary: "auto" } },
    },
    paramsSchema: [
      { key: "reasoning.effort", label: "Reasoning Effort", type: "select", options: ["low", "medium", "high"], defaultValue: "low" },
      { key: "reasoning.summary", label: "Summary", type: "select", options: ["auto", "none"], defaultValue: "auto" },
    ],
    maxOutputTokens: 16384,
    titleModelId: "gpt-5.4-nano",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build `providerOptions` for streamText / generateText based on a model card.
 * Returns `undefined` when thinking is disabled or unsupported.
 */
export function buildProviderOptions(
  card: ModelCard,
  thinkingEnabled: boolean
): Record<string, unknown> | undefined {
  if (!thinkingEnabled || !card.thinking) return undefined;
  return { [card.thinking.providerOptionsKey]: structuredClone(card.thinking.params) };
}

/**
 * Look up a model card by provider type + model name.
 * Returns `undefined` if no matching card exists (custom/unknown model).
 */
export function lookupCard(
  providerType: string,
  model: string
): ModelCard | undefined {
  return MODEL_REGISTRY[`${providerType}/${model}`];
}

/** All known caller types. */
export const CALLER_TYPES = ["chat", "title"] as const;
export type CallerType = (typeof CALLER_TYPES)[number];

// ---------------------------------------------------------------------------
// Shared LLM model factory — used by agent (resolve-llm) and admin (test)
// ---------------------------------------------------------------------------

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Input config for creating an LLM model instance. */
export interface CreateLLMModelConfig {
  card: ModelCard;
  /** Decrypted provider API key, or null if using CF AI Gateway BYOK. */
  providerKey: string | null;
  /** CF AI Gateway token. */
  cfAigToken: string;
  /** Cloudflare account ID for gateway URL. */
  accountId: string;
  /** AI Gateway ID. */
  gatewayId: string;
  /** Parsed params JSON from DB (null = no thinking/reasoning). */
  params: Record<string, unknown> | null;
}

/** Output from createLLMModel. */
export interface LLMModelResult {
  model: unknown; // LanguageModelV1
  providerOptions: Record<string, unknown> | undefined;
  maxOutputTokens: number;
  /** Anthropic provider instance, needed for native webSearch tool. */
  anthropicInstance?: ReturnType<typeof createAnthropic>;
}

/**
 * Create an LLM model instance with proper gateway routing and auth.
 *
 * All traffic goes through CF AI Gateway:
 * - No provider key: CF_AIG_TOKEN as apiKey (BYOK mode)
 * - Has provider key: provider key as apiKey + cf-aig-authorization header
 */
export function createLLMModel(config: CreateLLMModelConfig): LLMModelResult {
  const { card, providerKey, cfAigToken, accountId, gatewayId, params } = config;

  // 1. Gateway URL
  const gwSegment = card.gatewayPathSegment || "openai-compatible";
  const baseURL = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/${gwSegment}`;

  // 2. Auth: SDK apiKey + optional dual-header
  const apiKey = providerKey || cfAigToken;
  const extraHeaders: Record<string, string> = providerKey
    ? { "cf-aig-authorization": `Bearer ${cfAigToken}` }
    : {};

  // 3. Create SDK model
  let model: unknown;
  let anthropicInstance: ReturnType<typeof createAnthropic> | undefined;

  if (card.sdk === "anthropic") {
    const anthropic = createAnthropic({ apiKey, baseURL, headers: extraHeaders });
    anthropicInstance = anthropic;
    model = anthropic(card.modelId);
  } else {
    const provider = createOpenAICompatible({
      name: card.sdkName || "openai",
      apiKey,
      baseURL,
      headers: extraHeaders,
    });
    model = provider(card.modelId);
  }

  // 4. Build providerOptions from DB params
  let providerOptions: Record<string, unknown> | undefined;
  if (params && card.thinking) {
    providerOptions = { [card.thinking.providerOptionsKey]: params };
  }

  // 5. Resolve maxOutputTokens (0 = let the SDK/model use its default)
  const thinkingEnabled = params !== null;
  const maxOutputTokens =
    thinkingEnabled && card.maxOutputTokensWithThinking
      ? card.maxOutputTokensWithThinking
      : card.maxOutputTokens || 0;

  // Log what we're actually sending
  console.log(JSON.stringify({
    event: "createLLMModel",
    cardId: card.id,
    modelId: card.modelId,
    sdk: card.sdk,
    sdkName: card.sdkName,
    baseURL,
    hasProviderKey: !!providerKey,
    params,
    providerOptions,
    maxOutputTokens,
  }));

  return { model, providerOptions, maxOutputTokens, anthropicInstance };
}
