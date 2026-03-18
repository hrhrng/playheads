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

  // LLM provider selection ("anthropic" | "doubao", default: "anthropic")
  LLM_PROVIDER: string;

  // Anthropic configuration
  ANTHROPIC_MODEL: string;
  ANTHROPIC_THINKING_BUDGET: string;

  // Cloudflare AI Gateway (used with Anthropic)
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  CF_AIG_TOKEN: string;

  // Doubao (ByteDance / Volcano Engine Ark) configuration
  DOUBAO_API_KEY: string;
  // Model ID, e.g. "doubao-1.5-pro-32k"
  DOUBAO_MODEL: string;

  // Apple Music
  APPLE_MUSIC_TEAM_ID: string;
  APPLE_MUSIC_KEY_ID: string;
  APPLE_MUSIC_PRIVATE_KEY: string;
  APPLE_MUSIC_TOKEN_TTL_SECONDS: string;
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

