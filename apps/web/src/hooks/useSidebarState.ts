/**
 * useSidebarState - Manages sidebar state with localStorage persistence
 * @module hooks/useSidebarState
 */

import { useState, useEffect } from 'react';

interface SidebarState {
  /** Whether the sidebar is collapsed */
  collapsed: boolean;
  /** Width of the sidebar in pixels (when expanded) */
  width: number;
}

const STORAGE_KEY = 'playlist-sidebar-state';

const DEFAULT_STATE: SidebarState = {
  collapsed: false,
  width: 360
};

const MIN_WIDTH = 280;
const MAX_WIDTH = 500;

/**
 * Custom hook to manage sidebar state with localStorage persistence
 * @returns Sidebar state and updater functions
 */
export function useSidebarState(): {
  collapsed: boolean;
  width: number;
  toggleCollapse: () => void;
  setWidth: (width: number) => void;
  setCollapsed: (collapsed: boolean) => void;
} {
  const [state, setState] = useState<SidebarState>(() => {
    // Initialize from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          collapsed: parsed.collapsed ?? DEFAULT_STATE.collapsed,
          width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed.width ?? DEFAULT_STATE.width))
        };
      }
    } catch (e) {
      console.error('Failed to parse sidebar state from localStorage:', e);
    }
    return DEFAULT_STATE;
  });

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save sidebar state to localStorage:', e);
    }
  }, [state]);

  const toggleCollapse = (): void => {
    setState(prev => ({ ...prev, collapsed: !prev.collapsed }));
  };

  const setWidth = (width: number): void => {
    setState(prev => ({
      ...prev,
      width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width))
    }));
  };

  const setCollapsed = (collapsed: boolean): void => {
    setState(prev => ({ ...prev, collapsed }));
  };

  return {
    collapsed: state.collapsed,
    width: state.width,
    toggleCollapse,
    setWidth,
    setCollapsed
  };
}
