/**
 * Developer tools for debugging and testing
 * @module utils/devTools
 */

import { useSidebarState } from '../hooks/useSidebarState';

const STORAGE_KEY = 'playlist-sidebar-state';

/**
 * Sidebar state shape stored in localStorage
 */
interface SidebarState {
  collapsed: boolean;
  width: number;
}

// ============================================================================
// Console API
// ============================================================================

/**
 * Initialize dev tools - attach to window object
 */
export function initDevTools(): void {
  if (typeof window === 'undefined') return;

  const api = {
    /**
     * Get current sidebar state
     */
    getSidebarState(): SidebarState {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (e) {
        console.error('Failed to read sidebar state:', e);
      }
      return { collapsed: false, width: 360 };
    },

    /**
     * Set sidebar state
     */
    setSidebarState(state: Partial<SidebarState>): void {
      const current = this.getSidebarState();
      const newState = {
        collapsed: state.collapsed ?? current.collapsed,
        width: state.width ?? current.width
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      console.log('✅ Sidebar state updated:', newState);
      console.log('📝 Refresh the page to see changes');
    },

    /**
     * Toggle sidebar collapsed state
     */
    toggleSidebar(): void {
      const current = this.getSidebarState();
      this.setSidebarState({ collapsed: !current.collapsed });
    },

    /**
     * Set sidebar width (clamped between 280-500)
     */
    setSidebarWidth(width: number): void {
      const clamped = Math.max(280, Math.min(500, width));
      this.setSidebarState({ width: clamped });
    },

    /**
     * Reset sidebar to default state
     */
    resetSidebar(): void {
      localStorage.removeItem(STORAGE_KEY);
      console.log('🔄 Sidebar state reset to default');
      console.log('📝 Refresh the page to see changes');
    },

    /**
     * Show sidebar state info
     */
    sidebarInfo(): void {
      const state = this.getSidebarState();
      console.log('📊 Sidebar State:');
      console.log('   Collapsed:', state.collapsed);
      console.log('   Width:', state.width, 'px');
      console.log('');
      console.log('🔧 Available commands:');
      console.log('   window.$sidebar.getSidebarState()');
      console.log('   window.$sidebar.setSidebarState({ collapsed: true, width: 400 })');
      console.log('   window.$sidebar.toggleSidebar()');
      console.log('   window.$sidebar.setSidebarWidth(400)');
      console.log('   window.$sidebar.resetSidebar()');
      console.log('   window.$sidebar.sidebarInfo()');
    }
  };

  // Attach to window
  (window as any).$sidebar = api;

  console.log('✅ Dev tools initialized');
  console.log('💡 Type window.$sidebar.sidebarInfo() for sidebar commands');
}

/**
 * Hook to initialize dev tools on mount
 */
export function useDevTools(): void {
  if (process.env.NODE_ENV === 'development') {
    initDevTools();
  }
}
