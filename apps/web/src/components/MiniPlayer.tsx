/**
 * MiniPlayer — compact "now playing" bar shown above the chat composer on
 * non-feed pages (DiscoveryPage, PlaylistView). The feed itself
 * (ChatInterface's vertical swiper) already exposes a full RecordPlayer,
 * so we deliberately skip rendering there.
 *
 * Layout mirrors the bottom bars in Spotify / Apple Music: small
 * artwork on the left, scrolling-safe title + artist in the middle,
 * play/pause + skip controls on the right, thin seek bar pinned to
 * the bottom edge. Tapping the body (anywhere except the controls)
 * fires `onExpand` so the caller can navigate to the full feed.
 *
 * Width is intentionally indented from the pill below so the bar
 * sits over the pill's straight middle section, not the rounded ends.
 *
 * Renders nothing when there's no current track, so callers can drop
 * it in unconditionally.
 *
 * @module components/MiniPlayer
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedTrack } from '../providers/types';
import type { PlaybackTime } from '../types';

interface MiniPlayerProps {
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  togglePlay: () => void;
  onSkipNext?: () => void;
  /** Tapping the bar body (not the controls) fires this. Parents wire
   *  it to "navigate to the feed" — usually the most recent chat. */
  onExpand?: () => void;
  /** Current position + total duration. When total is 0 the seek bar
   *  is rendered inert (a thin idle line) since we have nothing to map
   *  the drag against yet. */
  playbackTime?: PlaybackTime;
  /** Seek to absolute seconds. Optional so the bar still works as a
   *  read-only progress indicator if the host doesn't expose seek. */
  onSeek?: (seconds: number) => void;
}

export const MiniPlayer = ({
  currentTrack,
  isPlaying,
  togglePlay,
  onSkipNext,
  onExpand,
  playbackTime,
  onSeek,
}: MiniPlayerProps): React.JSX.Element | null => {
  const { t } = useTranslation();
  // Drag-state for the seek thumb. Same pattern as ChatInterface's main
  // seek bar: we read the live position while not dragging, but pin to
  // the drag value while the user is actively scrubbing.
  const [seekDragging, setSeekDragging] = useState(false);
  const [seekDragValue, setSeekDragValue] = useState(0);
  const dragTrackIdRef = useRef<string | null>(null);

  if (!currentTrack) return null;

  const artwork = currentTrack.artworkUrl?.replace('{w}', '120').replace('{h}', '120');
  const total = playbackTime?.total ?? 0;
  const current = seekDragging ? seekDragValue : (playbackTime?.current ?? 0);
  const progressPct = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  return (
    // px-8 each side so the inner bar sits over the pill's straight
    // middle section (the pill's rounded-full corners eat ~h/2 ≈ 30px
    // on each end at the default pill height — see ChatInput).
    <div className="mb-2 mx-auto max-w-xl px-8">
      <div className="glass hairline rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 pl-2 pr-3 py-2">
          {/* Body — artwork + track info. Tappable to expand into the feed. */}
          <button
            type="button"
            onClick={onExpand}
            disabled={!onExpand}
            className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-xl -m-1 p-1 hover:bg-ink/5 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
            title={onExpand ? t('miniPlayer.openFeed') : undefined}
          >
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

            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium font-display text-ink truncate leading-tight">
                {currentTrack.name || t('miniPlayer.unknownTrack')}
              </div>
              <div className="text-[11px] text-ink-3 truncate leading-tight">
                {currentTrack.artist || t('miniPlayer.unknownArtist')}
              </div>
            </div>
          </button>

          {/* Controls — kept outside the expand button so taps here don't
              also fire onExpand. */}
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

        {/* Seek bar — hairline at the bottom edge. Interactive when
            `onSeek` is wired and the track has a known duration. */}
        <div className="relative h-1 bg-ink/10">
          <div
            className="absolute inset-y-0 left-0 bg-ink/70"
            style={{ width: `${progressPct}%` }}
          />
          {onSeek && total > 0 && (
            <input
              type="range"
              min={0}
              max={total}
              step={0.1}
              value={current}
              onPointerDown={() => { dragTrackIdRef.current = currentTrack.id; }}
              onChange={(e) => { setSeekDragging(true); setSeekDragValue(parseFloat(e.target.value)); }}
              onPointerUp={(e) => {
                // If the track changed mid-scrub, the intended time belongs
                // to a track that's no longer current — drop the seek.
                if (dragTrackIdRef.current === currentTrack.id) {
                  onSeek(parseFloat((e.target as HTMLInputElement).value));
                }
                dragTrackIdRef.current = null;
                setSeekDragging(false);
              }}
              aria-label={t('miniPlayer.seek')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          )}
        </div>
      </div>
    </div>
  );
};
