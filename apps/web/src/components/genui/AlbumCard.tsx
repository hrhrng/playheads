/**
 * AlbumCard — album artwork card with expandable tracklist.
 *
 * Tap album to expand and show tracks. Each track can be played or queued.
 * Client-side enrichment via Apple Music for artwork + tracklist.
 */
import { useState, useEffect, useCallback } from 'react';
import { useGenUIActions } from './GenUIContext';
import { API_BASE } from '../../config/api';
import type { UnifiedTrack } from '../../providers/types';

const PLAY_AFTER_QUEUE_DELAY_MS = 300;

interface AlbumCardProps {
  type?: string;
  title: string;
  subtitle: string;
  query?: string;
  year?: string;
  artworkUrl?: string;
  songId?: string;
  albumId?: string;
}

interface TrackItem {
  id: string;
  name: string;
  trackNumber: number;
  durationMs: number;
}

interface EnrichedData {
  artworkUrl?: string;
  songId?: string;
  albumId?: string;
}

export function AlbumCard({
  title, subtitle, artworkUrl: initialArtworkUrl, songId: initialSongId,
  albumId: initialAlbumId, query, year,
}: AlbumCardProps) {
  const actions = useGenUIActions();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [enriched, setEnriched] = useState<EnrichedData>({
    artworkUrl: initialArtworkUrl,
    songId: initialSongId,
    albumId: initialAlbumId,
  });

  // Client-side enrichment: fetch album artwork + first song ID
  useEffect(() => {
    if (enriched.artworkUrl || !query) return;
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/apple-music/catalog/search?term=${encodeURIComponent(query)}&types=albums&storefront=us&limit=1`,
          { signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        const album = data?.results?.albums?.data?.[0];
        if (!album) return;
        const attrs = album.attributes || {};
        const artwork = attrs.artwork || {};
        const artworkUrl = (artwork.url || '').replace('{w}', '300').replace('{h}', '300');
        let songId: string | undefined;
        try {
          const tracksData = album?.relationships?.tracks?.data;
          songId = tracksData?.[0]?.id;
        } catch { /* best effort */ }
        if (!signal.aborted) setEnriched({ artworkUrl, albumId: album.id, songId });
      } catch (e) { if ((e as Error).name !== 'AbortError') console.warn('[GenUI] enrichment failed:', e); }
    })();
    return () => { controller.abort(); };
  }, [query, enriched.artworkUrl]);

  // Fetch tracklist when expanded
  const fetchTracks = useCallback(async () => {
    const albumId = enriched.albumId;
    if (!albumId || tracks.length > 0 || loadingTracks) return;
    setLoadingTracks(true);
    try {
      const res = await fetch(`${API_BASE}/apple-music/catalog/albums/${albumId}?storefront=us`);
      if (!res.ok) return;
      const data = await res.json();
      const albumData = data?.data?.[0];
      const trackList = albumData?.relationships?.tracks?.data || [];
      setTracks(trackList.map((t: any) => ({
        id: t.id,
        name: t.attributes?.name || 'Unknown',
        trackNumber: t.attributes?.trackNumber || 0,
        durationMs: t.attributes?.durationInMillis || 0,
      })));
      // Also set first songId if we didn't have it
      if (!enriched.songId && trackList[0]?.id) {
        setEnriched(prev => ({ ...prev, songId: trackList[0].id }));
      }
    } catch (e) {
      console.warn('[GenUI] tracklist fetch failed:', e);
    } finally {
      setLoadingTracks(false);
    }
  }, [enriched.albumId, enriched.songId, tracks.length, loadingTracks]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) fetchTracks();
  };

  const artworkUrl = enriched.artworkUrl;
  const songId = enriched.songId;
  const canPlay = !!songId && !!actions;

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
      {/* Album card — compact */}
      <div
        className={`group relative w-[130px] shrink-0 cursor-pointer ${expanded ? 'w-full max-w-xs' : ''}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={handleExpand}
      >
        <div className={`flex ${expanded ? 'flex-row gap-3 items-start' : 'flex-col'}`}>
          {/* Artwork */}
          <div className={`relative rounded-xl overflow-hidden bg-gray-100 shadow-sm shrink-0 ${expanded ? 'w-16 h-16' : 'aspect-square w-full'}`}>
            {artworkUrl ? (
              <>
                {!imageLoaded && <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-xl" />}
                <img
                  src={artworkUrl}
                  alt={`${title} by ${subtitle}`}
                  className={`w-full h-full object-cover transition-transform duration-300 ${!expanded && hovering ? 'scale-105' : 'scale-100'} ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setImageLoaded(true)}
                  loading="lazy"
                />
              </>
            ) : (
              <div className="w-full h-full bg-gray-100 flex items-center justify-center animate-pulse">
                <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 10l12-3" />
                </svg>
              </div>
            )}
            {/* Play overlay (only when collapsed) */}
            {canPlay && !expanded && (
              <div className={`absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center gap-2 transition-opacity duration-200 ${hovering ? 'opacity-100' : 'opacity-0'}`}>
                <button onClick={(e) => { e.stopPropagation(); playTrack(songId!, title); }} className="w-9 h-9 rounded-full bg-white text-gray-900 flex items-center justify-center hover:scale-110 transition-transform shadow-md" title="Play album">
                  <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </button>
              </div>
            )}
          </div>

          {/* Info */}
          <div className={expanded ? 'flex-1 min-w-0 py-0.5' : 'mt-2 px-0.5'}>
            <p className="text-[12px] font-medium text-gray-800 leading-tight line-clamp-2">{title}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{subtitle}</p>
            {year && <p className="text-[10px] text-gray-400 mt-0.5">{year}</p>}
            {expanded && tracks.length > 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5">{tracks.length} tracks</p>
            )}
          </div>

          {/* Expand chevron */}
          <div className="flex items-center">
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded tracklist */}
      {expanded && (
        <div className="mt-2 ml-1 border-l-2 border-gray-100 pl-3 space-y-0.5 animate-genui-slide-in">
          {loadingTracks && (
            <div className="py-2">
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
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
