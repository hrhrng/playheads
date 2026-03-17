/**
 * MusicChatAgent - Core AI chat agent powered by Cloudflare Agents SDK.
 *
 * Extends AIChatAgent for automatic message persistence, resumable streaming,
 * and multi-device synchronization. Uses Vercel AI SDK for unified LLM access
 * through Cloudflare AI Gateway.
 *
 * Ported from apps/backend/agent.py
 */
import { AIChatAgent, createToolsFromClientSchemas } from "@cloudflare/ai-chat";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
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
    // Merge server tools with client tool stubs (player control tools
    // are defined on the frontend and execute against MusicKit JS).
    const serverTools = createMusicTools({
      env: this.env,
      state: this.state,
    });
    const clientToolStubs = createToolsFromClientSchemas(options?.clientTools);
    const tools = { ...serverTools, ...clientToolStubs };

    // Route through Cloudflare AI Gateway
    const anthropic = createAnthropic({
      apiKey: this.env.CF_AIG_TOKEN,
      baseURL: `https://gateway.ai.cloudflare.com/v1/${this.env.CLOUDFLARE_ACCOUNT_ID}/${this.env.AI_GATEWAY_ID}/anthropic`,
    });
    const model = anthropic(this.env.ANTHROPIC_MODEL || "claude-sonnet-4-6");

    // Extract session context from custom body
    const sessionId = (options?.body as Record<string, unknown>)?.session_id as string | undefined;
    const userId = (options?.body as Record<string, unknown>)?.user_id as string | undefined;
    const messageCount = this.messages.length;

    const result = streamText({
      model,
      system: buildSystemPrompt(this.state),
      messages: await convertToModelMessages(this.messages),
      tools,
      stopWhen: stepCountIs(10), // Allow multi-turn tool calling (replaces LangGraph agentic loop)
      abortSignal: options?.abortSignal,
      onFinish: async ({ text }) => {
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
