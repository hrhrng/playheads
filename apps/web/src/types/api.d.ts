/**
 * API response types
 */

import type { Message } from './chat';
import type { FormattedTrack } from './apple-music';

/**
 * Backend API base URL
 */
export const API_BASE = 'http://localhost:8000';

/**
 * Chat request payload
 */
export interface ChatRequest {
  message: string;
  session_id: string | null;
  user_id: string;
}

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
 * Get state request params
 */
export interface GetStateParams {
  session_id: string;
  user_id?: string;
}

/**
 * Chat history state response
 */
export interface ChatStateResponse {
  chat_history: ChatHistoryEntry[];
  [key: string]: unknown;
}

/**
 * Chat history entry
 */
export interface ChatHistoryEntry {
  role: 'user' | 'agent' | 'system';
  content?: string;
  parts?: MessagePart[];
}

/**
 * Message part types (matching backend format)
 */
export type MessagePart = TextPart | ThinkingPart | ToolCallPart;

export interface TextPart {
  type: 'text';
  content: string;
}

export interface ThinkingPart {
  type: 'thinking';
  content: string;
}

export interface ToolCallPart {
  type: 'tool_call';
  id: string;
  tool_name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'success' | 'error';
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
