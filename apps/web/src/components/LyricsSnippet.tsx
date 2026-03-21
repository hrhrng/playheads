/**
 * LyricsSnippet - 2-line lyrics preview shown in Default state.
 *
 * When lyrics are available: shows current + next line, clickable to enter Lyrics mode.
 * When no lyrics: shows a thin divider line.
 *
 * @module components/LyricsSnippet
 */

interface LyricsSnippetProps {
  currentLine: string | null;
  nextLine: string | null;
  onClick: () => void;
  lyricsAvailable: boolean;
}

export const LyricsSnippet = ({
  currentLine,
  nextLine,
  onClick,
  lyricsAvailable,
}: LyricsSnippetProps) => {
  if (!lyricsAvailable) {
    return (
      <div className="w-full max-w-xl mx-auto px-6">
        <hr className="border-gray-100" />
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full max-w-xl mx-auto px-6 py-3 flex flex-col items-center gap-1 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer min-h-[60px] justify-center"
    >
      {currentLine && (
        <p className="text-sm text-gray-500 font-medium text-center line-clamp-1 transition-opacity duration-300">
          {currentLine}
        </p>
      )}
      {nextLine && (
        <p className="text-sm text-gray-300 text-center line-clamp-1 transition-opacity duration-300">
          {nextLine}
        </p>
      )}
      {!currentLine && !nextLine && (
        <p className="text-sm text-gray-300 italic">♪ ♪ ♪</p>
      )}
    </button>
  );
};
