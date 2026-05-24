/**
 * PlaylistView — third form for `type: 'playlist'` conversations.
 *
 * Playlists never carry chat messages (the gateway creates them with
 * `messageCount: 0` and there's no path to add messages), so this view
 * makes the tracks themselves the hero instead of forcing them into a
 * tab on a chat layout. Clicking "Chat about this" forks a fresh
 * `type='chat'` session, seeded with this playlist's tracks via
 * `seed_playlist_id` so the AI sees them on turn 1.
 *
 * @module components/PlaylistView
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';
import type { Conversation } from '../types';

interface PlaylistViewProps {
  conversation: Conversation;
  userId: string | null;
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  onPlayTracks: (tracks: UnifiedTrack[]) => void;
  onAddTracks: (tracks: UnifiedTrack[]) => void;
  onSessionCreated?: () => void;
}

export const PlaylistView = ({
  conversation,
  userId,
  currentTrack,
  isPlaying,
  onPlayTracks,
  onAddTracks,
  onSessionCreated,
}: PlaylistViewProps): React.JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<UnifiedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);

  // Fetch the playlist's tracks. `conversations` in props only carries
  // metadata (title, playlist_count, playlist_cover); the actual tracks
  // live on /api/conversations/{id}.
  useEffect(() => {
    if (!conversation.id || !userId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/conversations/${conversation.id}?user_id=${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { playlist?: UnifiedTrack[] } | null) => {
        if (cancelled) return;
        setTracks((data?.playlist ?? []).filter((tr): tr is UnifiedTrack => !!tr?.id));
      })
      .catch((e) => console.warn('[PlaylistView] fetch failed:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conversation.id, userId]);

  const cover = useMemo(() => {
    const url = tracks[0]?.artworkUrl ?? conversation.playlist_cover;
    if (!url) return null;
    return url.replace('{w}', '600').replace('{h}', '600');
  }, [tracks, conversation.playlist_cover]);

  const handleFork = async () => {
    if (!userId || forking) return;
    setForking(true);
    try {
      const res = await fetch(`${API_BASE}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, seed_playlist_id: conversation.id }),
      });
      if (!res.ok) throw new Error(`session/create ${res.status}`);
      const { session_id } = (await res.json()) as { session_id: string };
      onSessionCreated?.();
      navigate(`/chat/${session_id}`, { replace: false });
    } catch (e) {
      console.error('[PlaylistView] fork chat failed:', e);
      setForking(false);
    }
  };

  const title = conversation.title?.trim() || 'Untitled Playlist';
  const trackCount = tracks.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-32">
        {/* Hero */}
        <div className="flex flex-col items-center text-center mb-10">
          {/* Cover — large, square, with subtle ring; placeholder if empty */}
          <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl overflow-hidden bg-chip hairline mb-6 shadow-xl">
            {cover ? (
              <img src={cover} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-20 h-20 text-ink-4" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
            )}
          </div>

          {/* Title (the "topic" — large, hero) */}
          <h1 className="text-3xl sm:text-4xl font-display font-semibold text-ink tracking-tight leading-tight">
            {title}
          </h1>
          <div className="mt-2 text-[12px] text-ink-3 uppercase tracking-[0.18em]">
            {t('playlist.tracksCount', { count: trackCount })}
          </div>

          {/* Actions — Play All / Add All / Chat */}
          <div className="mt-7 flex items-center gap-2 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => onPlayTracks(tracks)}
              disabled={trackCount === 0}
              className="h-10 px-5 rounded-full bg-ink text-page text-[13px] font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              {t('playlist.playAll')}
            </button>
            <button
              type="button"
              onClick={() => onAddTracks(tracks)}
              disabled={trackCount === 0}
              className="h-10 px-5 rounded-full hairline text-ink-2 text-[13px] font-medium inline-flex items-center gap-2 hover:text-ink hover:bg-chip transition-colors disabled:opacity-30"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('playlist.addAll')}
            </button>
            <button
              type="button"
              onClick={handleFork}
              disabled={!userId || forking}
              className="h-10 px-5 rounded-full bg-accent/15 text-accent text-[13px] font-medium inline-flex items-center gap-2 hover:bg-accent/25 transition-colors disabled:opacity-40"
              title={t('playlist.chatAbout')}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {forking ? t('playlist.chatCreating') : t('playlist.chatAbout')}
            </button>
          </div>
        </div>

        {/* Track list */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-2xl bg-chip animate-pulse" />
            ))}
          </div>
        ) : trackCount === 0 ? (
          <div className="text-center text-[13px] text-ink-3 py-10 px-6 leading-relaxed">
            {t('playlist.emptyTracks')}
          </div>
        ) : (
          <ol className="space-y-0.5">
            {tracks.map((track, i) => {
              const isCurrent = currentTrack?.id === track.id;
              const artwork = track.artworkUrl?.replace('{w}', '120').replace('{h}', '120');
              return (
                <li
                  key={`${track.id}-${i}`}
                  className={`group flex items-center gap-3 p-2.5 rounded-2xl transition-colors ${
                    isCurrent ? 'bg-chip-2' : 'hover:bg-chip'
                  }`}
                >
                  {/* Index (collapses on hover to make room for a play button) */}
                  <div className="w-7 shrink-0 flex items-center justify-center text-[12px] text-ink-3 tabular-nums">
                    {isCurrent && isPlaying ? (
                      <div className="flex gap-0.5 h-3 items-end">
                        <div className="w-0.5 bg-ink rounded-full animate-music-bar-1 h-full" />
                        <div className="w-0.5 bg-ink rounded-full animate-music-bar-2 h-2/3" />
                        <div className="w-0.5 bg-ink rounded-full animate-music-bar-3 h-1/2" />
                      </div>
                    ) : (
                      <>
                        <span className="group-hover:hidden">{i + 1}</span>
                        <button
                          type="button"
                          onClick={() => onPlayTracks([track])}
                          className="hidden group-hover:flex w-6 h-6 rounded-full items-center justify-center text-ink hover:bg-chip-2"
                          aria-label={t('playlist.playNow')}
                          title={t('playlist.playNow')}
                        >
                          <svg className="w-3 h-3 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="w-12 h-12 rounded-card overflow-hidden bg-chip shrink-0">
                    {artwork && <img src={artwork} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className={`text-[14px] font-medium font-display truncate leading-snug ${isCurrent ? 'text-accent' : 'text-ink'}`}>
                      {track.name || 'Unknown'}
                    </div>
                    <div className="text-[12px] text-ink-3 truncate">{track.artist || 'Unknown Artist'}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddTracks([track])}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink hover:bg-chip-2 transition-all shrink-0"
                    aria-label={t('playlist.addToQueue')}
                    title={t('playlist.addToQueue')}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
