/**
 * MusicChatAgent - Core AI chat agent powered by Cloudflare Agents SDK.
 *
 * Extends AIChatAgent for automatic message persistence, resumable streaming,
 * and multi-device synchronization. Uses Vercel AI SDK for unified LLM access
 * through Cloudflare AI Gateway.
 *
 * Ported from apps/backend/agent.py
 */
import { AIChatAgent } from "@cloudflare/ai-chat";
import { streamText, convertToModelMessages, stepCountIs, tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { createMusicTools } from "./tools";
import { generateAndUpdateTitle } from "./title";
import { createLogger } from "./logger";
import type { Env, PlaybackState } from "./types";

// ---------------------------------------------------------------------------
// System Prompt (ported from agent.py:298-322)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_TEMPLATE = `You are a friendly music DJ assistant called "Playhead DJ". You help users discover and play music.

Current State:
{state_context}

Available Tools:
- search_music(query) — search Apple Music catalog. Returns track list with IDs.
- web_search(query) — search the web for music recommendations, playlist ideas, artist info, trending songs, or genre exploration.
- get_now_playing() — check what's currently playing.
- get_playlist() — show the current playlist/queue.
- add_to_queue(track_id) — add a track by Apple Music ID (from search_music results).
- play_track(index) — play a track ALREADY in the playlist (1-indexed position).
- skip_next() — skip to the next track.
- remove_from_playlist(index) — remove a track by position (1-indexed).

Workflow:
- "Play X" → search_music(X) → add_to_queue(id) → play_track(position)
- "Add X to queue" → search_music(X) → add_to_queue(id)
- "Search X" → search_music(X) — just search, show results
- "Play track N" → play_track(N) — play an existing track in the playlist
- "Skip" / "Next" → skip_next()
- "Remove N" → remove_from_playlist(N)
- "What's playing?" → get_now_playing()
- "Show queue" → get_playlist()
- "Recommend" → web_search(query) → show results → wait for user to pick

IMPORTANT:
- search_music only searches — it does NOT add to queue or play.
- add_to_queue needs a track_id from search_music results.
- play_track plays a track ALREADY in the playlist (1-indexed).
- remove_from_playlist takes a 1-indexed position.
- web_search is for discovery and recommendations (web results). search_music is for finding specific tracks on Apple Music.
- When asked to build a playlist, use web_search for ideas, then search_music + add_to_queue for each track.

Be conversational and fun! Keep responses concise.`;

/**
 * Build a web_search tool.
 * Priority: DB config (from search_provider_config table) > env vars.
 *
 * SEARCH_PROVIDER env values: "brave" | "tavily" | "none" (anything else = no search)
 * Defaults for Anthropic provider are handled in the caller (native webSearch_20250305).
 */
function buildWebSearchTool(env: Env, dbOverride?: { providerType: string; apiKey: string }) {
  const provider = (dbOverride?.providerType || env.SEARCH_PROVIDER || "").toLowerCase();

  if (provider === "brave") {
    const apiKey = dbOverride?.apiKey || env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) return undefined;
    return tool({
      description: "Search the web for music recommendations, artist info, trending songs, or genre exploration.",
      inputSchema: z.object({ query: z.string().describe("Search query") }),
      execute: async ({ query }: { query: string }) => {
        try {
          const res = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
            { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" } }
          );
          const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
          const results = data.web?.results || [];
          if (!results.length) return `No results found for: ${query}`;
          return results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.description}`).join("\n\n");
        } catch (e) {
          return `Web search failed: ${e}`;
        }
      },
    });
  }

  if (provider === "tavily") {
    const apiKey = dbOverride?.apiKey || env.TAVILY_API_KEY;
    if (!apiKey) return undefined;
    return tool({
      description: "Search the web for music recommendations, artist info, trending songs, or genre exploration.",
      inputSchema: z.object({ query: z.string().describe("Search query") }),
      execute: async ({ query }: { query: string }) => {
        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ query, max_results: 5, search_depth: "basic" }),
          });
          const data = await res.json() as { results?: Array<{ title: string; url: string; content: string }> };
          return (data.results || []).map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.content}`).join("\n\n");
        } catch (e) {
          return `Web search failed: ${e}`;
        }
      },
    });
  }

  return undefined;
}

function buildSystemPrompt(state: PlaybackState): string {
  const lines: string[] = [];

  if (state.currentTrack) {
    lines.push(
      `Currently playing: ${state.currentTrack.name} by ${state.currentTrack.artist}`
    );
  } else {
    lines.push("Nothing is currently playing.");
  }

  if (state.playlist.length) {
    lines.push(`Playlist has ${state.playlist.length} tracks:`);
    for (let i = 0; i < Math.min(state.playlist.length, 5); i++) {
      const track = state.playlist[i];
      lines.push(`  ${i + 1}. ${track.name} - ${track.artist}`);
    }
    if (state.playlist.length > 5) {
      lines.push(`  ... and ${state.playlist.length - 5} more`);
    }
  } else {
    lines.push("Playlist is empty.");
  }

  return SYSTEM_PROMPT_TEMPLATE.replace("{state_context}", lines.join("\n"));
}

// ---------------------------------------------------------------------------
// MusicChatAgent
// ---------------------------------------------------------------------------

export class MusicChatAgent extends AIChatAgent<Env, PlaybackState> {
  // Playback state synced in real-time to all connected clients via setState()
  initialState: PlaybackState = {
    currentTrack: null,
    playlist: [],
    isPlaying: false,
    playbackPosition: 0,
  };

  async onChatMessage(
    onFinish?: Parameters<AIChatAgent<Env, PlaybackState>["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent<Env, PlaybackState>["onChatMessage"]>[1]
  ) {
    // Extract session context from custom body
    const body = (options?.body || {}) as Record<string, unknown>;
    const sessionId = body.session_id as string | undefined;
    const userId = body.user_id as string | undefined;
    const storefront = (body.storefront as string) || "us";
    const messageCount = this.messages.length;

    // Read global queue from D1 profile (user-level, not per-session)
    let globalState: PlaybackState = this.state;
    if (userId) {
      try {
        const row = await this.env.DB.prepare(
          'SELECT "queue", "queueIndex" FROM "profile" WHERE "id" = ?'
        ).bind(userId).first<{ queue: string; queueIndex: number }>();
        if (row) {
          const queueTracks = JSON.parse(row.queue || "[]") as PlaybackState["playlist"];
          const idx = row.queueIndex ?? -1;
          globalState = {
            currentTrack: idx >= 0 && idx < queueTracks.length ? queueTracks[idx] : null,
            playlist: queueTracks,
            isPlaying: this.state.isPlaying,
            playbackPosition: this.state.playbackPosition,
          };
        }
      } catch (e) {
        console.warn("[MusicChatAgent] Failed to read global queue:", e);
      }
    }

    // ── Structured tracing ──
    const log = createLogger();
    const t0 = Date.now();
    let firstTokenLogged = false;
    let lastChunkAt = t0;
    let chunkCount = 0;
    let lastChunkType = "";

    log.info("request", {
      sessionId,
      userId,
      storefront,
      messageCount,
      playlistLength: globalState.playlist.length,
      currentTrack: globalState.currentTrack?.name || null,
      isPlaying: globalState.isPlaying,
    });

    // ---------------------------------------------------------------------------
    // Resolve active LLM config: DB first, env vars as fallback.
    // DB config is set via the admin panel (/api/llm-config).
    // ---------------------------------------------------------------------------
    const [dbConfig, dbSearchConfig] = await Promise.all([
      this.env.DB.prepare(
        "SELECT * FROM llm_provider_config WHERE isActive = 1 LIMIT 1"
      ).first<{
        providerType: string; model: string; gateway: string;
        gatewayAccountId: string | null; gatewayId: string | null;
        gatewayToken: string | null; apiKey: string; baseUrl: string | null;
      }>().catch(() => null),
      this.env.DB.prepare(
        "SELECT providerType, apiKey FROM search_provider_config WHERE isActive = 1 LIMIT 1"
      ).first<{ providerType: string; apiKey: string }>().catch(() => null),
    ]);

    // Decrypt helper — mirrors apps/admin/src/index.ts decrypt()
    const decryptKey = async (encoded: string): Promise<string> => {
      const hex = (this.env as unknown as Record<string, string>)["ADMIN_ENCRYPTION_KEY"];
      if (!hex || hex.length < 64) return encoded;
      try {
        const raw = new Uint8Array(hex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
        const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
        const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
        return new TextDecoder().decode(pt);
      } catch { return encoded; }
    };

    const resolvedProvider = dbConfig?.providerType || this.env.LLM_PROVIDER || "anthropic";
    const resolvedApiKey = dbConfig ? await decryptKey(dbConfig.apiKey) : "";
    const resolvedGwToken = dbConfig?.gatewayToken ? await decryptKey(dbConfig.gatewayToken) : this.env.CF_AIG_TOKEN;

    // Resolve search provider: DB config takes priority over env vars
    const searchDbOverride = dbSearchConfig
      ? { providerType: dbSearchConfig.providerType, apiKey: dbSearchConfig.apiKey ? await decryptKey(dbSearchConfig.apiKey) : "" }
      : undefined;

    let model: Parameters<typeof streamText>[0]["model"];
    let tools: Parameters<typeof streamText>[0]["tools"];
    let maxOutputTokens: number;
    let providerOptions: Parameters<typeof streamText>[0]["providerOptions"];

    if (resolvedProvider === "anthropic") {
      // -----------------------------------------------------------------------
      // Anthropic — via Cloudflare AI Gateway (or direct if no gateway config)
      // -----------------------------------------------------------------------
      const useGateway = dbConfig
        ? dbConfig.gateway === "cf_ai_gateway"
        : true; // env-based default always uses gateway

      const anthropicApiKey = resolvedApiKey || this.env.CF_AIG_TOKEN;
      const anthropicBaseURL = useGateway
        ? `https://gateway.ai.cloudflare.com/v1/${dbConfig?.gatewayAccountId || this.env.CLOUDFLARE_ACCOUNT_ID}/${dbConfig?.gatewayId || this.env.AI_GATEWAY_ID}/anthropic`
        : undefined;

      const anthropic = createAnthropic({ apiKey: anthropicApiKey, baseURL: anthropicBaseURL });

      model = anthropic(dbConfig?.model || this.env.ANTHROPIC_MODEL || "claude-sonnet-4-6") as unknown as Parameters<typeof streamText>[0]["model"];
      const effectiveSearchProvider = (searchDbOverride?.providerType || this.env.SEARCH_PROVIDER || "anthropic").toLowerCase();
      const nativeSearch = effectiveSearchProvider === "anthropic"
        ? { web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }) }
        : (() => { const t = buildWebSearchTool(this.env, searchDbOverride); return t ? { web_search: t } : {}; })();
      tools = {
        ...createMusicTools({ env: this.env, state: globalState, storefront }),
        ...nativeSearch,
      };
      const thinkingBudget = parseInt(this.env.ANTHROPIC_THINKING_BUDGET || "0");
      maxOutputTokens = thinkingBudget > 0 ? 16384 : 4096;
      providerOptions = thinkingBudget > 0
        ? { anthropic: { thinking: { type: "enabled" as const, budgetTokens: thinkingBudget } } }
        : undefined;
    } else {
      // -----------------------------------------------------------------------
      // Any OpenAI-compatible provider (Doubao, OpenAI, custom, etc.)
      // Uses Tavily for web search — the de-facto standard community search tool
      // for AI agents (works with any LLM, no provider-specific hacks needed).
      // -----------------------------------------------------------------------
      const apiKey = resolvedApiKey || this.env.DOUBAO_API_KEY;
      const baseURL = dbConfig?.baseUrl ||
        (resolvedProvider === "doubao" ? "https://ark.cn-beijing.volces.com/api/v3" : undefined);

      // Cloudflare AI Gateway wrapping for OpenAI-compatible providers
      let finalBaseURL = baseURL;
      if (dbConfig?.gateway === "cf_ai_gateway" && dbConfig.gatewayAccountId && dbConfig.gatewayId) {
        const cfBase = `https://gateway.ai.cloudflare.com/v1/${dbConfig.gatewayAccountId}/${dbConfig.gatewayId}`;
        finalBaseURL = resolvedProvider === "openai"
          ? `${cfBase}/openai`
          : `${cfBase}/openai-compatible`;
      }

      const provider = createOpenAICompatible({
        name: resolvedProvider,
        apiKey,
        baseURL: finalBaseURL || "https://api.openai.com/v1",
      });

      model = provider(dbConfig?.model || this.env.DOUBAO_MODEL || "doubao-1.5-pro-32k") as unknown as Parameters<typeof streamText>[0]["model"];

      const webSearchTool = buildWebSearchTool(this.env, searchDbOverride);
      tools = {
        ...createMusicTools({ env: this.env, state: globalState, storefront }),
        ...(webSearchTool ? { web_search: webSearchTool } : {}),
      };
      maxOutputTokens = 4096;
      providerOptions = undefined;
    }

    const systemPrompt = buildSystemPrompt(globalState);
    const modelMessages = await convertToModelMessages(this.messages);

    log.info("config", {
      provider: resolvedProvider,
      model: dbConfig?.model || "env-default",
      source: dbConfig ? "db" : "env",
      search: searchDbOverride?.providerType || this.env.SEARCH_PROVIDER || "anthropic",
      maxOutputTokens,
      systemPromptLen: systemPrompt.length,
      inputMessageCount: modelMessages.length,
    });

    const llmSpan = log.span("llm-stream");

    const result = streamText({
      model,
      maxOutputTokens,
      providerOptions,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(10), // Allow multi-turn tool calling (replaces LangGraph agentic loop)
      abortSignal: options?.abortSignal,

      // ── Chunk tracking (TTFT + stall detection) ──
      onChunk: ({ chunk }) => {
        const now = Date.now();
        const gap = now - lastChunkAt;
        chunkCount++;

        // Log first text token
        if (chunk.type === "text-delta" && !firstTokenLogged) {
          firstTokenLogged = true;
          log.info("first-token", { ttftMs: now - t0 });
        }

        // Log chunk type transitions (text→tool-call, etc.) to see what phase we're in
        if (chunk.type !== lastChunkType) {
          log.info("chunk-phase", {
            from: lastChunkType || "start",
            to: chunk.type,
            elapsedMs: now - t0,
            chunkCount,
          });
          lastChunkType = chunk.type;
        }

        // Log stalls: if >10s between chunks, something is hanging
        if (gap > 10_000) {
          log.warn("chunk-stall", {
            gapMs: gap,
            chunkType: chunk.type,
            elapsedMs: now - t0,
            chunkCount,
          });
        }

        lastChunkAt = now;
      },

      // ── Tool-level tracing ──
      experimental_onToolCallStart: ({ toolCall, stepNumber }) => {
        log.info("tool-start", {
          tool: toolCall.toolName,
          step: stepNumber,
          args: truncateArgs(toolCall.input),
        });
      },
      experimental_onToolCallFinish: (event) => {
        const data: Record<string, unknown> = {
          tool: event.toolCall.toolName,
          step: event.stepNumber,
          durationMs: event.durationMs,
          success: event.success,
        };
        if (!event.success) {
          data.error = String(event.error).slice(0, 200);
        }
        log.info("tool-end", data);
      },

      // ── Step-level LLM response details ──
      onStepFinish: (step) => {
        const now = Date.now();
        log.info("step-end", {
          stepNumber: step.stepNumber,
          finishReason: step.finishReason,
          elapsedMs: now - t0,
          sinceLastChunkMs: now - lastChunkAt,
          chunkCount,
          inputTokens: step.usage.inputTokens,
          outputTokens: step.usage.outputTokens,
          totalTokens: step.usage.totalTokens,
          responseId: step.response.id,
          responseModel: step.response.modelId,
          toolCalls: step.toolCalls.map((tc) => tc.toolName),
          warnings: step.warnings?.length ? step.warnings.map((w) => String(w)) : undefined,
          textLen: step.text?.length ?? 0,
          reasoningLen: step.reasoningText?.length ?? 0,
        });
      },

      // ── Error logging ──
      onError: ({ error }) => {
        log.error("stream-error", {
          error: String(error).slice(0, 500),
          elapsedMs: Date.now() - t0,
        });
      },

      // ── Final summary + existing D1/title logic ──
      onFinish: async ({ text, usage, finishReason, steps, response }) => {
        const now = Date.now();
        llmSpan.end({
          totalSteps: steps.length,
          finishReason,
          sinceLastChunkMs: now - lastChunkAt,
          totalChunks: chunkCount,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          responseId: response.id,
          responseModel: response.modelId,
          textLen: text?.length ?? 0,
        });

        if (!sessionId) return;

        // streamText's onFinish fires when the LLM is done, BEFORE the SDK
        // persists the assistant message to this.messages. So we use the
        // result `text` directly and add +1 for the assistant message.
        const totalMessages = messageCount + 1; // +1 for the assistant reply
        const preview = (text || "...").slice(0, 100);

        this.env.DB.batch([
          this.env.DB.prepare(
            'UPDATE "conversation" SET "messageCount" = ?, "lastMessagePreview" = ?, "lastMessageAt" = ?, "updatedAt" = ? WHERE "id" = ?'
          ).bind(totalMessages, preview, now, now, sessionId),
        ]).catch((e) => log.warn("d1-sync-error", { error: String(e) }));

        // Generate title after first exchange (1 user + 1 assistant = 2)
        if (userId && messageCount <= 2) {
          // Build simplified messages from what we have: this.messages
          // contains the user message(s), plus the assistant text from result
          const simplifiedMessages = this.messages.map((m) => ({
            role: m.role,
            content: m.parts
              .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
              .map((p) => p.text)
              .join("") || "",
          }));
          // Append the assistant reply (not yet in this.messages)
          simplifiedMessages.push({ role: "assistant", content: text });

          generateAndUpdateTitle(
            this.env.DB,
            sessionId,
            simplifiedMessages.slice(0, 5),
            this.env
          ).catch((e) => log.warn("title-gen-error", { error: String(e) }));
        }
      },
    });

    return result.toUIMessageStreamResponse();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate tool args for logging (avoid dumping huge search results). */
function truncateArgs(args: unknown): unknown {
  if (args == null) return args;
  const str = JSON.stringify(args);
  if (str.length <= 200) return args;
  return str.slice(0, 200) + "…";
}
