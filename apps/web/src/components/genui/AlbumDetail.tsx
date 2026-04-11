/**
 * AlbumDetail — album card with expandable tracklist.
 *
 * Standalone reusable component. Shows album cover + info, tap to expand
 * and reveal the full tracklist with play/queue buttons per track.
 * Used in GenUI timelines, grids, and anywhere else.
 */
import { useState, useCallback, useEffect } from 'react';
import { useGenUIActions } from './GenUIContext';
import { useAlbumEnrichment, type EnrichedAlbumData } from './AlbumCard';
import { API_BASE } from '../../config/api';

const PLAY_AFTER_QUEUE_DELAY_MS = 300;

export interface AlbumDetailProps {
  title: string;
  subtitle: string;
  query?: string;
  year?: string;
  artworkUrl?: string;
  songId?: string;
  albumId?: string;
  /** Callback to collapse back to AlbumCard (when used inline) */
  onCollapse?: () => void;
}

interface TrackItem {
  id: string;
  name: string;
  trackNumber: number;
  durationMs: number;
}

export function AlbumDetail({
  title, subtitle, query, year,
  artworkUrl: initialArtworkUrl, songId: initialSongId, albumId: initialAlbumId,
  onCollapse,
}: AlbumDetailProps) {
  const actions = useGenUIActions();
  const [imageLoaded, setImageLoaded] = useState(false);
  // Start expanded when used inline from AlbumCard (onCollapse is set)
  const [expanded, setExpanded] = useState(!!onCollapse);
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const enriched = useAlbumEnrichment(query, {
    artworkUrl: initialArtworkUrl, songId: initialSongId, albumId: initialAlbumId,
  });

  const { artworkUrl, albumId } = enriched;

  // Fetch tracklist on first expand
  const fetchTracks = useCallback(async () => {
    if (!albumId || tracks.length > 0 || loadingTracks) return;
    setLoadingTracks(true);
    try {
      const res = await fetch(`${API_BASE}/apple-music/catalog/albums/${albumId}?storefront=us`);
      if (!res.ok) return;
      const data = await res.json();
      const trackList = data?.data?.[0]?.relationships?.tracks?.data || [];
      setTracks(trackList.map((t: any) => ({
        id: t.id,
        name: t.attributes?.name || 'Unknown',
        trackNumber: t.attributes?.trackNumber || 0,
        durationMs: t.attributes?.durationInMillis || 0,
      })));
    } catch (e) {
      console.warn('[GenUI] tracklist fetch failed:', e);
    } finally {
      setLoadingTracks(false);
    }
  }, [albumId, tracks.length, loadingTracks]);

  // Auto-fetch when starting expanded
  useEffect(() => {
    if (expanded && tracks.length === 0 && !loadingTracks) fetchTracks();
  }, [expanded]);

  const handleToggle = () => {
    const next = !expanded;
    if (!next && onCollapse) { onCollapse(); return; }
    setExpanded(next);
    if (next) fetchTracks();
  };

  const playTrack = (trackId: string, trackName: string) => {
    if (!actions) return;
    actions.addTrack({
      id: trackId, name: trackName, artist: subtitle, album: title,
      artworkUrl: artworkUrl || '', durationSeconds: 0, provider: 'apple-music',
    });
    setTimeout(() => actions.skipNext().catch(console.error), PLAY_AFTER_QUEUE_DELAY_MS);
  };

  const queueTrack = (trackId: string, trackName: string) => {
    if (!actions) return;
    actions.addTrack({
      id: trackId, name: trackName, artist: subtitle, album: title,
      artworkUrl: artworkUrl || '', durationSeconds: 0, provider: 'apple-music',
    });
  };

  const formatDuration = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="animate-genui-card-in">
      {/* Header — always visible */}
      <div
        className="flex items-start gap-3 cursor-pointer rounded-lg hover:bg-gray-50 p-1.5 -m-1.5 transition-colors"
        onClick={handleToggle}
      >
        {/* Artwork */}
        <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shadow-sm shrink-0">
          {artworkUrl ? (
            <>
              {!imageLoaded && <div className="w-full h-full bg-gray-200 animate-pulse" />}
              <img
                src={artworkUrl}
                alt={`${title} by ${subtitle}`}
                className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImageLoaded(true)}
                loading="lazy"
              />
            </>
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center animate-pulse">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 10l12-3" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-[13px] font-medium text-gray-800 leading-tight line-clamp-1">{title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {year && <span className="text-[10px] text-gray-400">{year}</span>}
            {tracks.length > 0 && <span className="text-[10px] text-gray-400">{tracks.length} tracks</span>}
          </div>
        </div>

        {/* Chevron */}
        <svg className={`w-4 h-4 text-gray-400 mt-1 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded tracklist */}
      {expanded && (
        <div className="mt-2 ml-[4.25rem] border-l-2 border-gray-100 pl-3 space-y-0 animate-genui-slide-in">
          {loadingTracks && (
            <div className="py-3 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-3 w-32 bg-gray-100 rounded animate-pulse" />)}
            </div>
          )}
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-gray-50 group/track transition-colors"
            >
              <span className="text-[10px] text-gray-400 w-4 text-right tabular-nums shrink-0">
                {track.trackNumber}
              </span>
              <span className="text-[12px] text-gray-700 flex-1 min-w-0 truncate">
                {track.name}
              </span>
              <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                {formatDuration(track.durationMs)}
              </span>
              {actions && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); playTrack(track.id, track.name); }}
                    className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center hover:scale-110 transition-transform"
                    title="Play"
                  >
                    <svg className="w-2.5 h-2.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); queueTrack(track.id, track.name); }}
                    className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:scale-110 transition-transform"
                    title="Add to queue"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
