/**
 * Type definitions index
 * Centralized exports for all type definitions
 */

// Chat types
export type {
  MessagePart,
  TextPart,
  ThinkingPart,
  ToolCallPart,
  ToolCallStatus,
  Message,
  LegacyMessage,
  ModernMessage,
  MessageRole,
  AgentAction
} from './chat';

export {
  isTextPart,
  isThinkingPart,
  isToolCallPart,
  isModernMessage,
  isLegacyMessage
} from './chat';

// Store types
export type {
  ChatStoreState,
  CreateSessionResponse
} from './store';

// Apple Music types
export type {
  Track,
  TrackAttributes,
  Artwork,
  PlayParams,
  FormattedTrack,
  PlaybackTime,
  MusicSearchType,
  SearchResultItem,
  SearchResponse
} from './apple-music';

// API types
export type {
  CreateSessionRequest,
  CreateSessionResponse as APICreateSessionResponse,
  SyncStateRequest,
  SyncStateResponse,
  SessionsListResponse,
  SessionInfo,
  DeleteSessionRequest,
  DeleteSessionResponse,
  ErrorResponse
} from './api';

export { API_BASE } from './api';

// MusicKit types
export type {
  MusicKitGlobal,
  MusicKitConfig,
  MusicKitInstance,
  PlaybackStates,
  MediaItem,
  MediaItemAttributes,
  Artwork as MusicKitArtwork,
  PlayParams as MusicKitPlayParams,
  SetQueueOptions,
  MusicKitQueue,
  MusicKitAPI,
  MusicKitAPIResponse,
  CatalogAPI,
  LibraryAPI,
  SearchOptions as MusicKitSearchOptions,
  CatalogOptions,
  LibraryOptions,
  MusicKitEventName,
  AuthorizationStatusDidChangeEvent,
  MediaItemDidChangeEvent,
  NowPlayingItemDidChangeEvent,
  PlaybackStateDidChangeEvent,
  QueueItemsDidChangeEvent,
  PlaybackTimeDidChangeEvent,
  PlaybackVolumeDidChangeEvent
} from './musicKit';

// Global types
export type {
  RouterLocationState,
  Conversation
} from './global';

// Error types
export type {
  ClassifiedError,
  ErrorContext
} from './errors';

export { ErrorCategory } from './errors';
