/**
 * RecordPlayer - Music player with vinyl-style interface
 * @module components/RecordPlayer
 */

import React, { useState } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import type { Track, PlaybackTime } from '../types';

interface RecordPlayerProps {
  /** Current track being played */
  currentTrack: Track | null;
  /** Whether playback is paused */
  isPaused: boolean;
  /** Toggle play/pause */
  togglePlay: () => void;
  /** Current playback position and duration */
  playbackTime: PlaybackTime;
  /** Seek to specific position */
  onSeek?: (time: number) => void;
}

/**
 * RecordPlayer component - displays album art with playback controls
 */
export const RecordPlayer = ({
  currentTrack,
  isPaused,
  togglePlay,
  playbackTime,
  onSeek
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

  const attr = currentTrack.attributes || currentTrack;
  const trackName = (attr as any).name || (attr as any).title || 'Unknown Track';
  const artistName = (attr as any).artistName || 'Unknown Artist';
  const artworkUrl = formatArtwork(
    (attr as any).artwork?.url ||
    (currentTrack as any).artwork?.url ||
    (currentTrack as any).artworkURL
  );

  const current = playbackTime?.current || 0;
  const total = playbackTime?.total || 1;
  const displayValue = isDragging ? dragValue : current;

  const sliderStyles = {
    track: { backgroundColor: '#1a1a1a', height: 4 },
    rail: { backgroundColor: '#e5e5e5', height: 4 },
    handle: {
      backgroundColor: '#fff',
      border: 'none' as const,
      width: 16,
      height: 16,
      marginTop: -6,
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      opacity: 1,
    },
  };

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
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-[2px]"
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

        {/* Progress Bar */}
        <div className="w-full max-w-sm mt-4 flex items-center gap-3">
          <span className="text-xs font-mono text-gray-400 w-10 text-right">
            {formatTime(displayValue)}
          </span>

          <div className="flex-1">
            <Slider
              min={0}
              max={total}
              step={0.1}
              value={displayValue}
              onChange={(val: number | number[]) => {
                const value = Array.isArray(val) ? val[0] : val;
                setIsDragging(true);
                setDragValue(value);
              }}
              onAfterChange={(val: number | number[]) => {
                const value = Array.isArray(val) ? val[0] : val;
                if (onSeek) onSeek(value);
                setTimeout(() => setIsDragging(false), 1000);
              }}
              styles={sliderStyles}
            />
          </div>

          <span className="text-xs font-mono text-gray-400 w-10 text-left">
            {formatTime(total)}
          </span>
        </div>
      </div>
    </div>
  );
};
