/**
 * LyricsCard — large lyric quote with album art background.
 * Has its own Save Image button that captures only the lyrics area.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
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
  const captureRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleSave = useCallback(async () => {
    const el = captureRef.current;
    if (!el || isExporting) return;
    setIsExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#000000',
        logging: false,
      });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lyrics-${trackName}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (e) {
      console.error('[LyricsCard] Screenshot failed:', e);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, trackName]);

  return (
    <div className="animate-genui-card-in">
      {/* Capture region — only this part gets saved as image */}
      <div ref={captureRef} className="relative rounded-2xl overflow-hidden">
        <div className="relative min-h-[280px] flex flex-col justify-end p-6">
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

      {/* Save button — outside capture region */}
      <div className="flex justify-end mt-2 pr-1">
        <button
          onClick={handleSave}
          disabled={isExporting}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          {isExporting ? (
            <span className="animate-pulse">Saving...</span>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Save Image
            </>
          )}
        </button>
      </div>
    </div>
  );
}
