import type { Track } from '../types';

interface FloatingMiniPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  conversationTitle: string;
  onNavigateToConversation: () => void;
}

export function FloatingMiniPlayer({
  currentTrack,
  isPlaying,
  onTogglePlay,
  conversationTitle,
  onNavigateToConversation,
}: FloatingMiniPlayerProps) {
  if (!currentTrack?.attributes) return null;

  const artworkUrl = currentTrack.attributes.artwork?.url?.replace('{w}', '80').replace('{h}', '80');

  return (
    <div
      className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-lg border border-gemini-border p-3 flex items-center gap-3 max-w-xs cursor-pointer hover:shadow-xl transition-shadow"
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
        className="w-8 h-8 rounded-full bg-gemini-text text-white flex items-center justify-center shrink-0 hover:bg-black transition-colors"
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
