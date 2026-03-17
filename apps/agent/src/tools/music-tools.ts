/**
 * Server-side music tools for the Playhead DJ agent.
 *
 * Player control tools (play_track, skip_next, remove_from_playlist,
 * add_to_queue) are defined here WITHOUT execute — the client handles
 * them via onToolCall in useAgentChat. This is the pattern recommended
 * by Cloudflare Agents docs for client-side tools.
 */
import { tool } from "ai";
import { z } from "zod";
import { appleMusicGet } from "../apple-music";
import type { Env, PlaybackState } from "../types";

/**
 * Tool context passed to tool execution.
 * Since Vercel AI SDK tools receive only their declared parameters,
 * we use closures to capture the context.
 */
export interface ToolContext {
  env: Env;
  state: PlaybackState;
}

/**
 * Create all music tools bound to the given context.
 *
 * Server tools (search_music, get_now_playing, get_playlist) have `execute`.
 * Client tools (add_to_queue, play_track, skip_next, remove_from_playlist)
 * have NO `execute` — when the AI calls them, the stream pauses and the
 * frontend's onToolCall callback handles execution via MusicKit JS.
 */
export function createMusicTools(ctx: ToolContext) {
  return {
    // ── Client-side tools (no execute — handled by frontend onToolCall) ──

    add_to_queue: tool({
      description:
        "Add a track to the queue by its Apple Music ID (from search_music results).",
      inputSchema: z.object({
        track_id: z
          .string()
          .describe('Apple Music song ID (e.g. "12345" from search results)'),
      }),
      // No execute — client handles via onToolCall
    }),

    play_track: tool({
      description:
        "Play a specific track from the playlist by its position number (1-indexed).",
      inputSchema: z.object({
        index: z
          .string()
          .describe("Track position number starting from 1"),
      }),
      // No execute — client handles via onToolCall
    }),

    skip_next: tool({
      description: "Skip to the next track in the playlist.",
      inputSchema: z.object({}),
      // No execute — client handles via onToolCall
    }),

    remove_from_playlist: tool({
      description:
        "Remove a track from the playlist by its position number (1-indexed).",
      inputSchema: z.object({
        index: z
          .string()
          .describe("Track position number starting from 1"),
      }),
      // No execute — client handles via onToolCall
    }),

    // ── Server-side tools (with execute) ──
    search_music: tool({
      description:
        "Search for music tracks on Apple Music. Returns a list of tracks with IDs.",
      inputSchema: z.object({
        query: z.string().describe("Search query string"),
      }),
      execute: async ({ query }) => {
        try {
          const result = await appleMusicGet(
            "v1/catalog/us/search",
            ctx.env,
            { term: query, types: "songs", limit: 5 }
          );

          const songs =
            ((
              (result.results as Record<string, unknown>)
                ?.songs as Record<string, unknown>
            )?.data as Array<Record<string, unknown>>) || [];

          if (!songs.length) {
            return `No results found for '${query}'`;
          }

          const lines = [`Search results for '${query}':`];
          for (let i = 0; i < songs.length; i++) {
            const song = songs[i];
            const attrs = (song.attributes || {}) as Record<string, unknown>;
            lines.push(
              `${i + 1}. ${attrs.name || "Unknown"} - ${attrs.artistName || "Unknown Artist"} (id: ${song.id})`
            );
          }
          return lines.join("\n");
        } catch (e) {
          return `Error searching music: ${String(e)}`;
        }
      },
    }),

    get_now_playing: tool({
      description: "Get information about the currently playing track.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.state.currentTrack) {
          return "No track is currently playing.";
        }
        const track = ctx.state.currentTrack;
        const status = ctx.state.isPlaying ? "playing" : "paused";
        let result = `Currently ${status}: '${track.name}' by ${track.artist}`;
        if (track.album) {
          result += ` from the album '${track.album}'`;
        }
        return result;
      },
    }),

    get_playlist: tool({
      description: "Get the current playlist/queue of tracks.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.state.playlist.length) {
          return "The playlist is empty.";
        }

        const lines = [
          `Playlist has ${ctx.state.playlist.length} tracks:`,
        ];
        const show = ctx.state.playlist.slice(0, 10);
        for (let i = 0; i < show.length; i++) {
          const track = show[i];
          const marker =
            ctx.state.currentTrack?.id === track.id ? "▶" : " ";
          lines.push(
            `${marker} ${i + 1}. ${track.name} - ${track.artist}`
          );
        }
        if (ctx.state.playlist.length > 10) {
          lines.push(
            `... and ${ctx.state.playlist.length - 10} more tracks`
          );
        }
        return lines.join("\n");
      },
    }),
  };
}
