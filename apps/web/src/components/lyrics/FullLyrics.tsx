import { useEffect, useRef, useCallback, useState } from 'react';
import type { LyricsState } from '../../types/lyrics';

interface FullLyricsProps {
  lyrics: LyricsState;
  isOpen: boolean;
  onClose: () => void;
  onSeek: (time: number) => void;
  artworkUrl?: string;
}

/**
 * Full-screen scrollable lyrics overlay (Spotify-style).
 * Dark immersive background with album-art color bleed,
 * large text hierarchy, auto-scroll, tap-to-seek.
 */
export const FullLyrics = ({ lyrics, isOpen, onClose, onSeek }: FullLyricsProps) => {
  const { status, lines, plainText, currentIndex } = lyrics;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const userScrolling = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);

  // Track manual scrolling — pause auto-scroll for 3s
  const handleScroll = useCallback(() => {
    userScrolling.current = true;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      userScrolling.current = false;
    }, 3000);
  }, []);

  // Auto-scroll to active line
  useEffect(() => {
    if (!isOpen || userScrolling.current || currentIndex < 0) return;
    const el = lineRefs.current.get(currentIndex);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [isOpen, currentIndex]);

  // Reset scroll on open
  useEffect(() => {
    if (isOpen) {
      userScrolling.current = false;
      requestAnimationFrame(() => {
        const el = lineRefs.current.get(currentIndex);
        el?.scrollIntoView({ behavior: 'instant', block: 'center' });
      });
    }
  }, [isOpen, currentIndex]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const setLineRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    if (el) lineRefs.current.set(index, el);
    else lineRefs.current.delete(index);
  }, []);

  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleLineTap = useCallback((index: number, time: number) => {
    setTappedIndex(index);
    onSeek(time);
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTappedIndex(null), 250);
  }, [onSeek]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(scrollTimer.current);
      clearTimeout(tapTimer.current);
      lineRefs.current.clear();
    };
  }, []);

  const hasContent = status === 'synced' || status === 'plain';

  return (
    <div
      role="dialog"
      aria-label="Full lyrics view"
      aria-hidden={!isOpen}
      className={`absolute inset-0 z-40 flex flex-col transition-all duration-300 ease-out origin-bottom ${
        isOpen
          ? 'opacity-100 scale-100 pointer-events-auto'
          : 'opacity-0 scale-95 pointer-events-none'
      }`}
    >
      {/* Frosted glass background — matches TranscriptOverlay */}
      <div className="absolute inset-0 bg-page/60 backdrop-blur-glass" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-2">
        <h3 className="text-[10px] font-medium text-ink-3 uppercase tracking-[0.2em]">
          Lyrics
        </h3>
        <button
          onClick={onClose}
          aria-label="Close lyrics"
          className="w-7 h-7 rounded-full bg-chip flex items-center justify-center text-ink-3 hover:text-ink hover:bg-chip-2 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable lyrics with edge fade */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative z-10 flex-1 overflow-y-auto no-scrollbar lyrics-mask"
      >
        {!hasContent && (
          <p className="text-center text-sm text-ink-3 mt-20">
            No lyrics available for this track
          </p>
        )}

        {status === 'plain' && plainText && (
          <div className="whitespace-pre-wrap text-lg font-display text-ink-2 leading-relaxed text-center px-8 py-20">
            {plainText}
          </div>
        )}

        {status === 'synced' && (
          <div className="flex flex-col items-center gap-0.5 px-6 py-[40vh]">
            {lines.map((line, i) => {
              const isCurrent = i === currentIndex;
              const isPast = i < currentIndex;
              const isTapped = i === tappedIndex;

              return (
                <button
                  key={i}
                  ref={(el) => setLineRef(i, el)}
                  onClick={() => handleLineTap(i, line.time)}
                  aria-label={line.text ? `Jump to: ${line.text}` : 'Jump to instrumental'}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`w-full text-center py-3 px-4 rounded-xl cursor-pointer transition-all duration-500 ease-spring active:scale-[0.97] font-display ${
                    isTapped ? 'animate-lyric-tap' : ''
                  } ${
                    isCurrent
                      ? 'text-2xl md:text-3xl font-semibold text-ink'
                      : isPast
                        ? 'text-lg md:text-xl text-ink-4'
                        : 'text-lg md:text-xl text-ink-3'
                  }`}
                >
                  {line.text || '\u266A'}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
