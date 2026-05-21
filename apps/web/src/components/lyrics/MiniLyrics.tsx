import type { LyricsState } from '../../types/lyrics';

interface MiniLyricsProps {
  lyrics: LyricsState;
  onClick: () => void;
}

/**
 * Compact 2-line lyrics preview shown below the RecordPlayer.
 * Clicking expands to the full lyrics overlay.
 */
export const MiniLyrics = ({ lyrics, onClick }: MiniLyricsProps) => {
  const { status, lines, currentIndex } = lyrics;

  // Stay silent until we actually have lyrics. Showing a skeleton during
  // `loading` would just flash away when the fetch returns `not-found`
  // (lyrics aren't guaranteed to exist for every track).
  if (status !== 'synced' && status !== 'plain') return null;

  // Plain lyrics — show a hint
  if (status === 'plain') {
    return (
      <button
        onClick={onClick}
        className="mt-5 max-w-sm mx-auto block text-center cursor-pointer group animate-fade-in"
      >
        <span className="text-xs text-ink-3 group-hover:text-ink-2 transition-colors flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 10l12-3" />
          </svg>
          Lyrics available &middot; tap to view
        </span>
      </button>
    );
  }

  // Synced lyrics — show current + next line
  const currentLine = currentIndex >= 0 ? lines[currentIndex] : null;
  const nextLine = currentIndex + 1 < lines.length ? lines[currentIndex + 1] : null;

  // Don't show if we haven't reached the first lyric yet and there's nothing to display
  if (!currentLine && !nextLine) return null;

  return (
    <button
      onClick={onClick}
      className="mt-5 max-w-sm mx-auto block text-center cursor-pointer group w-full animate-fade-in"
    >
      <div className="space-y-1 overflow-hidden">
        {/* Current line — slides in on change */}
        <p
          key={`cur-${currentIndex}`}
          className="text-base font-display font-medium text-ink leading-snug line-clamp-1 animate-lyric-slide-in"
        >
          {currentLine?.text || '\u00A0'}
        </p>
        {/* Next line */}
        <p
          key={`next-${currentIndex}`}
          className="text-sm font-display text-ink-3 leading-snug line-clamp-1 animate-lyric-slide-in"
          style={{ animationDelay: '60ms' }}
        >
          {nextLine?.text || '\u00A0'}
        </p>
      </div>
      {/* Expand hint */}
      <span className="text-[10px] text-ink-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
        </svg>
        expand
      </span>
    </button>
  );
};
