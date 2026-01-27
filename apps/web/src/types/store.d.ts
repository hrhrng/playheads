/**
 * Zustand store types
 */

import type { Message } from './chat';

/**
 * Chat store state interface
 */
export interface ChatStoreState {
  // State
  messages: Message[];
  input: string;
  isLoading: boolean;
  isLoadingHistory: boolean;
  showHistory: boolean;
  sessionId: string | null;
  userId: string | null;

  // Actions
  setInput: (input: string) => void;
  setShowHistory: (show: boolean) => void;
  toggleHistory: () => void;
  initialize: (sessionId: string, userId: string) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  loadHistory: (sessionId: string, userId: string) => Promise<LoadHistoryStatus>;
  sendMessage: (
    messageText: string,
    onAgentActions?: (actions: AgentAction[]) => Promise<void> | void,
    onMessageSent?: () => void,
    skipAddingUserMessage?: boolean
  ) => Promise<void>;
  addUserMessage: (messageText: string) => void;
  handleStreamingResponse: (
    response: Response,
    onAgentActions?: (actions: AgentAction[]) => Promise<void> | void
  ) => Promise<void>;
  createSession: (userId: string) => Promise<string>;
  reset: () => void;
}

/**
 * Load history operation status
 */
export type LoadHistoryStatus = 'success' | 'not_found' | 'error';

/**
 * Agent action types
 */
export interface AgentAction {
  type: 'play_track' | 'add_to_queue' | 'create_playlist' | 'search_tracks';
  data?: Record<string, unknown>;
}

/**
 * Chat history API response
 */
export interface ChatHistoryResponse {
  chat_history: ChatHistoryEntry[];
}

export interface ChatHistoryEntry {
  role: 'user' | 'agent' | 'system';
  content?: string;
  parts?: unknown[];
}

/**
 * Create session API response
 */
export interface CreateSessionResponse {
  session_id: string;
}
