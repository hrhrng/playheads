/**
 * PlaylistSidebar - Collapsible playlist sidebar with resizable width
 * @module components/PlaylistSidebar
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Track } from '../types';

interface PlaylistSidebarProps {
  /** Currently playing track */
  currentTrack: Track | null;
  /** Whether music is currently playing */
  isPlaying: boolean;
  /** Queue of tracks to play */
  queue: Track[];
  /** Callback when a track is selected to play */
  onPlayTrack?: (index: number) => void;
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

interface FormattedTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
}

/**
 * PlaylistSidebar component - displays queue with collapsible and resizable interface
 */
export const PlaylistSidebar = ({
  currentTrack,
  isPlaying,
  queue: propQueue,
  onPlayTrack,
  collapsed,
  toggleCollapse,
  showQueue = true,
  width,
  onWidthChange
}: PlaylistSidebarProps): React.JSX.Element => {
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(width);

  // Handle resize start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (collapsed) return; // Don't allow resize when collapsed
    e.preventDefault();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = width;
  }, [collapsed, width]);

  // Handle resize movement
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX.current - e.clientX; // Negative because we drag from left edge
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

  const queue: FormattedTrack[] = (propQueue && propQueue.length > 0)
    ? propQueue.map((item): FormattedTrack => ({
        id: item.id || Math.random().toString(),
        title: (item as any).title || (item.attributes?.name as string) || 'Unknown Title',
        artist: (item as any).artistName || (item.attributes?.artistName as string) || 'Unknown Artist',
        cover: formatArtwork(
          (item as any).artworkURL ||
          (item as any).artwork?.url ||
          (item.attributes?.artwork as any)?.url
        )
      }))
    : [];

  // Use dynamic width instead of fixed Tailwind classes
  const sidebarWidth = collapsed ? 96 : width; // 96px = w-24

  return (
    <div
      ref={sidebarRef}
      className={`h-full flex flex-col bg-gemini-bg pt-4 pr-4 pl-4 relative ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}`}
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* Resize Handle - Left edge */}
      {!collapsed && (
        <div
          className={`absolute -left-0.5 top-10 bottom-0 w-1 cursor-ew-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-10 group ${
            isResizing ? 'bg-blue-500' : 'bg-transparent'
          }`}
          onMouseDown={handleMouseDown}
          title="Drag to resize sidebar"
        >
          {/* Visual indicator on hover */}
          <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-8 bg-gray-300 rounded-full opacity-0 group-hover:opacity-100 group-hover:bg-blue-500/80 transition-all" />
        </div>
      )}

      {/* Resize Handle for collapsed state */}
      {collapsed && (
        <div
          className={`absolute -left-0.5 top-10 bottom-0 w-1 cursor-ew-resize hover:bg-blue-400 transition-colors z-10 group ${isResizing ? 'bg-blue-500' : 'bg-transparent'}`}
          onMouseDown={handleMouseDown}
          title="Drag to expand sidebar"
        >
          {/* Visual indicator on hover */}
          <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-8 bg-gray-300 rounded-full opacity-0 group-hover:opacity-100 group-hover:bg-blue-500/80 transition-all" />
        </div>
      )}
      {/* Playlist Container */}
      <div className="flex-1 bg-white rounded-t-3xl flex flex-col shadow-sm overflow-hidden relative border border-white transition-all">

        {/* Toggle Button - Absolute Positioned or Flex */}
        <div className={`flex ${collapsed ? 'justify-center py-6' : 'justify-between p-6 pb-2'} items-center`}>
          {!collapsed && <h2 className="text-lg font-sans font-medium text-gemini-text">Playlist</h2>}
          <button
            onClick={toggleCollapse}
            className="p-2 rounded-xl hover:bg-gray-100 text-gemini-subtext hover:text-gemini-text transition-all duration-300 group focus:outline-none focus:ring-0"
            title={collapsed ? "Expand Playlist" : "Collapse Playlist"}
          >
            {collapsed ? (
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

        {/* Content */}
        {collapsed ? (
          /* Mini View - Vertical Player Strip */
          <div className="flex-1 flex flex-col items-center pt-8 gap-6 opacity-100 transition-opacity duration-500 delay-100">

            {/* Mini Vinyl Spinner */}
            <div className={`w-12 h-12 rounded-full bg-black border-2 border-gray-200 flex items-center justify-center ${!!currentTrack && isPlaying ? 'animate-spin-slow' : ''} shadow-md`}>
              <div className="w-4 h-4 rounded-full bg-white border border-gray-300" />
            </div>

            {/* Status Indicator */}
            <div className="flex flex-col items-center gap-2">
              {isPlaying ? (
                <div className="flex gap-1 h-3 items-end">
                  <div className="w-1 bg-blue-500 rounded-full animate-music-bar-1 h-full"></div>
                  <div className="w-1 bg-blue-500 rounded-full animate-music-bar-2 h-2/3"></div>
                  <div className="w-1 bg-blue-500 rounded-full animate-music-bar-3 h-1/2"></div>
                </div>
              ) : (
                <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
              )}
            </div>
          </div>
        ) : (
          /* Full Expanded View */
          <div className="flex-1 flex flex-col min-w-0 opacity-100 transition-opacity duration-300">

            {/* Queue List */}
            {showQueue && (
              <div className="flex-1 overflow-y-auto space-y-2 px-4 pb-4">
                <h3 className="text-xs font-medium text-gemini-subtext uppercase tracking-wider mb-2 px-2">Up Next</h3>
                {queue.map((track, index) => (
                  <div
                    key={track.id}
                    onClick={() => onPlayTrack && onPlayTrack(index)}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-gemini-bg cursor-pointer group transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gray-200 overflow-hidden relative shrink-0">
                      <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gemini-text truncate">{track.title}</div>
                      <div className="text-xs text-gemini-subtext truncate">{track.artist}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
