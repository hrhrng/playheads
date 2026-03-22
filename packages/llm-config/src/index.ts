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
        /** Provider-specific params merged into providerOptions[key] */
        params: Record<string, unknown>;
        /** Anthropic-only: budgetTokens injected into params.thinking */
        budgetTokens?: number;
      };

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
      params: { thinking: { type: "enabled" } },
      budgetTokens: 16384,
    },
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
      params: { thinking: { type: "enabled" } },
      budgetTokens: 8192,
    },
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
      params: { thinking: { type: "enabled" } },
      budgetTokens: 4096,
    },
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
      params: { thinking: { type: "auto" } },
    },
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
      params: { thinking: { type: "auto" } },
    },
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
    thinking: false, // built-in reasoning, no external toggle
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
    thinking: false,
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
    maxOutputTokens: 16384,
    titleModelId: "gpt-5.4-nano",
  },
};

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

  const opts = structuredClone(card.thinking.params);

  // Anthropic requires budgetTokens injected into the thinking object
  if (
    card.thinking.budgetTokens &&
    typeof opts.thinking === "object" &&
    opts.thinking !== null
  ) {
    (opts.thinking as Record<string, unknown>).budgetTokens =
      card.thinking.budgetTokens;
  }

  return { [card.thinking.providerOptionsKey]: opts };
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
