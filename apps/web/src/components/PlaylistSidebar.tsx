/**
 * PlaylistSidebar - Collapsible playlist sidebar with resizable width
 * Shows the global queue (same across all conversations).
 * queue[0] = now playing, queue.slice(1) = up next.
 * @module components/PlaylistSidebar
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedTrack } from '../providers/types';
import { usePlaylistSheet } from '../contexts/PlaylistSheetContext';

interface PlaylistSidebarProps {
  /** Currently playing track */
  currentTrack: UnifiedTrack | null;
  /** Whether music is currently playing */
  isPlaying: boolean;
  /** Global queue tracks — queue[0] is now playing */
  queue: UnifiedTrack[];
  /** Previously played tracks */
  history?: UnifiedTrack[];
  /** Callback when a track is selected to play */
  onPlayTrack?: (index: number) => void;
  /** Callback when a history track is clicked */
  onPlayFromHistory?: (historyIndex: number) => void;
  /** Whether the sidebar is collapsed */
  collapsed: boolean;
  /** Toggle collapse state */
  toggleCollapse: () => void;
  /** Whether to show the queue list */
  showQueue?: boolean;
  /** Width of the sidebar in pixels (when expanded) */
  width: number;
  /** Callback when width changes */
  onWidthChange?: (width: number) => void;
}

interface FormattedSidebarTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
}

/**
 * PlaylistSidebar component - displays global queue with collapsible and resizable interface
 */
export const PlaylistSidebar = ({
  currentTrack,
  isPlaying,
  queue: queueTracks,
  history: historyTracks = [],
  onPlayTrack,
  onPlayFromHistory,
  collapsed,
  toggleCollapse,
  showQueue = true,
  width,
  onWidthChange,
}: PlaylistSidebarProps): React.JSX.Element => {
  const { t } = useTranslation();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const { isMobileSheet } = usePlaylistSheet();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(width);

  // Handle resize start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = width;
  }, [collapsed, width]);

  // Handle resize movement
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX.current - e.clientX;
      const newWidth = startWidth.current + deltaX;
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  // Prevent text selection during resize
  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  const formatArtwork = (url: string | undefined, size = 100): string => {
    if (!url) return 'https://placehold.co/100';
    return url.replace('{w}', size.toString()).replace('{h}', size.toString());
  };

  // Format queue tracks for display
  const queue: FormattedSidebarTrack[] = queueTracks.map((item): FormattedSidebarTrack => ({
    id: item.id,
    title: item.name || 'Unknown Title',
    artist: item.artist || 'Unknown Artist',
    cover: formatArtwork(item.artworkUrl)
  }));

  const formattedHistory: FormattedSidebarTrack[] = historyTracks.map((item): FormattedSidebarTrack => ({
    id: item.id,
    title: item.name || 'Unknown Title',
    artist: item.artist || 'Unknown Artist',
    cover: formatArtwork(item.artworkUrl)
  }));

  const nowPlaying = queue.length > 0 ? queue[0] : null;
  const upNext = queue.slice(1);

  const handleTrackClick = (index: number) => {
    if (onPlayTrack) {
      onPlayTrack(index);
    }
  };

  // In mobile sheet: always expanded, full width
  const effectiveCollapsed = isMobileSheet ? false : collapsed;
  const sidebarWidth = effectiveCollapsed ? 96 : width; // 96px = w-24

  return (
    <div
      ref={sidebarRef}
      className={`h-full flex flex-col pt-3 pr-3 pl-3 relative ${isResizing ? '' : 'transition-all duration-500 ease-spring'}`}
      style={isMobileSheet ? { width: '100%' } : { width: `${sidebarWidth}px` }}
    >
      {/* Resize Handle - Left edge (hidden in mobile sheet) */}
      {!effectiveCollapsed && !isMobileSheet && (
        <div
          className={`absolute -left-0.5 top-10 bottom-0 w-1 cursor-ew-resize hover:bg-accent/40 active:bg-accent transition-colors z-10 group ${
            isResizing ? 'bg-accent' : 'bg-transparent'
          }`}
          onMouseDown={handleMouseDown}
          title="Drag to resize sidebar"
        >
          <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-8 bg-rule rounded-full opacity-0 group-hover:opacity-100 group-hover:bg-accent transition-all" />
        </div>
      )}

      {/* Resize Handle for collapsed state (hidden in mobile sheet) */}
      {effectiveCollapsed && !isMobileSheet && (
        <div
          className={`absolute -left-0.5 top-10 bottom-0 w-1 cursor-ew-resize hover:bg-accent/40 transition-colors z-10 group ${isResizing ? 'bg-accent' : 'bg-transparent'}`}
          onMouseDown={handleMouseDown}
          title="Drag to expand sidebar"
        >
          <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-8 bg-rule rounded-full opacity-0 group-hover:opacity-100 group-hover:bg-accent transition-all" />
        </div>
      )}
      {/* Playlist Container. Override glass's default 32px drop shadow
          (paints a visible dark ring on the page bg) and keep only the
          1px inner top-edge highlight. */}
      <div className="flex-1 min-h-0 glass rounded-t-sheet flex flex-col overflow-hidden relative transition-all [box-shadow:inset_0_1px_0_rgba(216,207,191,0.08)]">

        {/* Header */}
        {isMobileSheet ? (
          /* Mobile sheet: title only, no collapse toggle */
          <div className="flex justify-between items-center p-6 pb-2">
            <h2 className="text-[13px] font-medium text-ink uppercase tracking-[0.18em]">{t('playlist.title')}</h2>
          </div>
        ) : (
          /* Desktop: collapse toggle button */
          <div className={`flex ${effectiveCollapsed ? 'justify-center py-6' : 'justify-between p-6 pb-2'} items-center`}>
            {!effectiveCollapsed && <h2 className="text-[13px] font-medium text-ink uppercase tracking-[0.18em]">Playlist</h2>}
            <button
              onClick={toggleCollapse}
              className="p-2 rounded-xl hover:bg-chip text-ink-3 hover:text-ink transition-all duration-300 group focus:outline-none focus:ring-0"
              title={effectiveCollapsed ? t('playlist.expand') : t('playlist.collapse')}
            >
              {effectiveCollapsed ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Content — single unified tree that morphs between collapsed and
            expanded states. Cover sizes, padding, text visibility all
            animate via CSS transitions so users see real motion, not a
            cross-fade. */}
        {showQueue && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* History — entirely hidden in collapsed; max-h animation gives
                a soft height collapse. */}
            <div className={`transition-all duration-500 ease-spring overflow-hidden ${effectiveCollapsed ? 'max-h-0 opacity-0' : 'max-h-[60vh] opacity-100'}`}>
              {formattedHistory.length > 0 && (
                <div className="px-4 pt-4 mb-4">
                  <button
                    onClick={() => setHistoryExpanded(prev => !prev)}
                    className="flex items-center gap-1 px-2 mb-2 group focus:outline-none"
                  >
                    <svg className={`w-3 h-3 text-ink-3 transition-transform ${historyExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                    <h3 className="text-[10px] font-medium text-ink-3 uppercase tracking-widest">{t('playlist.history')}</h3>
                    <span className="text-[10px] text-ink-3">{formattedHistory.length}</span>
                  </button>
                  {historyExpanded && (
                    <div className="space-y-1">
                      {formattedHistory.map((track, i) => (
                        <div
                          key={`${track.id}-history-${i}`}
                          onClick={() => onPlayFromHistory?.(i)}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-chip cursor-pointer group transition-colors opacity-55"
                        >
                          <div className="w-10 h-10 rounded-card bg-chip overflow-hidden relative shrink-0">
                            <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium font-display text-ink truncate leading-snug">{track.title}</div>
                            <div className="text-[11px] text-ink-3 truncate">{track.artist}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Track column. Padding/gap/alignment all animate so rows
                visually settle into new positions instead of cross-fading. */}
            <div className={`flex flex-col transition-all duration-500 ease-spring ${effectiveCollapsed ? 'items-center gap-2 py-4 px-0' : 'items-stretch gap-1 px-4 pb-4'}`}>

              {/* Now Playing header — snap visible when expanded, hidden when
                  collapsed (no fade, the user explicitly didn't want it
                  cross-fading with the pill). */}
              {nowPlaying && !effectiveCollapsed && (
                <h3 className="text-[10px] font-medium text-ink-3 uppercase tracking-widest px-2 mb-2">{t('playlist.nowPlaying')}</h3>
              )}

              {/* Now Playing pill — cover size + padding morph; text container
                  collapses width to 0 when collapsed so the cover sits alone. */}
              {nowPlaying && (
                <button
                  onClick={() => handleTrackClick(0)}
                  className={`flex items-center bg-chip-2 hairline cursor-pointer group rounded-2xl shrink-0 transition-all duration-500 ease-spring ${effectiveCollapsed ? 'p-1.5 gap-0' : 'p-2 gap-3 w-full'}`}
                  title={`${nowPlaying.title} — ${nowPlaying.artist}`}
                >
                  <div className="w-10 h-10 rounded-card bg-chip overflow-hidden relative shrink-0">
                    <img src={nowPlaying.cover} alt={nowPlaying.title} className="w-full h-full object-cover" />
                    {isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="flex gap-0.5 h-3 items-end">
                          <div className="w-0.5 bg-white rounded-full animate-music-bar-1 h-full"></div>
                          <div className="w-0.5 bg-white rounded-full animate-music-bar-2 h-2/3"></div>
                          <div className="w-0.5 bg-white rounded-full animate-music-bar-3 h-1/2"></div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={`min-w-0 overflow-hidden transition-all duration-200 ease-spring ${effectiveCollapsed ? 'w-0 opacity-0 -translate-x-2' : 'flex-1 opacity-100 translate-x-0 delay-300'}`}>
                    <div className="text-[13px] font-semibold font-display text-ink truncate leading-snug text-left">{nowPlaying.title}</div>
                    <div className="text-[11px] text-ink-3 truncate text-left">{nowPlaying.artist}</div>
                  </div>
                </button>
              )}

              {/* Up Next header — snap visible / hidden, no fade. */}
              {upNext.length > 0 && !effectiveCollapsed && (
                <h3 className="text-[10px] font-medium text-ink-3 uppercase tracking-widest px-2 mt-3 mb-2">{t('playlist.upNext')}</h3>
              )}

              {/* Up Next items — each cover morphs in size; rows lose their
                  hover background and text in collapsed. */}
              {upNext.map((track, i) => {
                const realIndex = i + 1;
                return (
                  <div
                    key={`${track.id}-${realIndex}`}
                    onClick={() => handleTrackClick(realIndex)}
                    className={`flex items-center cursor-pointer group transition-all duration-500 ease-spring ${effectiveCollapsed ? 'p-0 gap-0 rounded-card' : 'p-2 gap-3 rounded-2xl hover:bg-chip w-full'}`}
                  >
                    <div className="w-10 h-10 rounded-card bg-chip overflow-hidden relative shrink-0">
                      <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </div>
                    <div className={`min-w-0 overflow-hidden transition-all duration-200 ease-spring ${effectiveCollapsed ? 'w-0 opacity-0 -translate-x-2' : 'flex-1 opacity-100 translate-x-0 delay-300'}`}>
                      <div className="text-[13px] font-medium font-display text-ink truncate leading-snug text-left">{track.title}</div>
                      <div className="text-[11px] text-ink-3 truncate text-left">{track.artist}</div>
                    </div>
                  </div>
                );
              })}

              {/* Empty state */}
              {!nowPlaying && upNext.length === 0 && (
                <div className="w-12 h-12 rounded-card bg-chip flex items-center justify-center">
                  <svg className="w-5 h-5 text-ink-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
