/**
 * Apple MusicKit SDK Type Definitions
 * Custom types since MusicKit has no official TypeScript definitions
 */

/**
 * MusicKit global interface
 */
export interface MusicKitGlobal {
  configure(config: MusicKitConfig): Promise<MusicKitInstance>;
  PlaybackStates: PlaybackStates;
  PlaybackState: PlaybackStates;
}

/**
 * MusicKit configuration
 */
export interface MusicKitConfig {
  developerToken: string;
  app: {
    name: string;
    build: string;
  };
  icon?: string;
}

/**
 * MusicKit instance
 */
export interface MusicKitInstance {
  isAuthorized: boolean;
  autoplay: boolean;
  nowPlayingItem: MediaItem | null;
  queue: MusicKitQueue;
  storefrontId: string;
  volume: number;

  // Methods
  authorize(): Promise<void>;
  unauthorize(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  skipToNextItem(): Promise<void>;
  skipToPreviousItem(): Promise<void>;
  seekToTime(time: number): void;
  changeToMediaAtIndex(index: number): Promise<void>;
  setQueue(options: SetQueueOptions): Promise<void>;
  api: MusicKitAPI;
  addEventListener(eventName: string, callback: (...args: unknown[]) => void): void;
  removeEventListener(eventName: string, callback: (...args: unknown[]) => void): void;
}

/**
 * Playback states
 */
export enum PlaybackStates {
  none = 'none',
  loading = 'loading',
  ready = 'ready',
  playing = 'playing',
  paused = 'paused',
  stopped = 'stopped',
  ended = 'ended',
  seeking = 'seeking',
  waiting = 'waiting'
}

export type PlaybackStates = PlaybackStates;

/**
 * Media item (track/album/etc)
 */
export interface MediaItem {
  id: string;
  type: string;
  attributes?: MediaItemAttributes;
}

export interface MediaItemAttributes {
  name: string;
  artistName: string;
  albumName: string;
  durationInMillis: number;
  artwork?: Artwork;
  playParams?: PlayParams;
  genreNames?: string[];
  releaseDate?: string;
  trackNumber?: number;
  discNumber?: number;
  composerName?: string;
  previewURL?: string;
  url?: string;
}

/**
 * Artwork
 */
export interface Artwork {
  url: string;
  width?: number;
  height?: number;
  textColor1?: string;
  textColor2?: string;
  textColor3?: string;
  textColor4?: string;
  backgroundColor?: string;
}

/**
 * Play params for initiating playback
 */
export interface PlayParams {
  id: string;
  kind?: string;
  isLibrary?: boolean;
  reporting?: boolean;
  catalogId?: string;
  // Additional params
  [key: string]: string | boolean | undefined;
}

/**
 * Queue options
 */
export interface SetQueueOptions {
  items: (string | MediaItem)[];
  startIndex?: number;
}

/**
 * MusicKit queue
 */
export interface MusicKitQueue {
  items: MediaItem[];
  position?: number;
}

/**
 * MusicKit API
 */
export interface MusicKitAPI {
  music(url: string, options?: Record<string, unknown>): Promise<MusicKitAPIResponse>;
  catalog(options?: CatalogOptions): CatalogAPI;
  library(options?: LibraryOptions): LibraryAPI;
}

/**
 * API response
 */
export interface MusicKitAPIResponse {
  data: unknown;
  results?: Record<string, { data: unknown }>;
  meta?: Record<string, unknown>;
  errors?: Array<{
    code: string;
    detail: string;
    title?: string;
    status?: number;
  }>;
}

/**
 * Catalog API
 */
export interface CatalogAPI {
  search(options: SearchOptions): Promise<MusicKitAPIResponse>;
}

/**
 * Library API
 */
export interface LibraryAPI {
  search(options: SearchOptions): Promise<MusicKitAPIResponse>;
}

/**
 * Search options
 */
export interface SearchOptions {
  term: string;
  types?: string;
  limit?: number;
  offset?: number;
  relate?: string;
  [key: string]: unknown;
}

/**
 * Catalog options
 */
export interface CatalogOptions {
  storefront?: string;
  [key: string]: unknown;
}

/**
 * Library options
 */
export interface LibraryOptions {
  [key: string]: unknown;
}

/**
 * Event types
 */
export type MusicKitEventName =
  | 'authorizationStatusDidChange'
  | 'mediaItemDidChange'
  | 'nowPlayingItemDidChange'
  | 'playbackStateDidChange'
  | 'queueItemsDidChange'
  | 'playbackTimeDidChange'
  | 'playbackVolumeDidChange'
  | 'mediaItemWillChange'
  | 'mediaItemPlaybackStatusDidChange';

/**
 * Event payload types
 */
export interface AuthorizationStatusDidChangeEvent {
  authorized: boolean;
}

export interface MediaItemDidChangeEvent {
  item: MediaItem | null;
}

export interface NowPlayingItemDidChangeEvent {
  item: MediaItem | null;
}

export interface PlaybackStateDidChangeEvent {
  state: PlaybackStates;
}

export interface QueueItemsDidChangeEvent {
  items: MediaItem[];
  position?: number;
}

export interface PlaybackTimeDidChangeEvent {
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
}

export interface PlaybackVolumeDidChangeEvent {
  volume: number;
}

// Extend Window interface
declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

export {};
