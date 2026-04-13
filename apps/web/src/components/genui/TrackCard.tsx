/**
 * TrackCard — compact track row with small artwork and play/queue buttons.
 */
import { useState, useEffect } from 'react';
import { useGenUIActions, useStorefront } from './GenUIContext';
import { API_BASE } from '../../config/api';
import type { UnifiedTrack } from '../../providers/types';

const PLAY_AFTER_QUEUE_DELAY_MS = 300;

interface TrackCardProps {
  title: string;
  artist: string;
  album?: string;
  /** Real Apple Music track ID from search_music — preferred */
  trackId?: string;
  query?: string;
  artworkUrl?: string;
  songId?: string;
}

export function TrackCard({
  title, artist, album, artworkUrl: initialArtworkUrl, songId: initialSongId, trackId, query,
}: TrackCardProps) {
  const actions = useGenUIActions();
  const sf = useStorefront();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [enriched, setEnriched] = useState({ artworkUrl: initialArtworkUrl, songId: initialSongId || trackId });

  useEffect(() => {
    if (enriched.artworkUrl) return;

    const controller = new AbortController();
    const { signal } = controller;

    // If we have a trackId, fetch directly
    const id = trackId || enriched.songId;
    if (id) {
      (async () => {
        try {
          const res = await fetch(`${API_BASE}/apple-music/catalog/songs/${id}?storefront=${sf}`, { signal });
          if (!res.ok) return;
          const data = await res.json();
          const song = data?.data?.[0];
          if (!song) return;
          const attrs = song.attributes || {};
          const artworkUrl = ((attrs.artwork?.url || '') as string).replace('{w}', '300').replace('{h}', '300');
          if (!signal.aborted) setEnriched({ artworkUrl, songId: id });
        } catch (e) { if ((e as Error).name !== 'AbortError') console.warn('[GenUI] track lookup failed:', e); }
      })();
      return () => { controller.abort(); };
    }

    // Fallback: search by query
    if (!query) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/apple-music/catalog/search?term=${encodeURIComponent(query)}&types=songs&storefront=${sf}&limit=1`, { signal });
        if (!res.ok) return;
        const data = await res.json();
        const song = data?.results?.songs?.data?.[0];
        if (!song) return;
        const attrs = song.attributes || {};
        const artworkUrl = ((attrs.artwork?.url || '') as string).replace('{w}', '300').replace('{h}', '300');
        if (!signal.aborted) setEnriched({ artworkUrl, songId: song.id });
      } catch (e) { if ((e as Error).name !== 'AbortError') console.warn('[GenUI] track enrichment failed:', e); }
    })();
    return () => { controller.abort(); };
  }, [trackId, query, enriched.artworkUrl, sf]);

  const { artworkUrl, songId } = enriched;
  const canPlay = !!songId && !!actions;

  const buildTrack = (): UnifiedTrack => ({
    id: songId!, name: title, artist, album: album || '',
    artworkUrl: artworkUrl || '', durationSeconds: 0, provider: 'apple-music',
  });

  const handlePlay = () => {
    if (!songId || !actions) return;
    actions.addTrack(buildTrack());
    setTimeout(() => actions.skipNext().catch(console.error), PLAY_AFTER_QUEUE_DELAY_MS);
  };

  const handleQueue = () => {
    if (!songId || !actions) return;
    actions.addTrack(buildTrack());
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group animate-genui-slide-in">
      <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 shrink-0">
        {artworkUrl ? (
          <>
            {!imageLoaded && <div className="w-full h-full bg-gray-200 animate-pulse" />}
            <img src={artworkUrl} alt={title} className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setImageLoaded(true)} loading="lazy" />
          </>
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center animate-pulse">
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13" /></svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-800 truncate">{title}</p>
        <p className="text-[11px] text-gray-500 truncate">{artist}{album ? ` \u00b7 ${album}` : ''}</p>
      </div>
      {canPlay && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handlePlay} className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center hover:scale-110 transition-transform" title="Play">
            <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <button onClick={handleQueue} className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:scale-110 transition-transform" title="Add to queue">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
