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
  ChatHistoryEntry,
  SSETextEvent,
  SSEThinkingEvent,
  SSEToolStartEvent,
  SSEToolEndEvent,
  SSEDoneEvent,
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
  LoadHistoryStatus,
  AgentAction as StoreAgentAction,
  ChatHistoryResponse,
  ChatHistoryEntry as StoreChatHistoryEntry,
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
  AppleMusicAction,
  MusicSearchType,
  SearchResultItem,
  SearchResponse
} from './apple-music';

// API types
export type {
  ChatRequest,
  CreateSessionRequest,
  CreateSessionResponse as APICreateSessionResponse,
  GetStateParams,
  ChatStateResponse,
  ChatHistoryEntry as APIChatHistoryEntry,
  MessagePart as APIMessagePart,
  TextPart as APITextPart,
  ThinkingPart as APIThinkingPart,
  ToolCallPart as APIToolCallPart,
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
  SupabaseSession,
  SupabaseUser,
  AppMetadata,
  UserMetadata,
  Identity,
  SupabaseAuthState,
  RouterLocationState,
  Conversation
} from './global';
