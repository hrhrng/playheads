/**
 * Music tools for the Playhead DJ agent.
 *
 * add_to_queue executes in the browser and returns MusicKit acknowledgements.
 * Other player controls run on the server and return JSON results that include
 * an `_action` field. The client watches for these action payloads in
 * tool results and executes the corresponding MusicKit JS operations
 * as a side effect — matching the old SSE action dispatch pattern.
 */
import { tool, type UIMessage } from "ai";
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
  storefront: string;
  /** Conversation id for the active chat. When add_to_queue runs, the
   *  track is also appended to this conversation's `playlist` column so
   *  the topic accumulates its private music history. */
  sessionId?: string;
}

interface PlaylistEntry {
  id: string;
  name: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationSeconds: number;
  provider: 'apple-music';
}

/**
 * Append track snapshots to the conversation's `playlist` column. Reads
 * current playlist, dedupes by id (preserving incoming order for new
 * entries), writes back in one UPDATE. No-op when sessionId is unset.
 */
async function appendToConversationPlaylist(
  env: Env,
  sessionId: string | undefined,
  entries: PlaylistEntry[],
): Promise<void> {
  if (!sessionId || entries.length === 0) return;
  try {
    const row = await env.DB.prepare(
      'SELECT "playlist" FROM "conversation" WHERE "id" = ?',
    )
      .bind(sessionId)
      .first<{ playlist: string }>();
    if (!row) return;
    let list: PlaylistEntry[] = [];
    try { list = JSON.parse(row.playlist || '[]'); } catch { list = []; }
    const seen = new Set(list.map((t) => t.id));
    let appended = false;
    for (const e of entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      list.push(e);
      appended = true;
    }
    if (!appended) return;
    await env.DB.prepare(
      'UPDATE "conversation" SET "playlist" = ?, "updatedAt" = ? WHERE "id" = ?',
    )
      .bind(JSON.stringify(list), Date.now(), sessionId)
      .run();
  } catch (e) {
    console.warn('[appendToConversationPlaylist] failed:', e);
  }
}

/** Save only confirmed client-tool additions when the model resumes. */
export async function persistQueueToolResults(env: Env, sessionId: string | undefined, messages: UIMessage[]) {
  const latest = messages[messages.length - 1];
  if (latest?.role !== 'assistant') return;
  const entries: PlaylistEntry[] = [];
  for (const part of latest.parts) {
    if (part.type !== 'tool-add_to_queue' && !(part.type === 'dynamic-tool' && part.toolName === 'add_to_queue')) continue;
    if (part.state !== 'output-available') continue;
    try {
      const result = typeof part.output === 'string' ? JSON.parse(part.output) : part.output;
      if (!result?.ok || !Array.isArray(result.tracks)) continue;
      entries.push(...result.tracks.filter((track: PlaylistEntry) =>
        typeof track?.id === 'string' && track.provider === 'apple-music'));
    } catch { /* Legacy/non-JSON output has no confirmed additions. */ }
  }
  await appendToConversationPlaylist(env, sessionId, entries);
}

/** Action payload embedded in tool results for client-side MusicKit dispatch. */
export interface MusicAction {
  type: "add_to_queue" | "play_track" | "skip_next" | "remove_track";
  data: Record<string, unknown>;
}

/**
 * Create all music tools bound to the given context.
 *
 * add_to_queue is a client tool; the remaining player controls still use
 * legacy _action dispatch. Search and metadata tools execute on the server.
 */
export function createMusicTools(ctx: ToolContext) {
  return {
    // ── Player control tools (server execute + client MusicKit side effect) ──

    add_to_queue: tool({
      description:
        "Add one or more tracks to the queue by their Apple Music IDs (from search_music results). Always batch as many tracks as you want to queue into a single call — don't call this tool multiple times in a row.",
      inputSchema: z.object({
        track_ids: z
          .array(z.string())
          .min(1)
          .describe('Apple Music song IDs in the order they should be queued (e.g. ["12345","67890"]). Returned by search_music.'),
      }),
      // No execute: MusicKit runs in the browser. The client returns confirmed
      // additions and per-ID failures through addToolOutput before continuation.

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
        "Search Apple Music. Pass multiple queries (run in parallel) to broaden coverage. " +
        "Vary the queries to surface more results — e.g. use the song title in different " +
        "languages, try alternate phrasings, add version keywords, or combine artist + title " +
        "differently. Results are merged and ranked with Reciprocal Rank Fusion (RRF), so " +
        "tracks that rank highly across multiple queries float to the top.",
      inputSchema: z.object({
        queries: z.array(z.string()).describe("One or more search query strings. Different phrasings expand coverage."),
        limit: z.number().min(1).max(25).optional().default(5).describe("Max results per query (default 5)."),
      }),
      execute: async ({ queries, limit = 5 }) => {
        const clampedLimit = Math.min(Math.max(1, limit), 25);
        const RRF_K = 60;

        const searchOne = async (q: string): Promise<Array<Record<string, unknown>>> => {
          try {
            const result = await appleMusicGet(
              `v1/catalog/${ctx.storefront}/search`,
              ctx.env,
              { term: q, types: "songs", limit: clampedLimit }
            );
            return (
              ((result.results as Record<string, unknown>)?.songs as Record<string, unknown>)
                ?.data as Array<Record<string, unknown>>
            ) || [];
          } catch {
            return [];
          }
        };

        const apiStart = Date.now();
        const resultsPerQuery = await Promise.all(queries.map(searchOne));
        const apiElapsed = Date.now() - apiStart;

        // RRF: accumulate score = Σ 1/(k + rank) across all query result lists
        const rrfScores = new Map<string, number>();
        const trackMeta = new Map<string, { name: string; artist: string }>();

        for (const songs of resultsPerQuery) {
          songs.forEach((song, rank) => {
            const songId = song.id as string;
            if (!songId) return;
            rrfScores.set(songId, (rrfScores.get(songId) ?? 0) + 1 / (RRF_K + rank + 1));
            if (!trackMeta.has(songId)) {
              const attrs = (song.attributes || {}) as Record<string, unknown>;
              trackMeta.set(songId, {
                name: (attrs.name as string) || "Unknown",
                artist: (attrs.artistName as string) || "Unknown Artist",
              });
            }
          });
        }

        console.log("[tool:search_music] apple-music-api elapsed=%dms queries=%d results=%d", apiElapsed, queries.length, rrfScores.size);

        if (!rrfScores.size) {
          return `No results found for: ${queries.join(", ")}`;
        }

        const sortedIds = [...rrfScores.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id);

        const lines = [`Search results (${sortedIds.length} unique tracks):`];
        sortedIds.forEach((id, i) => {
          const { name, artist } = trackMeta.get(id)!;
          lines.push(`${i + 1}. ${name} - ${artist} (id: ${id})`);
        });
        return lines.join("\n");
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
