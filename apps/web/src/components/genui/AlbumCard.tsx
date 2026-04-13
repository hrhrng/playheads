/**
 * AlbumCard — compact album cover with smooth expand-to-tracklist.
 *
 * Tap to smoothly expand tracklist below the card using CSS grid-rows animation.
 * Always renders both states — CSS handles the transition.
 */
import { useState, useEffect, useCallback } from 'react';
import { useGenUIActions, useStorefront, usePlayTrackById } from './GenUIContext';
import { API_BASE } from '../../config/api';
import type { UnifiedTrack } from '../../providers/types';

const PLAY_AFTER_QUEUE_DELAY_MS = 300;

export interface AlbumCardProps {
  title: string;
  subtitle: string;
  /** Real Apple Music track ID from search_music — preferred */
  trackId?: string;
  query?: string;
  year?: string;
  artworkUrl?: string;
  songId?: string;
  albumId?: string;
}

export interface EnrichedAlbumData {
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

/**
 * Hook for client-side Apple Music enrichment.
 * Priority: trackId (direct lookup) > query (album search fallback).
 */
export function useAlbumEnrichment(opts: { trackId?: string; query?: string; initial?: EnrichedAlbumData; storefront?: string }) {
  const { trackId, query, initial, storefront = 'us' } = opts;
  const [enriched, setEnriched] = useState<EnrichedAlbumData>({
    artworkUrl: initial?.artworkUrl,
    songId: initial?.songId || trackId,
    albumId: initial?.albumId,
  });

  useEffect(() => {
    if (enriched.artworkUrl) return;

    // If we have a trackId, fetch the track directly (no search needed)
    if (trackId) {
      const controller = new AbortController();
      const { signal } = controller;
      (async () => {
        try {
          const res = await fetch(
            `${API_BASE}/apple-music/catalog/songs/${trackId}?storefront=${storefront}`,
            { signal },
          );
          if (!res.ok) return;
          const data = await res.json();
          const song = data?.data?.[0];
          if (!song) return;
          const attrs = song.attributes || {};
          const artwork = attrs.artwork || {};
          const artworkUrl = (artwork.url || '').replace('{w}', '300').replace('{h}', '300');
          // Extract real album ID from song's relationships
          const realAlbumId = song.relationships?.albums?.data?.[0]?.id;
          if (!signal.aborted) setEnriched({
            artworkUrl,
            songId: trackId,
            albumId: realAlbumId || undefined,
          });
        } catch (e) {
          if ((e as Error).name !== 'AbortError') console.warn('[GenUI] track lookup failed:', e);
        }
      })();
      return () => { controller.abort(); };
    }

    // Fallback: search by query
    if (!query) return;
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/apple-music/catalog/search?term=${encodeURIComponent(query)}&types=albums&storefront=${storefront}&limit=1`,
          { signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        const album = data?.results?.albums?.data?.[0];
        if (!album) return;
        const attrs = album.attributes || {};
        const artwork = attrs.artwork || {};
        const artworkUrl = (artwork.url || '').replace('{w}', '300').replace('{h}', '300');
        const songId = album?.relationships?.tracks?.data?.[0]?.id;
        if (!signal.aborted) setEnriched({ artworkUrl, albumId: album.id, songId });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.warn('[GenUI] enrichment failed:', e);
      }
    })();
    return () => { controller.abort(); };
  }, [trackId, query, enriched.artworkUrl, storefront]);

  return enriched;
}

export function AlbumCard({
  title, subtitle, trackId, query, year, artworkUrl: initialArtworkUrl,
  songId: initialSongId, albumId: initialAlbumId,
}: AlbumCardProps) {
  const actions = useGenUIActions();
  const playById = usePlayTrackById();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const sf = useStorefront();
  const enriched = useAlbumEnrichment({
    trackId, query, storefront: sf,
    initial: { artworkUrl: initialArtworkUrl, songId: initialSongId || trackId, albumId: initialAlbumId },
  });
  const { artworkUrl, songId, albumId } = enriched;
  const canPlay = !!songId && !!actions;

  // Fetch tracklist on first expand
  const fetchTracks = useCallback(async () => {
    if (!albumId || tracks.length > 0 || loadingTracks) return;
    setLoadingTracks(true);
    try {
      const res = await fetch(`${API_BASE}/apple-music/catalog/albums/${albumId}?storefront=${sf}`);
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

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) fetchTracks();
  };

  const handlePlay = (e: React.MouseEvent, tid?: string) => {
    e.stopPropagation();
    const id = tid || songId;
    if (!id) return;
    if (playById) {
      playById(id).catch(console.error);
    } else if (actions) {
      actions.addTrack({
        id, name: title, artist: subtitle, album: title,
        artworkUrl: artworkUrl || '', durationSeconds: 0, provider: 'apple-music',
      });
      setTimeout(() => actions.skipNext().catch(console.error), PLAY_AFTER_QUEUE_DELAY_MS);
    }
  };

  /** Play entire album: fetch all tracks → play first + add rest to queue */
  const handlePlayAlbum = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!albumId || !actions) return;
    try {
      const res = await fetch(`${API_BASE}/apple-music/catalog/albums/${albumId}?storefront=${sf}`);
      if (!res.ok) return;
      const data = await res.json();
      const albumTracks = data?.data?.[0]?.relationships?.tracks?.data || [];
      if (albumTracks.length === 0) return;
      // Batch add all tracks in one MusicKit call
      const tracks = albumTracks.map((t: any) => {
        const attrs = t.attributes || {};
        return {
          id: t.id, name: attrs.name || 'Unknown', artist: attrs.artistName || subtitle, album: title,
          artworkUrl: artworkUrl || '', durationSeconds: (attrs.durationInMillis || 0) / 1000, provider: 'apple-music' as const,
        };
      });
      // Insert at head of queue and start playing
      await actions.playTracks(tracks);
    } catch (err) {
      console.error('[GenUI] play album failed:', err);
    }
  };

  /** Add entire album to queue */
  const handleQueueAlbum = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!albumId || !actions) return;
    try {
      const res = await fetch(`${API_BASE}/apple-music/catalog/albums/${albumId}?storefront=${sf}`);
      if (!res.ok) return;
      const data = await res.json();
      const albumTracks = data?.data?.[0]?.relationships?.tracks?.data || [];
      if (albumTracks.length === 0) return;
      const tracks = albumTracks.map((t: any) => {
        const attrs = t.attributes || {};
        return {
          id: t.id, name: attrs.name || 'Unknown', artist: attrs.artistName || subtitle, album: title,
          artworkUrl: artworkUrl || '', durationSeconds: (attrs.durationInMillis || 0) / 1000, provider: 'apple-music' as const,
        };
      });
      actions.addTracks(tracks);
    } catch (err) {
      console.error('[GenUI] queue album failed:', err);
    }
  };

  const handleQueue = (e: React.MouseEvent, trackId: string, trackName: string) => {
    e.stopPropagation();
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
    <div className={`animate-genui-card-in transition-[width] duration-300 ease-out ${expanded ? 'w-full' : 'w-[130px] shrink-0'}`}>
      {/* Header — always visible */}
      <div
        className={`cursor-pointer ${expanded ? 'flex items-start gap-3 rounded-lg hover:bg-gray-50 p-1.5 -m-1.5 transition-colors' : ''}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={handleToggle}
      >
        {/* Artwork — fixed sizes, no aspect-ratio transition */}
        <div
          className="relative rounded-xl overflow-hidden bg-gray-100 shadow-sm shrink-0 transition-[width,height] duration-300 ease-out"
          style={{ width: expanded ? 56 : 130, height: expanded ? 56 : 130 }}
        >
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
          {/* Hover overlay — play album + add to queue */}
          {(canPlay || albumId) && !expanded && (
            <div className={`absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center gap-2 transition-opacity duration-200 ${hovering ? 'opacity-100' : 'opacity-0'}`}>
              <button onClick={handlePlayAlbum} className="w-9 h-9 rounded-full bg-white text-gray-900 flex items-center justify-center hover:scale-110 transition-transform shadow-md" title="Play album">
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button onClick={handleQueueAlbum} className="w-8 h-8 rounded-full bg-white/80 text-gray-700 flex items-center justify-center hover:scale-110 transition-transform shadow-md" title="Add album to queue">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          )}
        </div>

        {/* Info text */}
        <div className={expanded ? 'flex-1 min-w-0 py-0.5' : 'mt-2 px-0.5'}>
          <p className={`font-medium text-gray-800 leading-tight line-clamp-2 ${expanded ? 'text-[13px] line-clamp-1' : 'text-[12px]'}`}>{title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{subtitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {year && <span className="text-[10px] text-gray-400">{year}</span>}
            {expanded && tracks.length > 0 && <span className="text-[10px] text-gray-400">{tracks.length} tracks</span>}
          </div>
        </div>

        {/* Chevron — only when expanded */}
        {expanded && (
          <svg className="w-4 h-4 text-gray-400 mt-1 rotate-180 transition-transform shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {/* Tracklist — animated expand/collapse via grid-rows */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          {(expanded || tracks.length > 0) && (
            <div className="pt-2 ml-1 border-l-2 border-gray-100 pl-3 space-y-0">
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
                        onClick={(e) => handlePlay(e, track.id)}
                        className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center hover:scale-110 transition-transform"
                        title="Play"
                      >
                        <svg className="w-2.5 h-2.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                      <button
                        onClick={(e) => handleQueue(e, track.id, track.name)}
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
      </div>
    </div>
  );
}
