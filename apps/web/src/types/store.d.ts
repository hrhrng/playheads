/**
 * Zustand store types
 *
 * Chat messaging is now handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * The store only manages ephemeral UI state.
 */

import type { FormattedTrack } from './apple-music';

/**
 * Chat store state interface — UI-only state
 */
export interface ChatStoreState {
  // UI state
  input: string;
  showHistory: boolean;
  viewedPlaylist: FormattedTrack[];

  // Actions
  setInput: (input: string) => void;
  setShowHistory: (show: boolean) => void;
  toggleHistory: () => void;
  setViewedPlaylist: (playlist: FormattedTrack[]) => void;
  addToViewedPlaylist: (track: FormattedTrack) => void;
  removeFromViewedPlaylist: (index: number) => void;
  reset: () => void;
}

/**
 * Create session API response
 */
export interface CreateSessionResponse {
  session_id: string;
}
