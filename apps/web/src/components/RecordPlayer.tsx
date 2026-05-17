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
      <div className="flex flex-col items-center gap-6 opacity-40 select-none">
        <div className="w-64 h-64 rounded-card bg-chip hairline flex items-center justify-center">
          <span className="text-ink-3 font-mono text-xs tracking-widest">NO DISK</span>
        </div>
        <div className="text-ink-3 font-mono text-xs uppercase tracking-widest">Idle</div>
      </div>
    );
  }

  const trackName = currentTrack.name || 'Unknown Track';
  const artistName = currentTrack.artist || 'Unknown Artist';
  const artworkUrl = formatArtwork(currentTrack.artworkUrl);

  return (
    <div className="flex flex-col items-center gap-7 group w-full">
      {/* Cover Art — fills the parent container width (matches ChatInput
         max-w-xl so cover + composer line up), aspect-square keeps it
         a perfect square, 10px radius + dual cover shadow per iOS Spec. */}
      <div className="relative pointer-events-auto w-full">
        <div className={`w-full aspect-square rounded-card shadow-cover overflow-hidden relative transition-transform duration-700 ease-spring ${!isPaused ? 'scale-100' : 'scale-[0.97] opacity-95'}`}>
          {artworkUrl ? (
            <img src={artworkUrl} alt={trackName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-chip flex items-center justify-center">
              <svg className="w-20 h-20 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19V6l12-3v13M9 10l12-3" />
              </svg>
            </div>
          )}

          {/* Play/Pause Overlay — glass capsule on hover */}
          <button
            onClick={togglePlay}
            disabled={isTransitioning}
            className="absolute inset-0 flex items-center justify-center bg-black/15 hover:bg-black/30 transition-all opacity-0 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-50"
          >
            <div className="w-[68px] h-[68px] rounded-full bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center transform hover:scale-110 transition-transform shadow-glass">
              {isPaused ? (
                <svg className="w-7 h-7 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Track Info — display font, ink hierarchy */}
      <div className="text-center space-y-1.5 max-w-lg px-4 w-full flex flex-col items-center">
        <h2 className="text-[26px] font-display font-medium text-ink tracking-tight leading-tight line-clamp-1">
          {trackName}
        </h2>
        <p className="text-[15px] text-ink-2 font-display">{artistName}</p>
      </div>
    </div>
  );
};
