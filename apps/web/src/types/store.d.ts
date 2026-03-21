/**
 * Zustand store types
 *
 * Chat messaging is handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * Queue is managed globally by usePlayQueue.
 * View mode is managed by useViewState.
 * The store only manages ephemeral UI state.
 */

/**
 * Chat store state interface — UI-only state
 */
export interface ChatStoreState {
  // UI state
  input: string;

  // Actions
  setInput: (input: string) => void;
  reset: () => void;
}

/**
 * Create session API response
 */
export interface CreateSessionResponse {
  session_id: string;
}
