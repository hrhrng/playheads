import type { Track } from '../types';

interface FloatingMiniPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  isTransitioning?: boolean;
  onTogglePlay: () => void;
  conversationTitle: string;
  onNavigateToConversation: () => void;
}

export function FloatingMiniPlayer({
  currentTrack,
  isPlaying,
  isTransitioning = false,
  onTogglePlay,
  conversationTitle,
  onNavigateToConversation,
}: FloatingMiniPlayerProps) {
  if (!currentTrack?.attributes) return null;

  const artworkUrl = currentTrack.attributes.artwork?.url?.replace('{w}', '80').replace('{h}', '80');

  return (
    <div
      className="fixed bottom-0 left-0 right-0 md:bottom-6 md:left-auto md:right-6 md:max-w-xs z-50 bg-white border-t border-gemini-border md:border md:rounded-2xl md:shadow-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={onNavigateToConversation}
    >
      {artworkUrl && (
        <img
          src={artworkUrl}
          alt=""
          className="w-10 h-10 rounded-lg shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gemini-text truncate">{currentTrack.attributes.name}</p>
        <p className="text-xs text-gemini-subtext truncate">{conversationTitle}</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay();
        }}
        disabled={isTransitioning}
        className="w-10 h-10 md:w-8 md:h-8 rounded-full bg-gemini-text text-white flex items-center justify-center shrink-0 hover:bg-black transition-colors disabled:opacity-50"
      >
        {isPlaying ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        ) : (
          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
    </div>
  );
}
