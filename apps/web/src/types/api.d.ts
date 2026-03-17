/**
 * API types
 *
 * Types for REST API endpoints that remain after the Cloudflare Agents migration.
 * Chat messaging is handled via WebSocket (useAgentChat), these types are for
 * session CRUD, state sync, and Apple Music endpoints.
 */

import type { FormattedTrack } from './apple-music';

/**
 * Backend API base URL
 * Re-exported from config for backward compatibility
 */
export { API_BASE } from '../config/api';

/**
 * Create session request
 */
export interface CreateSessionRequest {
  user_id: string;
}

/**
 * Create session response
 */
export interface CreateSessionResponse {
  session_id: string;
}

/**
 * Sync state request
 */
export interface SyncStateRequest {
  session_id: string;
  user_id: string;
  current_track: FormattedTrack | null;
  playlist: FormattedTrack[];
  is_playing: boolean;
  playback_position: number;
  [key: string]: unknown;
}

/**
 * Sync state response
 */
export interface SyncStateResponse {
  success: boolean;
  [key: string]: unknown;
}

/**
 * Sessions list response
 */
export interface SessionsListResponse {
  sessions: SessionInfo[];
}

/**
 * Session info
 */
export interface SessionInfo {
  id: string;
  title?: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

/**
 * Delete session request
 */
export interface DeleteSessionRequest {
  session_id: string;
  user_id: string;
}

/**
 * Delete session response
 */
export interface DeleteSessionResponse {
  success: boolean;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  message?: string;
  status?: number;
}
