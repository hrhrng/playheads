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
import { streamText, convertToModelMessages } from "ai";
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

Workflow:
- "Play X" → search_music(X) → add_to_queue(id) → play_track(position)
- "Add X to queue" → search_music(X) → add_to_queue(id)
- "Search X" → search_music(X) — just search, show results
- "Play track N" → play_track(N) — play an existing track in the playlist
- "Skip" / "Next" → skip_next()
- "Remove N" → remove_from_playlist(N)
- "What's playing?" → get_now_playing()
- "Show queue" → get_playlist()

IMPORTANT:
- search_music only searches — it does NOT add to queue or play.
- add_to_queue needs a track_id from search_music results.
- play_track plays a track ALREADY in the playlist (1-indexed).
- remove_from_playlist takes a 1-indexed position.

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
    // Collect MusicKit actions emitted by tools during this request
    const pendingActions: Array<{ type: string; data: Record<string, unknown> }> = [];

    // Create tools bound to current context
    const tools = createMusicTools({
      env: this.env,
      state: this.state,
      emitAction: (type, data) => {
        pendingActions.push({ type, data });
      },
    });

    // Select LLM provider via AI Gateway
    const provider = this.env.LLM_PROVIDER || "anthropic";
    const gatewayBase = this.env.AI_GATEWAY_ID
      ? `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_ID}`
      : null;

    let model;
    if (provider === "openai") {
      const openai = createOpenAI({
        apiKey: this.env.OPENAI_API_KEY,
        baseURL: gatewayBase
          ? `${gatewayBase}/openai`
          : this.env.OPENAI_BASE_URL || undefined,
      });
      model = openai("gpt-5-mini");
    } else {
      const anthropic = createAnthropic({
        apiKey: this.env.ANTHROPIC_API_KEY,
        baseURL: gatewayBase ? `${gatewayBase}/anthropic` : undefined,
      });
      model = anthropic(this.env.ANTHROPIC_MODEL || "claude-sonnet-4-6");
    }

    // Extract session context from custom body
    const sessionId = (options?.body as Record<string, unknown>)?.session_id as string | undefined;
    const userId = (options?.body as Record<string, unknown>)?.user_id as string | undefined;
    const messageCount = this.messages.length;

    const result = streamText({
      model,
      system: buildSystemPrompt(this.state),
      messages: await convertToModelMessages(this.messages),
      tools,
      maxSteps: 10, // Allow multi-turn tool calling (replaces LangGraph agentic loop)
      abortSignal: options?.abortSignal,
      onFinish: async () => {
        // Generate title after 2nd message (1 user + 1 assistant)
        if (sessionId && userId && messageCount <= 2) {
          const simplifiedMessages = this.messages.slice(0, 5).map((m) => ({
            role: m.role,
            content:
              typeof m.content === "string"
                ? m.content
                : m.parts
                    ?.filter(
                      (p: { type: string }) => p.type === "text"
                    )
                    .map(
                      (p: { type: string; text?: string }) => p.text || ""
                    )
                    .join("") || "",
          }));
          // Fire-and-forget title generation
          generateAndUpdateTitle(
            this.env.DB,
            sessionId,
            simplifiedMessages,
            this.env
          ).catch((e) => console.warn("Title generation failed:", e));
        }
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
