/**
 * ArtistSpotlight — artist profile card with bio and key info.
 * Auto-fetches artist image from Apple Music if not provided.
 */
import { useState, useEffect } from 'react';
import { useStorefront } from './GenUIContext';
import { API_BASE } from '../../config/api';

interface ArtistSpotlightProps {
  name: string;
  subtitle?: string;
  bio?: string;
  imageUrl?: string;
  stats?: { label: string; value: string }[];
}

export function ArtistSpotlight({ name, subtitle, bio, imageUrl: initialImageUrl, stats }: ArtistSpotlightProps) {
  const sf = useStorefront();
  const [imageUrl, setImageUrl] = useState(initialImageUrl);

  // Auto-fetch artist image from Apple Music if not provided
  useEffect(() => {
    if (imageUrl) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/apple-music/catalog/search?term=${encodeURIComponent(name)}&types=artists&storefront=${sf}&limit=1`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        const artist = data?.results?.artists?.data?.[0];
        const url = artist?.attributes?.artwork?.url;
        if (url && !controller.signal.aborted) {
          setImageUrl(url.replace('{w}', '600').replace('{h}', '600'));
        }
      } catch { /* best effort */ }
    })();
    return () => { controller.abort(); };
  }, [name, sf, imageUrl]);

  return (
    <div className="rounded-sheet overflow-hidden glass animate-genui-slide-in">
      {/* Header with image */}
      <div className="relative h-44 bg-chip-2">
        {imageUrl && (
          <img src={imageUrl} alt={name} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5">
          <h3 className="text-xl font-display font-semibold text-white">{name}</h3>
          {subtitle && <p className="text-sm text-white/70 mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Stats row */}
      {stats && stats.length > 0 && (
        <div className="flex divide-x divide-rule hairline-b">
          {stats.map((stat, i) => (
            <div key={i} className="flex-1 py-3 px-4 text-center">
              <p className="text-lg font-display font-semibold text-ink tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-ink-3 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bio */}
      {bio && (
        <div className="p-4">
          <p className="text-[13px] font-display text-ink-2 leading-relaxed">{bio}</p>
        </div>
      )}
    </div>
  );
}
