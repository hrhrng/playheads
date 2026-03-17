/**
 * Music tools for the Playhead DJ agent.
 *
 * Player control tools (play_track, skip_next, remove_from_playlist,
 * add_to_queue) run on the server and return JSON results that include
 * an `_action` field. The client watches for these action payloads in
 * tool results and executes the corresponding MusicKit JS operations
 * as a side effect — matching the old SSE action dispatch pattern.
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

/** Action payload embedded in tool results for client-side MusicKit dispatch. */
export interface MusicAction {
  type: "add_to_queue" | "play_track" | "skip_next" | "remove_track";
  data: Record<string, unknown>;
}

/**
 * Create all music tools bound to the given context.
 *
 * All tools have `execute` — the AI SDK auto-calls them on the server.
 * Player control tools embed a `_action` field in their result so the
 * frontend can dispatch MusicKit operations (same pattern as old SSE actions).
 */
export function createMusicTools(ctx: ToolContext) {
  return {
    // ── Player control tools (server execute + client MusicKit side effect) ──

    add_to_queue: tool({
      description:
        "Add a track to the queue by its Apple Music ID (from search_music results).",
      inputSchema: z.object({
        track_id: z
          .string()
          .describe('Apple Music song ID (e.g. "12345" from search results)'),
      }),
      execute: async ({ track_id }) => {
        try {
          // Fetch full track info from Apple Music catalog (like old Python backend)
          const result = await appleMusicGet(
            `v1/catalog/us/songs/${track_id}`,
            ctx.env
          );
          const songs = (result.data as Array<Record<string, unknown>>) || [];
          if (!songs.length) {
            return `No track found for ID '${track_id}'.`;
          }

          const song = songs[0];
          const attrs = (song.attributes || {}) as Record<string, unknown>;
          const artwork = (attrs.artwork || {}) as Record<string, unknown>;
          const name = (attrs.name as string) || "Unknown";
          const artist = (attrs.artistName as string) || "Unknown Artist";

          // Return result with embedded action for client-side MusicKit dispatch
          return JSON.stringify({
            message: `Added '${name}' by ${artist} to queue.`,
            _action: {
              type: "add_to_queue",
              data: {
                track_id: song.id as string,
                name,
                artist,
                album: (attrs.albumName as string) || "",
                artwork_url: (artwork.url as string) || "",
                duration: ((attrs.durationInMillis as number) || 0) / 1000,
              },
            },
          });
        } catch (e) {
          return `Error adding to queue: ${String(e)}`;
        }
      },
    }),

    play_track: tool({
      description:
        "Play a specific track from the playlist by its position number (1-indexed).",
      inputSchema: z.object({
        index: z
          .string()
          .describe("Track position number starting from 1"),
      }),
      execute: async ({ index }) => {
        let idx: number;
        try {
          idx = parseInt(index);
        } catch {
          return "Please provide a valid track number.";
        }
        if (isNaN(idx)) return "Please provide a valid track number.";

        return JSON.stringify({
          message: `Playing track ${idx}.`,
          _action: {
            type: "play_track",
            data: { index: idx - 1 },
          },
        });
      },
    }),

    skip_next: tool({
      description: "Skip to the next track in the playlist.",
      inputSchema: z.object({}),
      execute: async () => {
        return JSON.stringify({
          message: "Skipping to the next track.",
          _action: {
            type: "skip_next",
            data: {},
          },
        });
      },
    }),

    remove_from_playlist: tool({
      description:
        "Remove a track from the playlist by its position number (1-indexed).",
      inputSchema: z.object({
        index: z
          .string()
          .describe("Track position number starting from 1"),
      }),
      execute: async ({ index }) => {
        let idx: number;
        try {
          idx = parseInt(index);
        } catch {
          return "Please provide a valid track number.";
        }
        if (isNaN(idx)) return "Please provide a valid track number.";

        return JSON.stringify({
          message: `Removed track ${idx} from playlist.`,
          _action: {
            type: "remove_track",
            data: { index: idx - 1 },
          },
        });
      },
    }),

    // ── Server-only tools ──

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
