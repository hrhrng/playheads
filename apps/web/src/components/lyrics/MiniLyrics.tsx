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

  // Don't render for states with no useful lyrics
  if (status === 'idle' || status === 'not-found' || status === 'error') return null;

  // Loading placeholder
  if (status === 'loading') {
    return (
      <div className="mt-5 max-w-sm mx-auto flex flex-col items-center gap-2 animate-pulse">
        <div className="h-4 w-48 bg-gray-200 rounded" />
        <div className="h-3 w-32 bg-gray-100 rounded" />
      </div>
    );
  }

  // Plain lyrics — show a hint
  if (status === 'plain') {
    return (
      <button
        onClick={onClick}
        className="mt-5 max-w-sm mx-auto block text-center cursor-pointer group"
      >
        <span className="text-xs text-gray-400 group-hover:text-gray-600 transition-colors">
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
      className="mt-5 max-w-sm mx-auto block text-center cursor-pointer group w-full"
    >
      <div className="space-y-1.5 overflow-hidden">
        {/* Current line */}
        <p
          key={`cur-${currentIndex}`}
          className="text-sm font-medium text-gray-700 leading-snug line-clamp-1 animate-fade-in"
        >
          {currentLine?.text || '\u00A0'}
        </p>
        {/* Next line */}
        <p
          key={`next-${currentIndex}`}
          className="text-xs text-gray-400 leading-snug line-clamp-1 animate-fade-in"
        >
          {nextLine?.text || '\u00A0'}
        </p>
      </div>
      {/* Expand hint on hover */}
      <span className="text-[10px] text-gray-300 mt-2 block opacity-0 group-hover:opacity-100 transition-opacity">
        tap to expand
      </span>
    </button>
  );
};
