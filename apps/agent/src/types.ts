/**
 * Shared type definitions for the Playheads Agent.
 */

// ---------------------------------------------------------------------------
// Worker Environment
// ---------------------------------------------------------------------------
export interface Env {
  // Durable Object bindings
  MUSIC_AGENT: DurableObjectNamespace;

  // D1 database
  DB: D1Database;

  // LLM configuration
  LLM_PROVIDER: string; // "anthropic" | "openai"
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_THINKING_BUDGET: string;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;

  // Cloudflare AI Gateway
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;

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

// ---------------------------------------------------------------------------
// SSE Event Types (Phase 1 backward compatibility)
// ---------------------------------------------------------------------------
export interface SSETextEvent {
  event: "text";
  data: { content: string };
}

export interface SSEThinkingEvent {
  event: "thinking";
  data: { content: string };
}

export interface SSEToolStartEvent {
  event: "tool_start";
  data: { id: string; tool_name: string; args: Record<string, unknown> };
}

export interface SSEToolEndEvent {
  event: "tool_end";
  data: {
    id: string;
    tool_name: string;
    result: string;
    status: "success" | "error";
  };
}

export interface SSEActionEvent {
  event: "action";
  data: MusicAction;
}

export interface SSEDoneEvent {
  event: "done";
  data: {
    session_id: string;
    actions: MusicAction[];
    state: {
      current_track: TrackInfo | null;
      playlist: TrackInfo[];
      is_playing: boolean;
      playback_position: number;
    };
  };
}

export type SSEEvent =
  | SSETextEvent
  | SSEThinkingEvent
  | SSEToolStartEvent
  | SSEToolEndEvent
  | SSEActionEvent
  | SSEDoneEvent;
