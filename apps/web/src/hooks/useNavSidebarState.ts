import { useState, useEffect, useCallback } from 'react';

// localStorage keys for persisting nav sidebar state
const EXPANDED_KEY = 'nav-sidebar-expanded';
const WIDTH_KEY = 'nav-sidebar-width';

// Width constraints
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 256;
const COLLAPSED_WIDTH = 80;
const AUTO_COLLAPSE_THRESHOLD = 120;

/**
 * Hook to manage left navigation sidebar expanded/collapsed state and width.
 * Persists state to localStorage so it survives page navigation and refresh.
 *
 * Features:
 * - Resizable width when expanded (200px - 400px)
 * - Auto-collapse when dragged below threshold
 * - Auto-expand when dragged from collapsed above threshold
 */
export function useNavSidebarState() {
  // Initialize expanded state from localStorage
  const [expanded, setExpandedState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(EXPANDED_KEY);
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  // Initialize width from localStorage (only used when expanded)
  const [width, setWidthState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(WIDTH_KEY);
      const parsed = stored ? JSON.parse(stored) : DEFAULT_WIDTH;
      // Clamp to valid range
      return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed));
    } catch {
      return DEFAULT_WIDTH;
    }
  });

  // Persist expanded state to localStorage
  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
  }, [expanded]);

  // Persist width to localStorage
  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, JSON.stringify(width));
  }, [width]);

  const toggleExpanded = useCallback(() => {
    setExpandedState(prev => !prev);
  }, []);

  const setExpanded = useCallback((value: boolean) => {
    setExpandedState(value);
  }, []);

  /**
   * Set width with clamping and auto-collapse/expand logic
   * @param newWidth - The new width to set
   * @param isDragging - Whether this is called during a drag operation
   */
  const setWidth = useCallback((newWidth: number, isDragging = false) => {
    if (isDragging) {
      // During drag: handle auto-collapse/expand
      if (newWidth < AUTO_COLLAPSE_THRESHOLD) {
        // Auto-collapse when dragged too narrow
        setExpandedState(false);
      } else if (newWidth >= AUTO_COLLAPSE_THRESHOLD) {
        // Auto-expand if dragging from collapsed state
        setExpandedState(true);
        // Clamp to valid range
        const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
        setWidthState(clampedWidth);
      }
    } else {
      // Normal set: just clamp and set
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      setWidthState(clampedWidth);
    }
  }, []);

  // Computed current width based on expanded state
  const currentWidth = expanded ? width : COLLAPSED_WIDTH;

  return {
    expanded,
    toggleExpanded,
    setExpanded,
    width: currentWidth,
    setWidth,
    // Expose constants for external use
    MIN_WIDTH,
    MAX_WIDTH,
    COLLAPSED_WIDTH,
  };
}
