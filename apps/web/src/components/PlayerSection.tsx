/**
 * PlayerSection - Renders the player in full or mini mode.
 *
 * Full mode: Large album art + track info + seek bar (Default state)
 * Mini mode: Compact horizontal bar with thumbnail + track info (Lyrics/Chat state)
 *
 * @module components/PlayerSection
 */

import { useState } from 'react';
import { RecordPlayer } from './RecordPlayer';
import type { PlaybackTime } from '../types';
import type { UnifiedTrack } from '../providers/types';

interface PlayerSectionProps {
  mode: 'full' | 'mini';
  currentTrack: UnifiedTrack | null;
  isPaused: boolean;
  isTransitioning: boolean;
  togglePlay: () => void;
  isAppleMusicAuthorized: boolean;
  onLinkApple?: () => Promise<void>;
  playbackTime: PlaybackTime;
  onSeek?: (time: number) => void;
  onClickMiniPlayer?: () => void;
}

const formatTime = (seconds: number): string => {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const formatArtwork = (url: string | undefined, size = 80): string | null => {
  if (!url) return null;
  return url.replace('{w}', size.toString()).replace('{h}', size.toString());
};

export const PlayerSection = ({
  mode,
  currentTrack,
  isPaused,
  isTransitioning,
  togglePlay,
  isAppleMusicAuthorized,
  onLinkApple,
  playbackTime,
  onSeek,
  onClickMiniPlayer,
}: PlayerSectionProps) => {
  const [seekDragging, setSeekDragging] = useState(false);
  const [seekDragValue, setSeekDragValue] = useState(0);
  const seekDisplayValue = seekDragging ? seekDragValue : (playbackTime?.current || 0);

  if (mode === 'mini') {
    const artUrl = formatArtwork(currentTrack?.artworkUrl, 80);
    const trackName = currentTrack?.name || 'No Track';
    const artistName = currentTrack?.artist || '';

    return (
      <button
        onClick={onClickMiniPlayer}
        className="w-full flex items-center gap-3 px-4 py-2 h-14 bg-white/80 backdrop-blur-sm border-b border-gray-100 hover:bg-gray-50 transition-colors"
      >
        {/* Thumbnail */}
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 shrink-0">
          {artUrl ? (
            <img src={artUrl} alt={trackName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13" />
              </svg>
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-900 truncate">{trackName}</p>
          {artistName && (
            <p className="text-xs text-gray-500 truncate">{artistName}</p>
          )}
        </div>

        {/* Play/Pause */}
        <div
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
          role="button"
          aria-label={isPaused ? 'Play' : 'Pause'}
        >
          {isPaused ? (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
        </div>
      </button>
    );
  }

  // Full mode
  return (
    <div className="flex flex-col items-center w-full">
      {/* Record Player */}
      <div className="w-full max-w-xl px-8">
        <RecordPlayer
          currentTrack={currentTrack}
          isPaused={isPaused}
          isTransitioning={isTransitioning}
          togglePlay={togglePlay}
          isAppleMusicAuthorized={isAppleMusicAuthorized}
          onLinkApple={onLinkApple}
        />
      </div>

      {/* Connect Apple Music prompt */}
      {currentTrack && !isAppleMusicAuthorized && onLinkApple && (
        <div className="w-full max-w-sm px-8 mt-4 flex justify-center">
          <button
            onClick={onLinkApple}
            className="text-sm text-pink-500 hover:text-pink-600 transition-colors font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            Connect Apple Music for full playback
          </button>
        </div>
      )}

      {/* Seek bar */}
      {currentTrack && isAppleMusicAuthorized && (
        <div className="w-full max-w-sm px-8 mt-4 flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400 tabular-nums shrink-0">
            {formatTime(seekDisplayValue)}
          </span>
          <div className="relative flex-1 h-5 flex items-center">
            <div className="w-full h-1.5 bg-gray-100 rounded-full pointer-events-none">
              <div
                className="h-full bg-gray-900 rounded-full"
                style={{ width: `${(seekDisplayValue / (playbackTime?.total || 1)) * 100}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow border border-gray-300 pointer-events-none"
              style={{ left: `calc(${(seekDisplayValue / (playbackTime?.total || 1)) * 100}% - 6px)` }}
            />
            <input
              type="range"
              min={0}
              max={playbackTime?.total || 1}
              step={0.1}
              value={seekDisplayValue}
              onChange={(e) => { setSeekDragging(true); setSeekDragValue(parseFloat(e.target.value)); }}
              onPointerUp={(e) => { onSeek?.(parseFloat((e.target as HTMLInputElement).value)); setSeekDragging(false); }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-xs font-mono text-gray-400 tabular-nums shrink-0">
            {formatTime(playbackTime?.total || 0)}
          </span>
        </div>
      )}
    </div>
  );
};
