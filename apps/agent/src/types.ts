/**
 * Shared type definitions for the Playheads Agent.
 */

// ---------------------------------------------------------------------------
// Worker Environment
// ---------------------------------------------------------------------------
export interface Env {
  // Durable Object bindings
  MusicChatAgent: DurableObjectNamespace;

  // D1 database
  DB: D1Database;

  // LLM configuration
  ANTHROPIC_MODEL: string;
  ANTHROPIC_THINKING_BUDGET: string;

  // Cloudflare AI Gateway
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  CF_AIG_TOKEN: string;

  // Apple Music
  APPLE_MUSIC_TEAM_ID: string;
  APPLE_MUSIC_KEY_ID: string;
  APPLE_MUSIC_PRIVATE_KEY: string;
  APPLE_MUSIC_TOKEN_TTL_SECONDS: string;

  // Spotify (Client Credentials — for public playlist extraction)
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
}

// ---------------------------------------------------------------------------
// Music Data Types
// ---------------------------------------------------------------------------
export interface TrackInfo {
  id: string;
  name: string;
  artist: string;
  album?: string;
  artwork_url?: string;
  duration?: number; // seconds
}

export interface PlaybackState {
  currentTrack: TrackInfo | null;
  playlist: TrackInfo[];
  isPlaying: boolean;
  playbackPosition: number;
}

// ---------------------------------------------------------------------------
// MusicKit Action Types (sent to frontend)
// ---------------------------------------------------------------------------
export type MusicActionType =
  | "play_track"
  | "add_to_queue"
  | "skip_next"
  | "remove_track";

export interface MusicAction {
  type: MusicActionType;
  data: Record<string, unknown>;
}

