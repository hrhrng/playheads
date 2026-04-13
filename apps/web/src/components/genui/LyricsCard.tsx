/**
 * LyricsCard — lyric quote with album art background.
 * Receives lyrics as an array of lines.
 */
import { useState, useEffect } from 'react';
import { useStorefront } from './GenUIContext';
import { API_BASE } from '../../config/api';

interface LyricsCardProps {
  lines: string[];
  trackName: string;
  artist: string;
  trackId?: string;
  query?: string;
}

export function LyricsCard({ lines, trackName, artist, trackId, query }: LyricsCardProps) {
  const sf = useStorefront();
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);

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
    <div data-capture className="relative rounded-2xl overflow-hidden animate-genui-card-in" style={{ width: 400 }}>
      {/* Album art — fills entire card */}
      {artworkUrl ? (
        <img src={artworkUrl} alt="" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-gradient-to-br from-gray-700 to-gray-900" />
      )}
      {/* Gradient overlay on bottom half */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Lyrics floating at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-5 space-y-3" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
        <div className="space-y-1">
          {lines.map((line, i) => (
            <p key={i} className="text-[17px] font-semibold text-white leading-snug">{line}</p>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="w-[3px] h-7 bg-white/30 rounded-full" />
          <div>
            <p className="text-[13px] font-medium text-white/90">{trackName}</p>
            <p className="text-[11px] text-white/50">{artist}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
