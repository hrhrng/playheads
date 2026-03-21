/**
 * LyricsView - Full-screen scrolling lyrics display.
 *
 * Shows all lyrics with the current line highlighted and auto-scrolled
 * to center. Supports drag gestures for navigation:
 * - Pull down → return to Default
 * - Swipe up → enter Chat mode
 *
 * @module components/LyricsView
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useDrag } from '@use-gesture/react';
import type { LyricLine } from '../utils/ttmlParser';
import type { PlaybackTime } from '../types';

interface LyricsViewProps {
  lyrics: LyricLine[];
  currentLineIndex: number;
  playbackTime: PlaybackTime;
  onClose: () => void;
  onOpenChat: () => void;
}

const DESKTOP_THRESHOLD = 120;
const MOBILE_THRESHOLD = 80;

function getThreshold() {
  return window.innerWidth < 768 ? MOBILE_THRESHOLD : DESKTOP_THRESHOLD;
}

function dampen(dy: number): number {
  return Math.sign(dy) * Math.min(Math.abs(dy) * 0.4, 200);
}

export const LyricsView = ({
  lyrics,
  currentLineIndex,
  playbackTime,
  onClose,
  onOpenChat,
}: LyricsViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-scroll to current line
  useEffect(() => {
    if (activeLineRef.current && !isDragging) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLineIndex, isDragging]);

  // Drag gesture for pull-down (close) and swipe-up (chat)
  const bind = useDrag(
    ({ down, movement: [, my], cancel, direction: [, dy] }) => {
      if (down) {
        setIsDragging(true);
        setDragY(dampen(my));
      } else {
        setIsDragging(false);
        const threshold = getThreshold();

        if (my > threshold) {
          // Pull down → close (back to default)
          onClose();
        } else if (my < -threshold) {
          // Swipe up → open chat
          onOpenChat();
        }
        setDragY(0);
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      from: [0, 0],
    }
  );

  const progress = playbackTime?.total
    ? (playbackTime.current / playbackTime.total) * 100
    : 0;

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      style={{
        transform: isDragging ? `translateY(${dragY}px)` : 'translateY(0)',
        transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25, 1.5, 0.5, 1)',
        willChange: isDragging ? 'transform' : 'auto',
      }}
    >
      {/* Scrolling lyrics body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 md:px-0 py-8"
        {...bind()}
        style={{ touchAction: 'pan-x' }}
      >
        <div className="max-w-lg mx-auto space-y-4">
          {/* Top spacer to allow first line to scroll to center */}
          <div className="h-[30vh]" />

          {lyrics.map((line, i) => (
            <p
              key={i}
              ref={i === currentLineIndex ? activeLineRef : undefined}
              className={`text-lg md:text-base leading-relaxed md:leading-loose transition-all duration-300 ${
                i === currentLineIndex
                  ? 'text-gray-900 font-semibold md:text-lg'
                  : i < currentLineIndex
                    ? 'text-gray-300'
                    : 'text-gray-400'
              }`}
            >
              {line.text}
            </p>
          ))}

          {/* Bottom spacer */}
          <div className="h-[40vh]" />
        </div>
      </div>

      {/* Thin progress bar at bottom */}
      <div className="h-0.5 md:h-1 bg-gray-100 shrink-0">
        <div
          className="h-full bg-gray-900 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
