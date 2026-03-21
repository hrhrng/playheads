import { useEffect, useRef, useCallback } from 'react';
import type { LyricsState } from '../../types/lyrics';

interface FullLyricsProps {
  lyrics: LyricsState;
  isOpen: boolean;
  onClose: () => void;
  onSeek: (time: number) => void;
}

/**
 * Full-screen scrollable lyrics overlay.
 * Auto-scrolls to the current line, but pauses when the user scrolls manually.
 * Tapping a line seeks playback to that timestamp.
 */
export const FullLyrics = ({ lyrics, isOpen, onClose, onSeek }: FullLyricsProps) => {
  const { status, lines, plainText, currentIndex } = lyrics;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const userScrolling = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  // Reset scroll state when opening/closing
  useEffect(() => {
    if (isOpen) {
      userScrolling.current = false;
      // Scroll to current line immediately on open
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

  const hasContent = status === 'synced' || status === 'plain';

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-start pt-12 pb-4 bg-white/60 backdrop-blur-xl transition-opacity duration-500 ease-out ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h3 className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.2em]">
          Lyrics
        </h3>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable lyrics */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="w-full max-w-xl px-8 overflow-y-auto no-scrollbar pb-44 flex-1"
      >
        {!hasContent && (
          <p className="text-center text-sm text-gray-400 mt-20">
            No lyrics available for this track
          </p>
        )}

        {status === 'plain' && plainText && (
          <div className="whitespace-pre-wrap text-sm text-gray-600 leading-relaxed text-center">
            {plainText}
          </div>
        )}

        {status === 'synced' && (
          <div className="flex flex-col items-center gap-1 pt-20 pb-20">
            {lines.map((line, i) => {
              const isCurrent = i === currentIndex;
              const isPast = i < currentIndex;

              return (
                <button
                  key={i}
                  ref={(el) => setLineRef(i, el)}
                  onClick={() => onSeek(line.time)}
                  className={`w-full text-center py-2.5 px-4 rounded-lg transition-all duration-300 cursor-pointer hover:bg-gray-100/50 ${
                    isCurrent
                      ? 'text-lg font-semibold text-gray-900 scale-105'
                      : isPast
                        ? 'text-sm text-gray-400'
                        : 'text-sm text-gray-500'
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
