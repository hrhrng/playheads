/**
 * MiniPlayer — compact "now playing" bar shown above the chat composer on
 * non-feed pages (DiscoveryPage, PlaylistView). The feed itself
 * (ChatInterface's vertical swiper) already exposes a full RecordPlayer,
 * so we deliberately skip rendering there.
 *
 * Layout mirrors the bottom bars in Spotify / Apple Music: small
 * artwork on the left, scrolling-safe title + artist in the middle,
 * play/pause + skip controls on the right. Renders nothing when there
 * is no current track, so callers can drop it in unconditionally.
 *
 * Click target on the body is intentionally a no-op for now — the
 * conversation that seeded playback isn't tracked, so there's no
 * unambiguous "expand to full player" destination. Controls still work.
 *
 * @module components/MiniPlayer
 */

import { useTranslation } from 'react-i18next';
import type { UnifiedTrack } from '../providers/types';

interface MiniPlayerProps {
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  togglePlay: () => void;
  onSkipNext?: () => void;
}

export const MiniPlayer = ({
  currentTrack,
  isPlaying,
  togglePlay,
  onSkipNext,
}: MiniPlayerProps): React.JSX.Element | null => {
  const { t } = useTranslation();
  if (!currentTrack) return null;

  const artwork = currentTrack.artworkUrl?.replace('{w}', '120').replace('{h}', '120');

  return (
    <div className="mb-2 mx-auto max-w-xl">
      <div className="glass hairline rounded-2xl flex items-center gap-3 pl-2 pr-3 py-2">
        {/* Artwork */}
        <div className="w-10 h-10 rounded-card overflow-hidden bg-chip shrink-0 relative">
          {artwork ? (
            <img src={artwork} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : null}
          {isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="flex gap-0.5 h-3 items-end">
                <div className="w-0.5 bg-white rounded-full animate-music-bar-1 h-full" />
                <div className="w-0.5 bg-white rounded-full animate-music-bar-2 h-2/3" />
                <div className="w-0.5 bg-white rounded-full animate-music-bar-3 h-1/2" />
              </div>
            </div>
          )}
        </div>

        {/* Track info — single-line marquee-safe; truncate is fine, the user
            can read full info on the feed. */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium font-display text-ink truncate leading-tight">
            {currentTrack.name || t('miniPlayer.unknownTrack')}
          </div>
          <div className="text-[11px] text-ink-3 truncate leading-tight">
            {currentTrack.artist || t('miniPlayer.unknownArtist')}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={togglePlay}
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink hover:bg-chip-2 transition-colors"
            aria-label={isPlaying ? t('miniPlayer.pause') : t('miniPlayer.play')}
            title={isPlaying ? t('miniPlayer.pause') : t('miniPlayer.play')}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          {onSkipNext && (
            <button
              type="button"
              onClick={onSkipNext}
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-chip-2 transition-colors"
              aria-label={t('miniPlayer.skipNext')}
              title={t('miniPlayer.skipNext')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 5v14l8-7z" />
                <rect x="15" y="5" width="2" height="14" rx="0.5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
