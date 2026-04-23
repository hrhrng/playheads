import type { PlaybackState } from "./types";

interface QueueRow {
  queue: string;
  queueIndex: number;
}

interface VoiceStateEnvLike {
  DB: {
    prepare: (query: string) => {
      bind: (...args: unknown[]) => {
        first: () => Promise<QueueRow | null>;
      };
    };
  };
}

export async function loadVoiceGlobalState(
  env: VoiceStateEnvLike,
  userId: string | undefined,
  baseState: PlaybackState
): Promise<PlaybackState> {
  if (!userId) return baseState;

  try {
    const row = await env.DB
      .prepare('SELECT "queue", "queueIndex" FROM "profile" WHERE "id" = ?')
      .bind(userId)
      .first();

    if (!row) return baseState;

    const tracks = JSON.parse(row.queue || "[]") as PlaybackState["playlist"];
    const idx = row.queueIndex ?? -1;

    return {
      currentTrack: idx >= 0 && idx < tracks.length ? tracks[idx] : null,
      playlist: tracks,
      isPlaying: baseState.isPlaying,
      playbackPosition: baseState.playbackPosition,
    };
  } catch {
    return baseState;
  }
}
