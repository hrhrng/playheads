/**
 * Music tools for the Playhead DJ agent.
 * Ported from apps/backend/agent.py tools using Vercel AI SDK tool() format.
 */
import { tool } from "ai";
import { z } from "zod";
import { appleMusicGet, parseTrackFromSong } from "../apple-music";
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
 * This pattern allows tools to access env, state, and emitAction
 * without global variables.
 */
export function createMusicTools(ctx: ToolContext) {
  return {
    search_music: tool({
      description:
        "Search for music tracks on Apple Music. Returns a list of tracks with IDs.",
      parameters: z.object({
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

    add_to_queue: tool({
      description:
        "Add a track to the queue by its Apple Music ID (from search_music results).",
      parameters: z.object({
        track_id: z
          .string()
          .describe('Apple Music song ID (e.g. "12345" from search results)'),
      }),
      execute: async ({ track_id }) => {
        try {
          const result = await appleMusicGet(
            `v1/catalog/us/songs/${track_id}`,
            ctx.env
          );

          const songs =
            (result.data as Array<Record<string, unknown>>) || [];
          if (!songs.length) {
            return { message: `No track found for ID '${track_id}'.` };
          }

          const track = parseTrackFromSong(songs[0]);

          return {
            message: `Added '${track.name}' by ${track.artist} to queue.`,
            action: {
              type: "add_to_queue",
              track_id: track.id,
              name: track.name,
              artist: track.artist,
              album: track.album,
              artwork_url: track.artwork_url,
              duration: track.duration,
            },
          };
        } catch (e) {
          return { message: `Error adding to queue: ${String(e)}` };
        }
      },
    }),

    play_track: tool({
      description:
        "Play a specific track from the playlist by its position number (1-indexed).",
      parameters: z.object({
        index: z
          .string()
          .describe("Track position number starting from 1"),
      }),
      execute: async ({ index }) => {
        const idx = parseInt(index);
        if (isNaN(idx)) {
          return { message: "Please provide a valid track number." };
        }
        return {
          message: `Playing track ${idx}.`,
          action: { type: "play_track", index: idx - 1 },
        };
      },
    }),

    skip_next: tool({
      description: "Skip to the next track in the playlist.",
      parameters: z.object({}),
      execute: async () => {
        return {
          message: "Skipping to the next track.",
          action: { type: "skip_next" },
        };
      },
    }),

    remove_from_playlist: tool({
      description:
        "Remove a track from the playlist by its position number (1-indexed).",
      parameters: z.object({
        index: z
          .string()
          .describe("Track position number starting from 1"),
      }),
      execute: async ({ index }) => {
        const idx = parseInt(index);
        if (isNaN(idx)) {
          return { message: "Please provide a valid track number." };
        }
        return {
          message: `Removed track ${idx} from playlist.`,
          action: { type: "remove_track", index: idx - 1 },
        };
      },
    }),

    get_now_playing: tool({
      description: "Get information about the currently playing track.",
      parameters: z.object({}),
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
      parameters: z.object({}),
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
