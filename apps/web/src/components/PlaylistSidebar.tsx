/**
 * PlaylistSidebar - Collapsible playlist sidebar with resizable width
 * Shows the global queue (same across all conversations).
 * queue[0] = now playing, queue.slice(1) = up next.
 * @module components/PlaylistSidebar
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
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
      className={`h-full flex flex-col pt-3 pr-3 pl-3 relative ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}`}
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
      {/* Playlist Container */}
      <div className="flex-1 min-h-0 glass rounded-t-sheet flex flex-col overflow-hidden relative transition-all">

        {/* Header */}
        {isMobileSheet ? (
          /* Mobile sheet: title only, no collapse toggle */
          <div className="flex justify-between items-center p-6 pb-2">
            <h2 className="text-[13px] font-medium text-ink uppercase tracking-[0.18em]">Playlist</h2>
          </div>
        ) : (
          /* Desktop: collapse toggle button */
          <div className={`flex ${effectiveCollapsed ? 'justify-center py-6' : 'justify-between p-6 pb-2'} items-center`}>
            {!effectiveCollapsed && <h2 className="text-[13px] font-medium text-ink uppercase tracking-[0.18em]">Playlist</h2>}
            <button
              onClick={toggleCollapse}
              className="p-2 rounded-xl hover:bg-chip text-ink-3 hover:text-ink transition-all duration-300 group focus:outline-none focus:ring-0"
              title={effectiveCollapsed ? "Expand Playlist" : "Collapse Playlist"}
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

        {/* Content */}
        {effectiveCollapsed ? (
          /* Mini View — album cover (mirrors left sidebar's "shows what
             matters at a glance" treatment). Falls back to a chip
             placeholder when nothing's playing. */
          <div className="flex-1 flex flex-col items-center pt-6 gap-4 opacity-100 transition-opacity duration-500 delay-100">
            <div className="w-14 h-14 rounded-card overflow-hidden bg-chip shadow-cover shrink-0">
              {currentTrack?.artworkUrl ? (
                <img
                  src={formatArtwork(currentTrack.artworkUrl, 112)}
                  alt={currentTrack.name || ''}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-ink-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13" />
                  </svg>
                </div>
              )}
            </div>

            {/* Status indicator — bars when playing, dot when idle. */}
            <div className="flex flex-col items-center gap-2">
              {isPlaying ? (
                <div className="flex gap-1 h-3 items-end">
                  <div className="w-1 bg-accent rounded-full animate-music-bar-1 h-full"></div>
                  <div className="w-1 bg-accent rounded-full animate-music-bar-2 h-2/3"></div>
                  <div className="w-1 bg-accent rounded-full animate-music-bar-3 h-1/2"></div>
                </div>
              ) : (
                <div className="w-1 h-1 bg-ink-4 rounded-full"></div>
              )}
            </div>
          </div>
        ) : (
          /* Full Expanded View */
          <div className="flex-1 min-h-0 flex flex-col min-w-0 opacity-100 transition-opacity duration-300">
            {showQueue && (
              <div className="flex-1 overflow-y-auto px-4 pb-4">

                {/* History (collapsed by default) */}
                {formattedHistory.length > 0 && (
                  <div className="mb-4">
                    <button
                      onClick={() => setHistoryExpanded(prev => !prev)}
                      className="flex items-center gap-1 px-2 mb-2 group focus:outline-none"
                    >
                      <svg className={`w-3 h-3 text-ink-3 transition-transform ${historyExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                      <h3 className="text-[10px] font-medium text-ink-3 uppercase tracking-widest">History</h3>
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

                {/* Now Playing */}
                {nowPlaying && (
                  <div className="mb-4">
                    <h3 className="text-[10px] font-medium text-ink-3 uppercase tracking-widest mb-2 px-2">Now Playing</h3>
                    <div
                      onClick={() => handleTrackClick(0)}
                      className="flex items-center gap-3 p-2 rounded-2xl bg-chip-2 hairline cursor-pointer group transition-colors"
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
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold font-display text-ink truncate leading-snug">{nowPlaying.title}</div>
                        <div className="text-[11px] text-ink-3 truncate">{nowPlaying.artist}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Up Next */}
                {upNext.length > 0 && (
                  <>
                    <h3 className="text-[10px] font-medium text-ink-3 uppercase tracking-widest mb-2 px-2">Up Next</h3>
                    <div className="space-y-1">
                      {upNext.map((track, i) => {
                        const realIndex = i + 1;
                        return (
                          <div
                            key={`${track.id}-${realIndex}`}
                            onClick={() => handleTrackClick(realIndex)}
                            className="flex items-center gap-3 p-2 rounded-2xl hover:bg-chip cursor-pointer group transition-colors"
                          >
                            <div className="w-10 h-10 rounded-card bg-chip overflow-hidden relative shrink-0">
                              <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium font-display text-ink truncate leading-snug">{track.title}</div>
                              <div className="text-[11px] text-ink-3 truncate">{track.artist}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
