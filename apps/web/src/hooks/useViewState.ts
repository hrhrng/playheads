/**
 * View state machine for the three-state main interface.
 *
 * Manages transitions between Default, Lyrics, and Chat modes.
 * Replaces the old `showHistory` boolean from chatStore.
 *
 * @module hooks/useViewState
 */

import { useEffect } from 'react';
import { create } from 'zustand';

export type ViewMode = 'default' | 'lyrics' | 'chat';

interface ViewStateStore {
  mode: ViewMode;
  prevMode: ViewMode;
  lyricsAvailable: boolean;

  setMode: (mode: ViewMode) => void;
  goToDefault: () => void;
  goToLyrics: () => void;
  goToChat: () => void;
  setLyricsAvailable: (v: boolean) => void;
  reset: () => void;
}

export const useViewStateStore = create<ViewStateStore>((set, get) => ({
  mode: 'default',
  prevMode: 'default',
  lyricsAvailable: false,

  setMode: (mode: ViewMode) => {
    const current = get().mode;
    if (mode === current) return;
    set({ prevMode: current, mode });
  },

  goToDefault: () => {
    const current = get().mode;
    if (current === 'default') return;
    set({ prevMode: current, mode: 'default' });
  },

  goToLyrics: () => {
    if (!get().lyricsAvailable) return;
    const current = get().mode;
    if (current === 'lyrics') return;
    set({ prevMode: current, mode: 'lyrics' });
  },

  goToChat: () => {
    const current = get().mode;
    if (current === 'chat') return;
    set({ prevMode: current, mode: 'chat' });
  },

  setLyricsAvailable: (v: boolean) => {
    set({ lyricsAvailable: v });
    // If lyrics become unavailable while in lyrics mode, go back to default
    if (!v && get().mode === 'lyrics') {
      set({ prevMode: 'lyrics', mode: 'default' });
    }
  },

  reset: () => set({ mode: 'default', prevMode: 'default' }),
}));

/**
 * Hook that provides view state and registers the Escape key listener.
 * Use this in components that need to read/write view state.
 */
export function useViewState() {
  const store = useViewStateStore();

  // Global Escape key → go to default
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const tag = (e.target as HTMLElement).tagName;
        // Don't intercept Escape in input fields (let them handle it)
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        store.goToDefault();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [store.goToDefault]);

  return store;
}
