/**
 * PlaylistView — third form for `type: 'playlist'` conversations.
 *
 * Playlists never carry chat messages (the gateway creates them with
 * `messageCount: 0` and there's no path to add messages), so this view
 * makes the tracks themselves the hero instead of forcing them into a
 * tab on a chat layout.
 *
 * Chat entry: a bottom-pinned capsule composer mirrors the new-chat page.
 * Typing a message + send forks a fresh `type='chat'` session seeded with
 * this playlist's tracks (so the AI sees them on turn 1 via get_playlist),
 * navigates to the new chat, and `useInitialMessage` auto-sends the typed
 * text. If the playlist is the Liked playlist, the same fork happens; the
 * Liked-specific endpoint is only used by the heart toggle, not here.
 *
 * @module components/PlaylistView
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config/api';
import { TrackMenu } from './TrackMenu';
import type { TrackMenuItem } from './TrackMenu';
import { AddToPlaylistButton } from './AddToPlaylistButton';
import { ChatInput } from './chat/ChatInput';
import { MiniPlayer } from './MiniPlayer';
import { useVoiceInput } from '../hooks/useVoiceInput';
import type { UnifiedTrack } from '../providers/types';
import type { Conversation, PlaybackTime } from '../types';

interface PlaylistViewProps {
  conversation: Conversation;
  /** Full conversations list — passed through to the per-row Add-to-Playlist
   *  popover so the user can copy a track from this playlist into another. */
  conversations?: Conversation[];
  userId: string | null;
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  /** For the inline MiniPlayer that sits above the chat composer when
   *  something is playing — playlists are a non-feed page so a compact
   *  always-on player keeps controls within reach. */
  togglePlay: () => void;
  onSkipNext?: () => void;
  playbackTime: PlaybackTime;
  onSeek: (seconds: number) => void;
  onPlayTracks: (tracks: UnifiedTrack[]) => void;
  onAddTracks: (tracks: UnifiedTrack[]) => void;
  onSessionCreated?: () => void;
  onConversationsRefetch?: () => void;
}

export const PlaylistView = ({
  conversation,
  conversations = [],
  userId,
  currentTrack,
  isPlaying,
  togglePlay,
  onSkipNext,
  playbackTime,
  onSeek,
  onPlayTracks,
  onAddTracks,
  onSessionCreated,
  onConversationsRefetch,
}: PlaylistViewProps): React.JSX.Element => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<UnifiedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);
  const [composerInput, setComposerInput] = useState('');

  // Voice input for the playlist composer (forks into a new chat on send).
  const {
    isRecording,
    isTranscribing,
    startHold,
    endHold,
    cancelHold,
  } = useVoiceInput({
    lang: i18n.language,
    onTranscript: (text) =>
      setComposerInput((prev) => (prev ? `${prev} ${text}` : text)),
    onError: (msg) => console.warn('[PlaylistView] voice input error', msg),
  });

  // Attachment pipeline — mirrors DiscoveryPage so the playlist page's
  // composer can carry images into the forked chat the same way the new-
  // chat page can. Uploads happen as the user picks files; the resolved
  // R2 URLs are passed to the new chat via route state, where
  // useInitialMessage merges them with the auto-sent first message.
  type Attachment = {
    file: File;
    status: 'uploading' | 'done' | 'error';
    remoteUrl?: string;
    error?: string;
  };
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/uploads/image`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`upload failed ${res.status}`);
    const json = (await res.json()) as { url: string };
    return json.url;
  }, []);

  const handleAttach = useCallback((files: File[]) => {
    const newOnes: Attachment[] = files.map((f) => ({ file: f, status: 'uploading' as const }));
    setAttachments((prev) => [...prev, ...newOnes]);
    newOnes.forEach((att) => {
      uploadFile(att.file).then(
        (url) => {
          setAttachments((prev) =>
            prev.map((a) => (a.file === att.file ? { ...a, status: 'done', remoteUrl: url } : a)),
          );
        },
        (err: Error) => {
          console.error('[PlaylistView upload]', err);
          setAttachments((prev) =>
            prev.map((a) => (a.file === att.file ? { ...a, status: 'error', error: err.message } : a)),
          );
        },
      );
    });
  }, [uploadFile]);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Fetch the playlist's tracks. `conversations` in props only carries
  // metadata (title, playlist_count, playlist_cover); the actual tracks
  // live on /api/conversations/{id}.
  const refetchTracks = useCallback(() => {
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

  useEffect(() => {
    const cleanup = refetchTracks();
    return cleanup;
  }, [refetchTracks]);

  const cover = useMemo(() => {
    const url = tracks[0]?.artworkUrl ?? conversation.playlist_cover;
    if (!url) return null;
    return url.replace('{w}', '600').replace('{h}', '600');
  }, [tracks, conversation.playlist_cover]);

  /**
   * Fork a chat from this playlist. Optional `initialMessage` /
   * `initialFiles` are handed to the new chat via route state; the new
   * chat's useInitialMessage hook will auto-send them on mount.
   */
  const handleFork = useCallback(async (
    initialMessage?: string,
    initialFiles?: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }>,
  ) => {
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
      const hasMessage = !!initialMessage?.trim();
      const hasFiles = !!initialFiles?.length;
      navigate(`/chat/${session_id}`, {
        replace: false,
        state: hasMessage || hasFiles
          ? {
              isNewlyCreated: true,
              ...(hasMessage ? { initialMessage: initialMessage!.trim() } : {}),
              ...(hasFiles ? { initialFiles } : {}),
            }
          : undefined,
      });
    } catch (e) {
      console.error('[PlaylistView] fork chat failed:', e);
      setForking(false);
    }
  }, [userId, forking, conversation.id, onSessionCreated, navigate]);

  const handleSendComposer = useCallback(() => {
    if (forking) return;
    const text = composerInput.trim();
    // Resolve attachments to FileUIParts for the new chat to send.
    const doneAttachments = attachments.filter((a) => a.status === 'done' && a.remoteUrl);
    const initialFiles = doneAttachments.length > 0
      ? doneAttachments.map((a) => ({
          type: 'file' as const,
          mediaType: a.file.type,
          url: new URL(a.remoteUrl!, window.location.origin).toString(),
          filename: a.file.name,
        }))
      : undefined;
    // Don't fork on an empty pill — match the new-chat behaviour.
    if (!text && !initialFiles) return;
    handleFork(text || undefined, initialFiles);
  }, [composerInput, forking, attachments, handleFork]);

  // MiniPlayer "expand to feed" — jump to the most-recent chat-type
  // conversation. Symmetric to DiscoveryPage's behaviour; if there's
  // no chat yet, spawn one (rare from a playlist page, but possible
  // for users who haven't started any chats).
  const handleExpandFeed = useCallback(async () => {
    const recentChat = conversations.find((c) => c.type !== 'playlist');
    if (recentChat) {
      navigate(`/chat/${recentChat.id}`);
      return;
    }
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error(`session/create ${res.status}`);
      const { session_id } = (await res.json()) as { session_id: string };
      onSessionCreated?.();
      navigate(`/chat/${session_id}`);
    } catch (e) {
      console.error('[PlaylistView] expand-to-feed failed:', e);
    }
  }, [conversations, userId, navigate, onSessionCreated]);

  const handleRemoveFromPlaylist = useCallback(async (track: UnifiedTrack) => {
    if (!userId) return;
    // Optimistic remove — drop the row immediately, restore on error.
    const prev = tracks;
    setTracks(prev.filter((t) => t.id !== track.id));
    try {
      const res = await fetch(`${API_BASE}/playlists/${conversation.id}/remove-track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, track_id: track.id }),
      });
      if (!res.ok) throw new Error(`remove-track ${res.status}`);
      onConversationsRefetch?.();
    } catch (e) {
      console.warn('[PlaylistView] remove failed', e);
      setTracks(prev);
    }
  }, [userId, conversation.id, tracks, onConversationsRefetch]);

  const title = conversation.title?.trim() || 'Untitled Playlist';
  const trackCount = tracks.length;
  // Liked is a special playlist — the heart icon owns its membership semantics,
  // so we don't expose the Remove action from the three-dot menu there.
  const allowRemove = !conversation.is_liked;

  /** Build the row-level overflow menu items for a track. Add-to-queue and
   *  Add-to-playlist live inline; the three-dot only carries the actions
   *  that don't fit there (Remove from this playlist for now). */
  const buildMenuItems = useCallback((track: UnifiedTrack): TrackMenuItem[] => {
    const items: TrackMenuItem[] = [];
    if (allowRemove) {
      items.push({
        key: 'remove',
        label: t('trackMenu.removeFromPlaylist'),
        destructive: true,
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ),
        onSelect: (close) => {
          handleRemoveFromPlaylist(track);
          close();
        },
      });
    }
    return items;
  }, [allowRemove, t, handleRemoveFromPlaylist]);

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 pt-8 pb-40">
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

            {/* Actions — Play All / Add All. Chat moved to the bottom composer. */}
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
                const menuItems = buildMenuItems(track);
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

                    <div
                      className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => onAddTracks([track])}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-chip-2 transition-colors"
                        aria-label={t('playlist.addToQueue')}
                        title={t('playlist.addToQueue')}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                      <AddToPlaylistButton
                        track={track}
                        userId={userId}
                        conversations={conversations}
                        onMutated={onConversationsRefetch}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-chip-2 transition-colors"
                        iconClassName="w-4 h-4"
                      />
                      {menuItems.length > 0 && (
                        <TrackMenu
                          items={menuItems}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-chip-2 transition-colors"
                          iconClassName="w-4 h-4"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {/* Bottom-pinned chat composer — reuse ChatInput so the playlist
          page's input is visually identical to the one on the new-chat
          page and inside an active chat (same pill, send button, voice
          long-press, attachments). Submitting forks a chat with
          seed_playlist_id; typed text / attachments are handed off via
          route state so the new chat auto-sends them. */}
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 pt-10 z-30 pointer-events-none">
        <div className="pointer-events-auto">
          <MiniPlayer
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            togglePlay={togglePlay}
            onSkipNext={onSkipNext}
            onExpand={handleExpandFeed}
            playbackTime={playbackTime}
            onSeek={onSeek}
          />
          <ChatInput
            input={composerInput}
            isLoading={forking}
            isDJSpeaking={false}
            isPlaying={isPlaying}
            onInputChange={setComposerInput}
            onSend={handleSendComposer}
            onAttach={handleAttach}
            attachments={attachments.map((a) => a.file)}
            onRemoveAttachment={handleRemoveAttachment}
            onVoiceHoldStart={startHold}
            onVoiceHoldEnd={endHold}
            onVoiceHoldCancel={cancelHold}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
          />
        </div>
      </div>
    </div>
  );
};
