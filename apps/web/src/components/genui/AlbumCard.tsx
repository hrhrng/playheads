/**
 * AlbumCard — compact album cover card.
 *
 * Tap to expand into AlbumDetail (tracklist). Hover reveals play button.
 * Client-side enrichment via Apple Music for artwork.
 */
import { useState, useEffect } from 'react';
import { useGenUIActions } from './GenUIContext';
import { AlbumDetail } from './AlbumDetail';
import { API_BASE } from '../../config/api';
import type { UnifiedTrack } from '../../providers/types';

const PLAY_AFTER_QUEUE_DELAY_MS = 300;

export interface AlbumCardProps {
  title: string;
  subtitle: string;
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

/** Hook for client-side Apple Music enrichment. Reused by AlbumDetail. */
export function useAlbumEnrichment(query?: string, initial?: EnrichedAlbumData) {
  const [enriched, setEnriched] = useState<EnrichedAlbumData>({
    artworkUrl: initial?.artworkUrl,
    songId: initial?.songId,
    albumId: initial?.albumId,
  });

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
        const songId = album?.relationships?.tracks?.data?.[0]?.id;
        if (!signal.aborted) setEnriched({ artworkUrl, albumId: album.id, songId });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.warn('[GenUI] enrichment failed:', e);
      }
    })();
    return () => { controller.abort(); };
  }, [query, enriched.artworkUrl]);

  return enriched;
}

export function AlbumCard({
  title, subtitle, query, year, artworkUrl: initialArtworkUrl,
  songId: initialSongId, albumId: initialAlbumId,
}: AlbumCardProps) {
  const actions = useGenUIActions();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const enriched = useAlbumEnrichment(query, {
    artworkUrl: initialArtworkUrl, songId: initialSongId, albumId: initialAlbumId,
  });

  const { artworkUrl, songId } = enriched;
  const canPlay = !!songId && !!actions;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!songId || !actions) return;
    actions.addTrack({
      id: songId, name: title, artist: subtitle, album: title,
      artworkUrl: artworkUrl || '', durationSeconds: 0, provider: 'apple-music',
    });
    setTimeout(() => actions.skipNext().catch(console.error), PLAY_AFTER_QUEUE_DELAY_MS);
  };

  // Expanded → show AlbumDetail
  if (expanded) {
    return (
      <div className="animate-genui-slide-in">
        <AlbumDetail
          title={title}
          subtitle={subtitle}
          query={query}
          year={year}
          artworkUrl={enriched.artworkUrl}
          songId={enriched.songId}
          albumId={enriched.albumId}
          onCollapse={() => setExpanded(false)}
        />
      </div>
    );
  }

  // Collapsed → compact card
  return (
    <div
      className="group relative w-[130px] shrink-0 animate-genui-card-in cursor-pointer"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => setExpanded(true)}
    >
      <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-sm">
        {artworkUrl ? (
          <>
            {!imageLoaded && <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-xl" />}
            <img
              src={artworkUrl}
              alt={`${title} by ${subtitle}`}
              className={`w-full h-full object-cover transition-transform duration-300 ${hovering ? 'scale-105' : 'scale-100'} ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
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
        {canPlay && (
          <div className={`absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center transition-opacity duration-200 ${hovering ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={handlePlay} className="w-9 h-9 rounded-full bg-white text-gray-900 flex items-center justify-center hover:scale-110 transition-transform shadow-md" title="Play">
              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-[12px] font-medium text-gray-800 leading-tight line-clamp-2">{title}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{subtitle}</p>
        {year && <p className="text-[10px] text-gray-400 mt-0.5">{year}</p>}
      </div>
    </div>
  );
}
