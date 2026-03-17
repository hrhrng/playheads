/**
 * Chat store - manages UI-only state for the chat interface.
 *
 * Messaging is now handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * This store only manages ephemeral UI state: input text, sidebar visibility,
 * and the playlist view for the current session.
 *
 * @module store/chatStore
 */

import { create } from 'zustand';
import type { FormattedTrack } from '../types';

interface ChatStore {
  // UI state
  input: string;
  showHistory: boolean;

  /** Playlist for the currently viewed session */
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

export const useChatStore = create<ChatStore>((set) => ({
  input: '',
  showHistory: false,
  viewedPlaylist: [],

  setInput: (input: string) => set({ input }),

  setShowHistory: (show: boolean) => set({ showHistory: show }),

  toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),

  setViewedPlaylist: (playlist: FormattedTrack[]) => set({ viewedPlaylist: playlist }),

  addToViewedPlaylist: (track: FormattedTrack) =>
    set((state) => ({ viewedPlaylist: [...state.viewedPlaylist, track] })),

  removeFromViewedPlaylist: (index: number) =>
    set((state) => ({
      viewedPlaylist: state.viewedPlaylist.filter((_, i) => i !== index),
    })),

  reset: () => set({
    input: '',
    showHistory: false,
    viewedPlaylist: [],
  }),
}));
