/**
 * Shared type definitions for the Playheads Agent.
 */

// ---------------------------------------------------------------------------
// Worker Environment
// ---------------------------------------------------------------------------
export interface Env {
  // Durable Object bindings — MusicChatAgent handles both text chat + voice.
  MusicChatAgent: DurableObjectNamespace;

  // Workers AI binding — used by @cloudflare/voice for STT/TTS
  AI: Ai;

  // D1 database
  DB: D1Database;

  // LLM provider selection ("anthropic" | "doubao", default: "anthropic")
  LLM_PROVIDER: string;


  // Anthropic configuration (env fallback when no DB config)
  ANTHROPIC_MODEL: string;


  // Cloudflare AI Gateway (used with Anthropic)
  CLOUDFLARE_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  CF_AIG_TOKEN: string;

  // ElevenLabs TTS — routed through Cloudflare AI Gateway.
  // Auth priority: ELEVENLABS_API_KEY (direct xi-api-key) > CF_AIG_TOKEN
  // (cf-aig-authorization, only works if BYOK is configured in the AI Gateway
  // dashboard). Prefer the direct key — it "just works" out of the box.
  // Secret: `wrangler secret put ELEVENLABS_API_KEY`
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
  ELEVENLABS_MODEL: string;

  // Doubao (ByteDance / Volcano Engine Ark) configuration
  DOUBAO_API_KEY: string;
  // Model ID, e.g. "doubao-1.5-pro-32k"
  DOUBAO_MODEL: string;

  // Search provider: "anthropic" (native, Anthropic only) | "brave" | "tavily" | "none"
  // Defaults: anthropic when LLM_PROVIDER=anthropic, tavily otherwise (if TAVILY_API_KEY set)
  SEARCH_PROVIDER: string;

  // Brave Search API key (used when SEARCH_PROVIDER=brave)
  BRAVE_SEARCH_API_KEY: string;

  // Tavily web search (used when SEARCH_PROVIDER=tavily)
  TAVILY_API_KEY: string;

  // Encryption key shared with admin worker (AES-256-GCM, 64-char hex)
  ADMIN_ENCRYPTION_KEY: string;

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

