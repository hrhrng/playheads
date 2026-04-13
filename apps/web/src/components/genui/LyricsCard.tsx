/**
 * LyricsCard — large lyric quote with album art background.
 * Uses data-capture attribute so ShareableCard targets this region for screenshots.
 */
import { useState, useEffect } from 'react';
import { useStorefront } from './GenUIContext';
import { API_BASE } from '../../config/api';

interface LyricsCardProps {
  lyric: string;
  translation?: string;
  trackName: string;
  artist: string;
  trackId?: string;
  query?: string;
}

export function LyricsCard({ lyric, translation, trackName, artist, trackId, query }: LyricsCardProps) {
  const sf = useStorefront();
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);

  // Reset artwork when track changes
  useEffect(() => {
    setArtworkUrl(null);
  }, [trackId, query]);

  useEffect(() => {
    if (artworkUrl) return;
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        let url: string | undefined;
        if (trackId) {
          const res = await fetch(`${API_BASE}/apple-music/catalog/songs/${trackId}?storefront=${sf}`, { signal });
          if (res.ok) {
            const data = await res.json();
            url = data?.data?.[0]?.attributes?.artwork?.url;
          }
        } else if (query) {
          const res = await fetch(`${API_BASE}/apple-music/catalog/search?term=${encodeURIComponent(query)}&types=songs&storefront=${sf}&limit=1`, { signal });
          if (res.ok) {
            const data = await res.json();
            url = data?.results?.songs?.data?.[0]?.attributes?.artwork?.url;
          }
        }
        if (url && !signal.aborted) {
          setArtworkUrl(url.replace('{w}', '600').replace('{h}', '600'));
        }
      } catch { /* best effort */ }
    })();
    return () => { controller.abort(); };
  }, [trackId, query, sf, artworkUrl]);

  return (
    <div data-capture className="relative rounded-2xl overflow-hidden animate-genui-card-in" style={{ maxWidth: 480, aspectRatio: '9/16' }}>
      <div className="relative h-full flex flex-col justify-end p-6">
        {artworkUrl ? (
          <>
            <img src={artworkUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900" />
        )}

        <div className="relative z-10 space-y-3" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
          <p className="text-xl font-semibold text-white leading-relaxed whitespace-pre-line">
            {lyric}
          </p>
          {translation && (
            <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">
              {translation}
            </p>
          )}
          <div className="flex items-center gap-2 pt-2">
            <div className="w-[3px] h-8 bg-white/30 rounded-full" />
            <div>
              <p className="text-sm font-medium text-white/90">{trackName}</p>
              <p className="text-xs text-white/50">{artist}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
