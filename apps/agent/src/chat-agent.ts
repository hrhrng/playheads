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
import { z } from "zod";
import { createMusicTools } from "./tools";
import { generateAndUpdateTitle } from "./title";
import { resolveLLM } from "./resolve-llm";
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
      ? { providerType: dbSearchConfig.providerType, apiKey: dbSearchConfig.apiKey || "" }
      : undefined;

    // Build web search tool: native Anthropic search or external (Brave/Tavily)
    const effectiveSearchProvider = (searchDbOverride?.providerType || this.env.SEARCH_PROVIDER || (card?.nativeSearch ? "anthropic" : "")).toLowerCase();

    const musicTools = createMusicTools({ env: this.env, state: globalState, storefront });
    let tools: Parameters<typeof streamText>[0]["tools"] = musicTools;

    if (effectiveSearchProvider === "anthropic" && anthropicInstance) {
      tools = { ...musicTools, web_search: anthropicInstance.tools.webSearch_20250305({ maxUses: 5 }) };
    } else {
      const webSearchTool = buildWebSearchTool(this.env, searchDbOverride);
      if (webSearchTool) {
        tools = { ...musicTools, web_search: webSearchTool };
      }
    }

    console.log(`[MusicChatAgent] card=${card?.id || "unknown"} thinking=${!!providerOptions} maxOut=${maxOutputTokens} search=${effectiveSearchProvider || "none"}`);

    const result = streamText({
      model: model as Parameters<typeof streamText>[0]["model"],
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
      system: buildSystemPrompt(globalState),
      messages: await convertToModelMessages(this.messages),
      tools,
      stopWhen: stepCountIs(10), // Allow multi-turn tool calling (replaces LangGraph agentic loop)
      abortSignal: options?.abortSignal,
      onFinish: async ({ text }) => {
        console.log("[MusicChatAgent] onFinish sessionId=%s textLen=%d", sessionId, text?.length || 0);
        if (!sessionId) return;

        // streamText's onFinish fires when the LLM is done, BEFORE the SDK
        // persists the assistant message to this.messages. So we use the
        // result `text` directly and add +1 for the assistant message.
        const now = Date.now();
        const totalMessages = messageCount + 1; // +1 for the assistant reply
        const preview = (text || "...").slice(0, 100);

        this.env.DB.batch([
          this.env.DB.prepare(
            'UPDATE "conversation" SET "messageCount" = ?, "lastMessagePreview" = ?, "lastMessageAt" = ?, "updatedAt" = ? WHERE "id" = ?'
          ).bind(totalMessages, preview, now, now, sessionId),
        ]).catch((e) => console.warn("D1 metadata sync failed:", e));

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
          ).catch((e) => console.warn("Title generation failed:", e));
        }
      },
    });

    return result.toUIMessageStreamResponse();
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
