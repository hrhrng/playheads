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
 * Features: album-art blurred background, large text hierarchy,
 * auto-scroll with manual pause, tap-to-seek with press feedback.
 */
export const FullLyrics = ({ lyrics, isOpen, onClose, onSeek, artworkUrl }: FullLyricsProps) => {
  const { status, lines, plainText, currentIndex } = lyrics;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const userScrolling = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);

  // Track manual scrolling — pause auto-scroll for 3s after user scrolls
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

  // Reset scroll state when opening
  useEffect(() => {
    if (isOpen) {
      userScrolling.current = false;
      requestAnimationFrame(() => {
        const el = lineRefs.current.get(currentIndex);
        el?.scrollIntoView({ behavior: 'instant', block: 'center' });
      });
    }
  }, [isOpen, currentIndex]);

  // Keyboard: Escape to close
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

  const handleLineTap = useCallback((index: number, time: number) => {
    setTappedIndex(index);
    onSeek(time);
    setTimeout(() => setTappedIndex(null), 250);
  }, [onSeek]);

  const hasContent = status === 'synced' || status === 'plain';

  // Resolve artwork URL for background
  const bgUrl = artworkUrl?.replace('{w}', '600').replace('{h}', '600');

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col transition-transform duration-300 ease-out ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Album art blurred background */}
      {bgUrl && (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={bgUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-150 blur-[80px] opacity-40"
          />
        </div>
      )}
      {/* White overlay for readability */}
      <div className="absolute inset-0 bg-white/70" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-2">
        <h3 className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.2em]">
          Lyrics
        </h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full border border-gray-200/80 bg-white/60 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors backdrop-blur-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
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
          <p className="text-center text-sm text-gray-400 mt-20">
            No lyrics available for this track
          </p>
        )}

        {status === 'plain' && plainText && (
          <div className="whitespace-pre-wrap text-lg text-gray-600 leading-relaxed text-center px-8 py-20">
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
                  className={`w-full text-center py-3 px-4 rounded-xl cursor-pointer transition-all duration-500 ease-out active:scale-[0.97] ${
                    isTapped ? 'animate-lyric-tap' : ''
                  } ${
                    isCurrent
                      ? 'text-2xl md:text-3xl font-bold text-gray-900'
                      : isPast
                        ? 'text-lg md:text-xl text-gray-900/25'
                        : 'text-lg md:text-xl text-gray-900/40'
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
