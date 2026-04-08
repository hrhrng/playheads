/**
 * AlbumCard — album artwork with title, artist, and play/queue action buttons.
 *
 * Supports client-side enrichment: if `query` is present but `artworkUrl`/`songId`
 * are missing, the card lazily fetches Apple Music data. This enables a streaming
 * GenUI feel — cards render instantly with placeholders, then artwork loads in.
 */
import { useState, useEffect } from 'react';
import { useGenUIActions } from './GenUIContext';
import { API_BASE } from '../../config/api';
import type { AlbumCardNode } from '../../types/genui';

interface EnrichedData {
  artworkUrl?: string;
  songId?: string;
  albumId?: string;
}

export function AlbumCard({
  title,
  subtitle,
  artworkUrl: initialArtworkUrl,
  songId: initialSongId,
  albumId: initialAlbumId,
  query,
  year,
}: AlbumCardNode) {
  const actions = useGenUIActions();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [enriched, setEnriched] = useState<EnrichedData>({
    artworkUrl: initialArtworkUrl,
    songId: initialSongId,
    albumId: initialAlbumId,
  });

  // Client-side enrichment: fetch Apple Music data if missing
  useEffect(() => {
    if (enriched.artworkUrl || !query) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/apple-music/catalog/search?term=${encodeURIComponent(query)}&types=albums&storefront=us&limit=1`
        );
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const album = data?.results?.albums?.data?.[0];
        if (!album || cancelled) return;

        const attrs = album.attributes || {};
        const artwork = attrs.artwork || {};
        const artworkUrl = (artwork.url || '')
          .replace('{w}', '300')
          .replace('{h}', '300');

        // Also try to get first track for playback
        let songId: string | undefined;
        try {
          const tracksRes = await fetch(
            `${API_BASE}/apple-music/catalog/albums/${album.id}?storefront=us`
          );
          if (tracksRes.ok) {
            const albumData = await tracksRes.json();
            const tracks = albumData?.data?.[0]?.relationships?.tracks?.data;
            songId = tracks?.[0]?.id;
          }
        } catch { /* best effort */ }

        if (!cancelled) {
          setEnriched({ artworkUrl, albumId: album.id, songId });
        }
      } catch {
        // Enrichment is best-effort
      }
    })();

    return () => { cancelled = true; };
  }, [query, enriched.artworkUrl]);

  const artworkUrl = enriched.artworkUrl;
  const songId = enriched.songId;
  const canPlay = !!songId && !!actions;

  const handlePlay = async () => {
    if (!songId || !actions) return;
    actions.addTrack({
      id: songId,
      name: title,
      artist: subtitle,
      album: title,
      artworkUrl: artworkUrl || '',
      durationSeconds: 0,
      provider: 'apple-music',
    });
    setTimeout(() => {
      actions.skipNext().catch(console.error);
    }, 300);
  };

  const handleQueue = () => {
    if (!songId || !actions) return;
    actions.addTrack({
      id: songId,
      name: title,
      artist: subtitle,
      album: title,
      artworkUrl: artworkUrl || '',
      durationSeconds: 0,
      provider: 'apple-music',
    });
  };

  return (
    <div
      className="group relative w-[140px] shrink-0 animate-genui-card-in"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Artwork */}
      <div className="relative aspect-square rounded-xl overflow-hidden shadow-lg bg-gray-100">
        {artworkUrl ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-xl" />
            )}
            <img
              src={artworkUrl}
              alt={`${title} by ${subtitle}`}
              className={`w-full h-full object-cover transition-transform duration-300 ${
                hovering ? 'scale-105' : 'scale-100'
              } ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              loading="lazy"
            />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 10l12-3" />
            </svg>
          </div>
        )}

        {/* Hover overlay with action buttons */}
        {canPlay && (
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center gap-2 transition-opacity duration-200 ${
              hovering ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <button
              onClick={handlePlay}
              className="w-9 h-9 rounded-full bg-white text-gray-900 flex items-center justify-center hover:scale-110 transition-transform shadow-md"
              title="Play now"
            >
              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <button
              onClick={handleQueue}
              className="w-9 h-9 rounded-full bg-white/80 text-gray-700 flex items-center justify-center hover:scale-110 transition-transform shadow-md"
              title="Add to queue"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Text */}
      <div className="mt-2 px-0.5">
        <p className="text-[13px] font-medium text-gray-800 leading-tight line-clamp-2">{title}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{subtitle}</p>
        {year && <p className="text-[10px] text-gray-400 mt-0.5">{year}</p>}
      </div>
    </div>
  );
}
