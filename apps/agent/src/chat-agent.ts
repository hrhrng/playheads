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
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createMusicTools } from "./tools";
import { generateAndUpdateTitle } from "./title";
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

    // Build model + tools based on LLM_PROVIDER env var.
    // Supported values: "anthropic" (default), "doubao"
    const llmProvider = this.env.LLM_PROVIDER || "anthropic";

    let model: Parameters<typeof streamText>[0]["model"];
    let tools: Parameters<typeof streamText>[0]["tools"];
    let maxOutputTokens: number;
    let providerOptions: Parameters<typeof streamText>[0]["providerOptions"];

    if (llmProvider === "doubao") {
      // -----------------------------------------------------------------------
      // Doubao (ByteDance Volcano Engine Ark)
      // API is fully OpenAI-compatible.
      //
      // Two modes:
      //   1. Bot endpoint (DOUBAO_BOT_ID set): calls /api/v3/bots/chat/completions
      //      The bot has the 联网内容插件 (web search plugin) enabled in the
      //      console, so web search is handled transparently by the platform.
      //   2. Direct endpoint (no bot ID): calls /api/v3/chat/completions,
      //      no web search available.
      // -----------------------------------------------------------------------
      const botId = this.env.DOUBAO_BOT_ID;
      const baseURL = botId
        ? "https://ark.cn-beijing.volces.com/api/v3/bots"
        : "https://ark.cn-beijing.volces.com/api/v3";
      const modelId = botId || this.env.DOUBAO_MODEL || "doubao-1.5-pro-32k";

      const doubao = createOpenAI({
        apiKey: this.env.DOUBAO_API_KEY,
        baseURL,
      });

      model = doubao(modelId);
      // Music tools work with any provider. Web search is handled by the
      // Doubao Bot platform plugin — no explicit tool declaration needed.
      tools = createMusicTools({ env: this.env, state: globalState, storefront });
      maxOutputTokens = 4096;
      providerOptions = undefined;
    } else {
      // -----------------------------------------------------------------------
      // Anthropic (default) — routed through Cloudflare AI Gateway
      // -----------------------------------------------------------------------
      const anthropic = createAnthropic({
        apiKey: this.env.CF_AIG_TOKEN,
        baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_ID}/anthropic`,
      });

      model = anthropic(this.env.ANTHROPIC_MODEL || "claude-sonnet-4-6");

      // All tools have `execute` on the server. Player control tools embed
      // `_action` in their results — the frontend picks these up and dispatches
      // MusicKit JS operations as a side effect (same as old SSE action pattern).
      // Claude's native web_search is added as a server-side tool for discovery.
      tools = {
        ...createMusicTools({ env: this.env, state: globalState, storefront }),
        web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
      };

      // Extended thinking (configurable via ANTHROPIC_THINKING_BUDGET env var)
      const thinkingBudget = parseInt(this.env.ANTHROPIC_THINKING_BUDGET || "0");
      maxOutputTokens = thinkingBudget > 0 ? 16384 : 4096;
      providerOptions = thinkingBudget > 0 ? {
        anthropic: {
          thinking: { type: "enabled" as const, budgetTokens: thinkingBudget },
        },
      } : undefined;
    }

    const result = streamText({
      model,
      maxOutputTokens,
      providerOptions,
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
