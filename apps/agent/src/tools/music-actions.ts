/**
 * MusicKit action emitter for sending playback commands to the frontend.
 *
 * In the AIChatAgent context, actions are sent as transient Data Parts
 * which are broadcast to connected clients in real-time but NOT persisted
 * to SQLite (they are ephemeral playback commands, not chat history).
 */
import type { MusicActionType } from "../types";

/**
 * Creates a transient data part for a MusicKit action.
 * Used with Vercel AI SDK's streamText data writer.
 */
export function createMusicAction(
  type: MusicActionType,
  data: Record<string, unknown>
) {
  return {
    type: "music-action" as const,
    data: { type, data },
    transient: true, // Real-time only, not persisted
  };
}
