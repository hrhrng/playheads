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
import { streamText, convertToModelMessages, stepCountIs, tool, createUIMessageStream, createUIMessageStreamResponse, type SystemModelMessage } from "ai";
import { z } from "zod";
import { createMusicTools } from "./tools";
import { pipeYamlRender } from "@json-render/yaml";
import { yamlPrompt } from "@json-render/yaml";
import { musicCatalog } from "./genui-catalog";
import { generateAndUpdateTitle } from "./title";
import { resolveLLM, decryptApiKey } from "./resolve-llm";
import type { Env, PlaybackState } from "./types";

// ---------------------------------------------------------------------------
// System Prompt (ported from agent.py:298-322)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_STATIC = `You are a friendly music DJ assistant called "Playhead DJ". You help users discover and play music.

Available Tools:
- search_music(query) — search Apple Music catalog. Returns track list with IDs.
- web_search(query) — search the web for music recommendations, playlist ideas, artist info, trending songs, or genre exploration.
- get_now_playing() — check what's currently playing.
- get_playlist() — show the current playlist/queue.
- add_to_queue(track_id) — add a track by Apple Music ID (from search_music results).
- play_track(index) — play a track ALREADY in the playlist (1-indexed position).
- skip_next() — skip to the next track.
- remove_from_playlist(index) — remove a track by position (1-indexed).

You can also render rich visual UIs (timelines, album grids, artist spotlights) inline using YAML spec blocks. See the GENUI section below for details.

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
- "History of X" / "How did X evolve?" / "Best albums of Y" / "Compare X vs Y" / "Show me artist's discography" → FIRST call search_music for each key album/track to get real Apple Music IDs, THEN output a yaml-spec block using those real IDs in trackId props. Never make up IDs.

IMPORTANT:
- search_music only searches — it does NOT add to queue or play.
- add_to_queue needs a track_id from search_music results.
- play_track plays a track ALREADY in the playlist (1-indexed).
- remove_from_playlist takes a 1-indexed position.
- web_search is for discovery and recommendations (web results). search_music is for finding specific tracks on Apple Music.
- When asked to build a playlist, use web_search for ideas, then search_music + add_to_queue for each track.

Be conversational and fun! Keep responses concise.`;

// Hoist GENUI prompt to module level — musicCatalog is constant
const GENUI_PROMPT = yamlPrompt(musicCatalog, {
  mode: "inline",
  system:
    "\n\nGENUI — Rich Visual UI\n" +
    "When asked about genre history, album timelines, artist spotlights, best-of lists, or comparisons:\n" +
    "1. FIRST call search_music for each key album/track to get real Apple Music track IDs.\n" +
    "2. THEN output a yaml-spec block using those real IDs in the trackId prop.\n" +
    "3. NEVER fabricate track IDs. Only use IDs returned by search_music.\n" +
    "4. Respond conversationally, then include the yaml-spec block.",
  customRules: [
    "CRITICAL: AlbumCard and TrackCard MUST have a real trackId from search_music results. Do NOT use made-up IDs.",
    "For AlbumCard, set trackId to a real Apple Music song ID (e.g. '965771855'). Artwork is auto-fetched from the track.",
    "Only use 'query' as a fallback when you absolutely cannot search first.",
    "Use TimelineEra children inside a Section to build vertical timelines.",
    "Use multiple AlbumCard children inside a TimelineEra for albums of that period.",
    "Keep visuals focused — 3-6 TimelineEra nodes for timelines, 4-9 AlbumCards for grids.",
    "Do NOT add call-to-action text like '点选播放', '快来听', 'add 红豆', '试试加到队列' in subtitles or conversational text after the yaml-spec. Keep responses clean and concise.",
  ],
});

const STATIC_SYSTEM = SYSTEM_PROMPT_STATIC + "\n\n" + GENUI_PROMPT;

/**
 * Build a web_search tool.
 * Priority: DB config (from search_provider_config table) > env vars.
 *
 * SEARCH_PROVIDER env values: "brave" | "tavily" | "none" (anything else = no search)
 * Defaults for Anthropic provider are handled in the caller (native webSearch_20250305).
 */
function buildWebSearchTool(env: Env, dbOverride?: { providerType: string; apiKey: string }) {
  const provider = (dbOverride?.providerType || env.SEARCH_PROVIDER || "").toLowerCase();
  console.log(`[WebSearch] buildWebSearchTool provider=${provider} dbOverride=${JSON.stringify(dbOverride ? { providerType: dbOverride.providerType, hasApiKey: !!dbOverride.apiKey } : null)} envProvider=${env.SEARCH_PROVIDER || "unset"}`);

  if (provider === "brave") {
    const apiKey = dbOverride?.apiKey || env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      console.log("[WebSearch] Brave: no API key, returning undefined");
      return undefined;
    }
    console.log("[WebSearch] Brave: building tool");
    return tool({
      description: "Search the web for music recommendations, artist info, trending songs, or genre exploration.",
      inputSchema: z.object({ query: z.string().describe("Search query") }),
      execute: async ({ query }: { query: string }) => {
        console.log(`[WebSearch] Brave: executing query="${query}"`);
        try {
          const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
          const res = await fetch(url, { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" } });
          console.log(`[WebSearch] Brave: status=${res.status} statusText=${res.statusText}`);
          const rawText = await res.text();
          console.log(`[WebSearch] Brave: rawResponse=${rawText.substring(0, 500)}`);
          const data = JSON.parse(rawText) as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
          const results = data.web?.results || [];
          console.log(`[WebSearch] Brave: resultCount=${results.length}`);
          if (!results.length) return `No results found for: ${query}`;
          return results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.description}`).join("\n\n");
        } catch (e) {
          console.error(`[WebSearch] Brave: error=`, e);
          return `Web search failed: ${e}`;
        }
      },
    });
  }

  if (provider === "tavily") {
    const apiKey = dbOverride?.apiKey || env.TAVILY_API_KEY;
    if (!apiKey) {
      console.log("[WebSearch] Tavily: no API key, returning undefined");
      return undefined;
    }
    console.log("[WebSearch] Tavily: building tool");
    return tool({
      description: "Search the web for music recommendations, artist info, trending songs, or genre exploration.",
      inputSchema: z.object({ query: z.string().describe("Search query") }),
      execute: async ({ query }: { query: string }) => {
        console.log(`[WebSearch] Tavily: executing query="${query}"`);
        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ query, max_results: 5, search_depth: "basic" }),
          });
          console.log(`[WebSearch] Tavily: status=${res.status} statusText=${res.statusText}`);
          const rawText = await res.text();
          console.log(`[WebSearch] Tavily: rawResponse=${rawText.substring(0, 500)}`);
          const data = JSON.parse(rawText) as { results?: Array<{ title: string; url: string; content: string }> };
          const resultCount = (data.results || []).length;
          console.log(`[WebSearch] Tavily: resultCount=${resultCount}`);
          return (data.results || []).map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.content}`).join("\n\n");
        } catch (e) {
          console.error(`[WebSearch] Tavily: error=`, e);
          return `Web search failed: ${e}`;
        }
      },
    });
  }

  console.log(`[WebSearch] No matching provider for "${provider}", returning undefined`);
  return undefined;
}

function buildStateMessage(state: PlaybackState): SystemModelMessage {
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

  return { role: "system" as const, content: "Current State:\n" + lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a plain-text preview from a UIMessage (for conversation list). */
function extractTextPreview(msg: import("ai").UIMessage): string {
  for (const part of msg.parts) {
    if (part.type === "text" && part.text) return part.text;
  }
  return "...";
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

    console.log("[MusicChatAgent] onChatMessage", {
      sessionId,
      userId,
      storefront,
      messageCount,
      playlistLength: globalState.playlist.length,
      currentTrack: globalState.currentTrack?.name || null,
      isPlaying: globalState.isPlaying,
    });

    // ---------------------------------------------------------------------------
    // Resolve LLM via Model Card architecture (DB caller → resource → card)
    // ---------------------------------------------------------------------------
    const { model, card, providerOptions, maxOutputTokens, anthropicInstance } =
      await resolveLLM(this.env, "chat");

    // Resolve search provider: DB config > env vars
    const dbSearchConfig = await this.env.DB.prepare(
      "SELECT providerType, apiKey FROM search_provider_config WHERE isActive = 1 LIMIT 1"
    ).first<{ providerType: string; apiKey: string }>().catch(() => null);

    const searchDbOverride = dbSearchConfig
      ? { providerType: dbSearchConfig.providerType, apiKey: dbSearchConfig.apiKey ? await decryptApiKey(dbSearchConfig.apiKey, this.env) : "" }
      : undefined;

    // Build web search tool: native Anthropic search or external (Brave/Tavily)
    const effectiveSearchProvider = (searchDbOverride?.providerType || this.env.SEARCH_PROVIDER || (card?.nativeSearch ? "anthropic" : "")).toLowerCase();
    console.log(`[WebSearch] Resolution: dbOverride=${JSON.stringify(searchDbOverride ? { providerType: searchDbOverride.providerType, hasApiKey: !!searchDbOverride.apiKey } : null)} envProvider=${this.env.SEARCH_PROVIDER || "unset"} nativeSearch=${card?.nativeSearch} effective="${effectiveSearchProvider}" hasAnthropicInstance=${!!anthropicInstance}`);

    const toolCtx = { env: this.env, state: globalState, storefront };
    const musicTools = createMusicTools(toolCtx);
    let tools: Parameters<typeof streamText>[0]["tools"] = { ...musicTools };

    if (effectiveSearchProvider === "anthropic" && anthropicInstance) {
      console.log("[WebSearch] Using Anthropic native webSearch_20250305");
      tools = { ...musicTools, web_search: anthropicInstance.tools.webSearch_20250305({ maxUses: 5 }) as typeof tools[string] };
    } else {
      const webSearchTool = buildWebSearchTool(this.env, searchDbOverride);
      console.log(`[WebSearch] Custom tool built: ${webSearchTool ? "yes" : "no (undefined)"}`);
      if (webSearchTool) {
        tools = { ...musicTools, web_search: webSearchTool };
      } else {
        console.log("[WebSearch] WARNING: No web search tool registered!");
      }
    }

    console.log(`[MusicChatAgent] card=${card?.id || "unknown"} thinking=${!!providerOptions} maxOut=${maxOutputTokens} search=${effectiveSearchProvider || "none"}`);

    const convertedMessages = await convertToModelMessages(this.messages);
    const agentMessages = this.messages;
    const agentEnv = this.env;

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const result = streamText({
          model: model as Parameters<typeof streamText>[0]["model"],
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
          providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
          system: [
            {
              role: "system" as const,
              content: STATIC_SYSTEM,
              providerOptions: {
                anthropic: { cacheControl: { type: "ephemeral" } },
              },
            },
            buildStateMessage(globalState),
          ],
          messages: convertedMessages,
          tools,
          stopWhen: stepCountIs(10),
          abortSignal: options?.abortSignal,
          onStepFinish: ({ toolResults }) => {
            // Emit music actions as transient data parts (not persisted to SQLite)
            for (const tr of toolResults) {
              const output = (tr as unknown as { result: unknown }).result ?? (tr as unknown as { output: unknown }).output;
              try {
                const parsed = typeof output === "string" ? JSON.parse(output) : null;
                if (parsed?._action) {
                  writer.write({
                    transient: true,
                    type: "data-music-action",
                    data: { ...parsed._action, id: (tr as unknown as { toolCallId: string }).toolCallId },
                  });
                }
              } catch { /* not JSON */ }
            }
          },
          onFinish: async ({ text, usage }) => {
            console.log(JSON.stringify({
              event: "streamText.onFinish",
              sessionId,
              textLen: text?.length || 0,
              usage: {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cacheReadTokens: (usage as Record<string, unknown>).inputTokenDetails
                  ? ((usage as Record<string, unknown>).inputTokenDetails as Record<string, unknown>)?.cacheReadTokens
                  : undefined,
                cacheWriteTokens: (usage as Record<string, unknown>).inputTokenDetails
                  ? ((usage as Record<string, unknown>).inputTokenDetails as Record<string, unknown>)?.cacheWriteTokens
                  : undefined,
              },
            }));
            if (!sessionId) return;

            const now = Date.now();
            const totalMessages = messageCount + 1;
            const preview = (text || "...").slice(0, 100);

            agentEnv.DB.batch([
              agentEnv.DB.prepare(
                'UPDATE "conversation" SET "messageCount" = ?, "lastMessagePreview" = ?, "lastMessageAt" = ?, "updatedAt" = ? WHERE "id" = ?'
              ).bind(totalMessages, preview, now, now, sessionId),
            ]).catch((e) => console.warn("D1 metadata sync failed:", e));

            if (userId && messageCount <= 2) {
              const simplifiedMessages = agentMessages.map((m) => ({
                role: m.role,
                content: m.parts
                  .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
                  .map((p) => p.text)
                  .join("") || "",
              }));
              simplifiedMessages.push({ role: "assistant", content: text });

              generateAndUpdateTitle(
                agentEnv.DB,
                sessionId,
                simplifiedMessages.slice(0, 5),
                agentEnv
              ).catch((e) => console.warn("Title generation failed:", e));
            }
          },
        });

        // Pipe through YAML transform: intercepts ```yaml-spec fences,
        // parses them incrementally, and emits json-render data parts.
        writer.merge(pipeYamlRender(result.toUIMessageStream()));
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}

// Wrap onChatMessage to send errors back to the client instead of silently failing
const _orig = MusicChatAgent.prototype.onChatMessage;
MusicChatAgent.prototype.onChatMessage = async function (this: MusicChatAgent, ...args) {
  try {
    return await _orig.apply(this, args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Log full error details for API errors (status, body, headers)
    const details: Record<string, unknown> = { message: msg };
    if (e && typeof e === "object") {
      if ("statusCode" in e) details.statusCode = (e as Record<string, unknown>).statusCode;
      if ("responseBody" in e) details.responseBody = (e as Record<string, unknown>).responseBody;
      if ("url" in e) details.url = (e as Record<string, unknown>).url;
      if ("cause" in e) details.cause = String((e as Record<string, unknown>).cause);
    }
    console.error("[MusicChatAgent] onChatMessage error:", JSON.stringify(details));
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`3:"Agent error: ${msg.replace(/"/g, "'")}"\n`));
        c.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "X-Vercel-AI-Data-Stream": "v1" },
    });
  }
};
