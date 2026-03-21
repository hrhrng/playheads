/**
 * Chat store - manages UI-only state for the chat interface.
 *
 * Messaging is handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * Queue is managed globally by usePlayQueue.
 * View mode is managed by useViewState.
 * This store only manages ephemeral UI state: input text.
 *
 * @module store/chatStore
 */

import { create } from 'zustand';

interface ChatStore {
  // UI state
  input: string;

  // Actions
  setInput: (input: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  input: '',

  setInput: (input: string) => set({ input }),

  reset: () => set({ input: '' }),
}));
