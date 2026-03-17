/**
 * Zustand store types
 *
 * Chat messaging is handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * Queue is managed globally by usePlayQueue.
 * The store only manages ephemeral UI state.
 */

/**
 * Chat store state interface — UI-only state
 */
export interface ChatStoreState {
  // UI state
  input: string;
  showHistory: boolean;

  // Actions
  setInput: (input: string) => void;
  setShowHistory: (show: boolean) => void;
  toggleHistory: () => void;
  reset: () => void;
}

/**
 * Create session API response
 */
export interface CreateSessionResponse {
  session_id: string;
}
