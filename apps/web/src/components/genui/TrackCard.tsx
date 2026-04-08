/**
 * TrackCard — compact track row with small artwork and play button.
 * Supports client-side enrichment for streaming GenUI.
 */
import { useState, useEffect } from 'react';
import { useGenUIActions } from './GenUIContext';
import { API_BASE } from '../../config/api';
import type { TrackCardNode } from '../../types/genui';

interface EnrichedData {
  artworkUrl?: string;
  songId?: string;
}

export function TrackCard({
  title,
  artist,
  album,
  artworkUrl: initialArtworkUrl,
  songId: initialSongId,
  query,
}: TrackCardNode) {
  const actions = useGenUIActions();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [enriched, setEnriched] = useState<EnrichedData>({
    artworkUrl: initialArtworkUrl,
    songId: initialSongId,
  });

  // Client-side enrichment
  useEffect(() => {
    if (enriched.artworkUrl || !query) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/apple-music/catalog/search?term=${encodeURIComponent(query)}&types=songs&storefront=us&limit=1`
        );
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const song = data?.results?.songs?.data?.[0];
        if (!song || cancelled) return;

        const attrs = song.attributes || {};
        const artwork = attrs.artwork || {};
        const artworkUrl = (artwork.url || '')
          .replace('{w}', '300')
          .replace('{h}', '300');

        if (!cancelled) {
          setEnriched({ artworkUrl, songId: song.id });
        }
      } catch { /* best effort */ }
    })();

    return () => { cancelled = true; };
  }, [query, enriched.artworkUrl]);

  const artworkUrl = enriched.artworkUrl;
  const songId = enriched.songId;
  const canPlay = !!songId && !!actions;

  const handlePlay = () => {
    if (!songId || !actions) return;
    actions.addTrack({
      id: songId,
      name: title,
      artist,
      album: album || '',
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
      artist,
      album: album || '',
      artworkUrl: artworkUrl || '',
      durationSeconds: 0,
      provider: 'apple-music',
    });
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group animate-genui-slide-in">
      {/* Small artwork */}
      <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 shrink-0">
        {artworkUrl ? (
          <>
            {!imageLoaded && <div className="w-full h-full bg-gray-200 animate-pulse" />}
            <img
              src={artworkUrl}
              alt={title}
              className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              loading="lazy"
            />
          </>
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center animate-pulse">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-800 truncate">{title}</p>
        <p className="text-[11px] text-gray-500 truncate">{artist}{album ? ` \u00b7 ${album}` : ''}</p>
      </div>

      {/* Actions */}
      {canPlay && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handlePlay}
            className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center hover:scale-110 transition-transform"
            title="Play"
          >
            <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            onClick={handleQueue}
            className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:scale-110 transition-transform"
            title="Add to queue"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
