/**
 * Chat store - manages UI-only state for the chat interface.
 *
 * Messaging is handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * Queue is managed globally by usePlayQueue.
 * This store only manages ephemeral UI state: input text and sidebar visibility.
 *
 * @module store/chatStore
 */

import { create } from 'zustand';

interface ChatStore {
  // UI state
  input: string;
  showHistory: boolean;

  // Actions
  setInput: (input: string) => void;
  setShowHistory: (show: boolean) => void;
  toggleHistory: () => void;
  reset: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  input: '',
  showHistory: false,

  setInput: (input: string) => set({ input }),

  setShowHistory: (show: boolean) => set({ showHistory: show }),

  toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),

  reset: () => set({
    input: '',
    showHistory: false,
  }),
}));
