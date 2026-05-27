/**
 * Music provider abstraction types.
 * Defines a unified interface for music playback engines (Apple Music, Spotify, etc.)
 */

export type ProviderType = 'apple-music' | 'spotify';

/** Unified track representation across all providers. */
export interface UnifiedTrack {
  id: string;              // provider-specific ID (e.g. Apple Music song ID)
  name: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationSeconds: number;
  provider: ProviderType;
  /** 30s preview MP3 URL — playable without user authorization. */
  previewUrl?: string;
}

/** Current playback state from the provider engine. */
export interface PlaybackState {
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  isTransitioning: boolean;
  playbackTime: { current: number; total: number };
}

/**
 * Provider interface — responsible for single-track playback only.
 * Queue management is handled separately by usePlayQueue.
 */
export interface MusicProvider {
  readonly type: ProviderType;
  readonly isAuthorized: boolean;
  readonly isInitializing: boolean;
  readonly playbackState: PlaybackState;

  login(): Promise<void>;
  logout(): Promise<void>;
  play(trackId?: string, startTime?: number): Promise<void>;
  pause(): Promise<void>;
  togglePlay(): Promise<void>;
  seekTo(seconds: number): void;
  search(query: string): Promise<UnifiedTrack[]>;
  /** Subscribe to state changes. Returns unsubscribe function. */
  onStateChange(cb: (state: PlaybackState) => void): () => void;
  destroy(): void;
}
