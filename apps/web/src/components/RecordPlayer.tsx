/**
 * RecordPlayer - Music player with vinyl-style interface
 * @module components/RecordPlayer
 */

import React from 'react';
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
  isAppleMusicAuthorized,
  onLinkApple,
}: RecordPlayerProps): React.JSX.Element => {

  const formatArtwork = (url: string | undefined, size = 600): string | null => {
    if (!url) return null;
    return url.replace('{w}', size.toString()).replace('{h}', size.toString());
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

  return (
    <div className="flex flex-col items-center gap-8 group w-full">
      {/* Cover Art */}
      <div className="relative pointer-events-auto">
        <div className={`w-80 h-80 md:w-[420px] md:h-[420px] rounded-2xl shadow-2xl overflow-hidden relative bg-black border border-gray-800 transition-transform duration-700 ${!isPaused ? 'scale-100' : 'scale-95 opacity-90'}`}>
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

      {/* Track Info */}
      <div className="text-center space-y-2 max-w-lg px-4 w-full flex flex-col items-center">
        <h2 className="text-3xl font-semibold text-gray-900 tracking-tight leading-tight line-clamp-1">
          {trackName}
        </h2>
        <p className="text-lg text-gray-500 font-medium">{artistName}</p>

      </div>
    </div>
  );
};
