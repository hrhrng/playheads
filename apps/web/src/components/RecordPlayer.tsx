/**
 * RecordPlayer - Music player with vinyl-style interface
 * @module components/RecordPlayer
 */

import React, { useState } from 'react';
import type { PlaybackTime } from '../types';
import type { UnifiedTrack } from '../providers/types';

interface RecordPlayerProps {
  /** Current track being played */
  currentTrack: UnifiedTrack | null;
  /** Whether playback is paused */
  isPaused: boolean;
  /** Whether a playback transition is in progress */
  isTransitioning?: boolean;
  /** Toggle play/pause */
  togglePlay: () => void;
  /** Current playback position and duration */
  playbackTime: PlaybackTime;
  /** Seek to specific position */
  onSeek?: (time: number) => void;
  /** Whether Apple Music is fully authorized (not just preview) */
  isAppleMusicAuthorized?: boolean;
  /** Callback to link Apple Music account */
  onLinkApple?: () => Promise<void>;
}

/**
 * RecordPlayer component - displays album art with playback controls
 */
export const RecordPlayer = ({
  currentTrack,
  isPaused,
  isTransitioning = false,
  togglePlay,
  playbackTime,
  onSeek,
  isAppleMusicAuthorized,
  onLinkApple,
}: RecordPlayerProps): React.JSX.Element => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragValue, setDragValue] = useState<number>(0);

  const formatArtwork = (url: string | undefined, size = 600): string | null => {
    if (!url) return null;
    return url.replace('{w}', size.toString()).replace('{h}', size.toString());
  };

  const formatTime = (seconds: number): string => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center gap-6 opacity-30 select-none">
        <div className="w-64 h-64 rounded-xl bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center">
          <span className="text-gray-400 font-mono text-xs">NO DISK</span>
        </div>
        <div className="text-gray-300 font-mono text-xs uppercase tracking-widest">Idle</div>
      </div>
    );
  }

  const trackName = currentTrack.name || 'Unknown Track';
  const artistName = currentTrack.artist || 'Unknown Artist';
  const artworkUrl = formatArtwork(currentTrack.artworkUrl);

  const current = playbackTime?.current || 0;
  const total = playbackTime?.total || 1;
  const displayValue = isDragging ? dragValue : current;


  return (
    <div className="flex flex-col items-center gap-8 group w-full">
      {/* Cover Art */}
      <div className="relative pointer-events-auto">
        <div className={`w-72 h-72 md:w-96 md:h-96 rounded-2xl shadow-2xl overflow-hidden relative bg-black border border-gray-800 transition-transform duration-700 ${!isPaused ? 'scale-100' : 'scale-95 opacity-90'}`}>
          {artworkUrl ? (
            <img src={artworkUrl} alt={trackName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-800 to-black flex items-center justify-center">
              <svg className="w-20 h-20 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19V6l12-3v13M9 10l12-3" />
              </svg>
            </div>
          )}

          {/* Play/Pause Overlay */}
          <button
            onClick={togglePlay}
            disabled={isTransitioning}
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-[2px] disabled:pointer-events-none disabled:opacity-50"
          >
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center transform hover:scale-110 transition-transform">
              {isPaused ? (
                <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Track Info & Progress */}
      <div className="text-center space-y-2 max-w-lg px-4 w-full flex flex-col items-center">
        <h2 className="text-3xl font-semibold text-gray-900 tracking-tight leading-tight line-clamp-1">
          {trackName}
        </h2>
        <p className="text-lg text-gray-500 font-medium">{artistName}</p>

        {/* Connect Apple Music link (preview mode) */}
        {!isAppleMusicAuthorized && onLinkApple && (
          <button
            onClick={onLinkApple}
            className="text-sm text-pink-500 hover:text-pink-600 transition-colors font-medium flex items-center gap-1.5 mt-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            Connect Apple Music for full playback
          </button>
        )}

        {/* Progress Bar */}
        <div className="w-full max-w-sm mt-4 flex items-center gap-3">
          <span className="text-xs font-mono text-gray-400 w-10 text-right">
            {formatTime(displayValue)}
          </span>

          <input
            type="range"
            min={0}
            max={total}
            step={0.1}
            value={displayValue}
            className="progress-bar flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #1a1a1a ${(displayValue / total) * 100}%, #e5e5e5 ${(displayValue / total) * 100}%)`,
              touchAction: 'none',
            }}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              setIsDragging(true);
              setDragValue(value);
            }}
            onPointerUp={(e) => {
              const value = parseFloat((e.target as HTMLInputElement).value);
              if (onSeek) onSeek(value);
              setIsDragging(false);
            }}
          />

          <span className="text-xs font-mono text-gray-400 w-10 text-left">
            {formatTime(total)}
          </span>
        </div>
      </div>
    </div>
  );
};
