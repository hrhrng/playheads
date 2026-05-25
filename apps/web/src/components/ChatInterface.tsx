/**
 * ChatInterface - Main chat UI component
 * @module components/ChatInterface
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel, Keyboard, Virtual } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper/types';
import 'swiper/css';
import 'swiper/css/virtual';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RecordPlayer } from './RecordPlayer';
import { NewChatView } from './NewChatView';
import { SkeletonLoader } from './SkeletonLoader';
import { AddToPlaylistButton } from './AddToPlaylistButton';
import { TrackMenu } from './TrackMenu';
import type { TrackMenuItem } from './TrackMenu';
import { ChatInput } from './chat/ChatInput';
import { TranscriptOverlay } from './chat/TranscriptOverlay';
import { MiniLyrics } from './lyrics/MiniLyrics';
import { FullLyrics } from './lyrics/FullLyrics';
import { useChat } from '../hooks/useChat';
import { useLyrics } from '../hooks/useLyrics';
import { useLikedTrack } from '../hooks/useLikedTrack';
import { useInitialMessage } from '../hooks/useChatHelpers';
import { usePlaylistSheet } from '../contexts/PlaylistSheetContext';
import type { PlaybackTime, Conversation } from '../types';
import type { UnifiedTrack } from '../providers/types';
import type { MusicActions, QueueOperations } from '../hooks/useAgentChatAdapter';

interface ChatInterfaceProps {
  /** Whether the DJ is currently speaking */
  isDJSpeaking: boolean;
  /** Whether music is currently playing */
  isPlaying: boolean;
  /** Whether a playback transition is in progress */
  isTransitioning?: boolean;
  /** Current track being played */
  currentTrack: UnifiedTrack | null;
  /** Toggle play/pause */
  togglePlay: () => void;
  /** Current playback position and duration */
  playbackTime: PlaybackTime;
  /** Seek to specific position */
  onSeek?: (time: number) => void;
  /** Current session ID */
  sessionId: string | null;
  /** Current user ID */
  userId: string | null;
  /** Whether Apple Music is authorized */
  isAppleMusicAuthorized: boolean;
  /** Music actions for client tools (player control) */
  musicActions?: MusicActions;
  /** Queue operations for agent action dispatch */
  queueOps?: QueueOperations;
  /** Callback when message is sent */
  onMessageSent?: () => void;
  /** Callback when new session is created */
  onSessionCreated?: (newSessionId: string, initialMessage: string) => void;
  /** Callback to link Apple Music account */
  onLinkApple?: () => Promise<void>;
  /** Full queue — queue[0] is now playing, queue[1..] is up next */
  queue?: UnifiedTrack[];
  /** Previously-played tracks (queue[0..position-1] in MusicKit terms). */
  history?: UnifiedTrack[];
  /** Jump to an absolute index in the full track list (history + current + upcoming). */
  jumpToIndex?: (absoluteIndex: number) => Promise<void>;
  playTrackById?: (trackId: string) => Promise<void>;
  /** Conversations list (incl. playlists) — used by the Like tool to
   *  know whether the current track is already in the Liked playlist,
   *  and by the Add-to-Playlist popover to list custom playlists. */
  conversations?: Conversation[];
  /** Called after a like-toggle / add so the parent can refetch the list. */
  onConversationsRefetch?: () => void;
}

/**
 * ChatInterface - main chat UI component
 *
 * Responsibilities:
 * - Display record player and chat UI
 * - Handle user input and message sending
 * - Show transcript overlay
 * - Delegate state management to store and hooks
 */
export const ChatInterface = ({
  isDJSpeaking,
  isPlaying,
  isTransitioning = false,
  currentTrack,
  togglePlay,
  playbackTime,
  onSeek,
  sessionId,
  userId,
  isAppleMusicAuthorized,
  musicActions,
  queueOps,
  onMessageSent,
  onSessionCreated,
  onLinkApple,
  queue: queueTracks = [],
  history: historyTracks = [],
  jumpToIndex,
  playTrackById,
  conversations: conversationsForLike = [],
  onConversationsRefetch,
}: ChatInterfaceProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { openPlaylist, hasPlaylist } = usePlaylistSheet();
  const [seekDragging, setSeekDragging] = useState(false);
  const [seekDragValue, setSeekDragValue] = useState(0);
  // Track id at drag-start. If the song advances mid-drag (auto-play,
  // LLM skip, etc.) we throw away the seek on release — the intended
  // timestamp belongs to a track that's no longer current.
  const seekDragTrackIdRef = useRef<string | null>(null);
  const seekDisplayValue = seekDragging ? seekDragValue : (playbackTime?.current || 0);
  const [showLyrics, setShowLyrics] = useState(false);
  const lyrics = useLyrics(currentTrack, playbackTime?.current || 0);
  const { isLiked, toggle: toggleLiked } = useLikedTrack({
    userId,
    currentTrack,
    conversations: conversationsForLike,
    onMutated: onConversationsRefetch,
  });

  // Image attachments — uploaded to R2 as user selects files.
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
    const res = await fetch('/api/uploads/image', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`upload failed ${res.status}: ${body.slice(0, 200)}`);
    }
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
          console.error('[upload]', err);
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

  const { t } = useTranslation();

  // Use chat hook for state and methods
  const {
    messages,
    rawMessages,
    input,
    isLoading,
    isLoadingHistory,
    showHistory,
    setInput,
    toggleHistory,
    sendMessage
  } = useChat({
    sessionId,
    userId,
    musicActions,
    queueOps,
    onMessageSent,
    onSessionCreated,
  });

  const formatTime = (seconds: number): string => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- Vertical swipe feed (Swiper.js) ---
  //
  // One slide per track in [...history, ...queue]; Swiper's Virtual
  // module renders only the active slide ± overscan, so DOM stays
  // bounded regardless of list length. Built-in modules handle:
  // touch physics, mousewheel, keyboard, snap-to-slide. We just
  // bridge slideChange → MusicKit jumpToIndex.

  const feedTracks = useMemo<UnifiedTrack[]>(() => {
    return [...historyTracks, ...queueTracks];
  }, [historyTracks, queueTracks]);

  // MusicKit's absolute position. feedTracks[currentTrackIndex] is the
  // playing card.
  const currentTrackIndex = historyTracks.length;

  // Build the now-playing "more" menu. Items live in the three-dot rather
  // than the inline tools row so the row stays tight: Like + Add-to-Playlist
  // are one-tap; less-common actions hide behind the overflow.
  const trackMenuItems = useMemo<TrackMenuItem[]>(() => {
    if (!currentTrack) return [];
    const items: TrackMenuItem[] = [];
    // Remove from queue: removes the currently playing card. Only meaningful
    // when there's something to fall back to (the queue length check).
    if (queueOps && queueTracks.length > 1) {
      items.push({
        key: 'remove-from-queue',
        label: t('trackMenu.removeFromQueue'),
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ),
        onSelect: (close) => {
          queueOps.removeTrack(currentTrackIndex);
          close();
        },
      });
    }
    // Open in Apple Music. The catalog URL works without an explicit
    // storefront — Apple redirects based on the user's account region.
    if (currentTrack.provider === 'apple-music') {
      items.push({
        key: 'open-apple-music',
        label: t('trackMenu.openInAppleMusic'),
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        ),
        onSelect: (close) => {
          const url = `https://music.apple.com/song/${encodeURIComponent(currentTrack.id)}`;
          window.open(url, '_blank', 'noopener,noreferrer');
          close();
        },
      });
    }
    return items;
  }, [currentTrack, queueOps, queueTracks.length, currentTrackIndex, t]);

  const swiperRef = useRef<SwiperClass | null>(null);
  // True during a programmatic slideTo() we initiated for auto-center —
  // suppresses onSlideChange so we don't bounce back into jumpToIndex.
  const programmaticSlideRef = useRef(false);

  // Auto-center the playing track when it changes externally (MusicKit
  // auto-advance, LLM add+play, etc.). We pass `runCallbacks: false` so
  // Swiper doesn't fire slideChange — but Swiper's typed slideTo doesn't
  // expose that arg cleanly; the programmaticSlideRef guard covers it.
  useEffect(() => {
    if (currentTrackIndex < 0) return;
    const sw = swiperRef.current;
    if (!sw || sw.destroyed) return;
    if (sw.activeIndex === currentTrackIndex) return;
    programmaticSlideRef.current = true;
    sw.slideTo(currentTrackIndex, 0);
    // Release on next frame — slideChange fires synchronously during slideTo.
    requestAnimationFrame(() => { programmaticSlideRef.current = false; });
  }, [currentTrackIndex, sessionId]);

  // ESC exits chat mode back to the feed pill (matches iOS chevron-down
  // tap on the sheet drag handle). Ignored while the user is mid-typing
  // in another textarea/input outside the composer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!showHistory) return;
      // Don't steal ESC if the user is in a different text field that
      // might want it (e.g. inline rename in the sidebar).
      const tag = (e.target as HTMLElement)?.tagName;
      const inEditable = tag === 'INPUT' || (tag === 'TEXTAREA' && (e.target as HTMLTextAreaElement)?.value?.trim().length > 0);
      if (inEditable) return;
      e.preventDefault();
      toggleHistory();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showHistory, toggleHistory]);

  // Playback shortcuts (feed mode only, no chat / text field focused):
  //   Space      — toggle play/pause
  //   ArrowLeft  — seek -5s
  //   ArrowRight — seek +5s
  // We bail in chat mode because the user is typing — they need space
  // and arrow keys for the textarea. Also skip if focus is on an
  // interactive element that natively consumes these keys.
  useEffect(() => {
    if (showHistory) return; // chat mode: cede keys to composer / form fields
    const SEEK_DELTA = 5; // seconds
    const isInteractive = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isInteractive(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave OS shortcuts alone
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const t = Math.max(0, (playbackTime?.current ?? 0) - SEEK_DELTA);
        onSeek?.(t);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const cur = playbackTime?.current ?? 0;
        const total = playbackTime?.total ?? 0;
        const t = total > 0 ? Math.min(total, cur + SEEK_DELTA) : cur + SEEK_DELTA;
        onSeek?.(t);
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showHistory, togglePlay, onSeek, playbackTime?.current, playbackTime?.total]);

  // Wrap sendMessage — allow chatting without Apple Music auth;
  // playback errors are caught at the MusicKit layer with reconnect prompts.
  // Drains the local `attachments` queue into FileUIParts. Each attachment's
  // remoteUrl is the upload server's URL of record — public r2.dev in
  // preview, gateway path in prod — both reachable by external LLM providers.
  // External `extraFiles` (e.g. from useInitialMessage's route-state) are
  // merged so cold-start attachments survive the navigation to /chat/{id}.
  const handleSendMessage = useCallback(async (
    text?: string,
    skipAddingUserMessage?: boolean,
    extraFiles?: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }>,
  ) => {
    const doneAttachments = attachments.filter((a) => a.status === 'done' && a.remoteUrl);
    const localFiles = doneAttachments.map((a) => ({
      type: 'file' as const,
      mediaType: a.file.type,
      url: new URL(a.remoteUrl!, window.location.origin).toString(),
      filename: a.file.name,
    }));
    const merged = [...localFiles, ...(extraFiles ?? [])];
    const files = merged.length > 0 ? merged : undefined;
    await sendMessage(text, skipAddingUserMessage, files);
    if (localFiles.length > 0) setAttachments([]);
  }, [sendMessage, attachments]);

  // Auto-send initial message from navigation state
  useInitialMessage(location.state as any, handleSendMessage, isLoading, messages, navigate, location.pathname);

  // Show loading skeleton while fetching history
  if (isLoadingHistory) {
    return <SkeletonLoader />;
  }

  // Show new chat view for empty new chats (no sessionId = new chat)
  if (!sessionId) {
    return (
      <NewChatView
        onSend={handleSendMessage}
        isDJSpeaking={isDJSpeaking}
        isPlaying={isPlaying}
        isLoading={isLoading}
      />
    );
  }

  // Main chat interface
  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Hero Stage */}
      <div className="flex-1 flex flex-col items-center justify-center relative pb-48">
        {/* Visualizer Background — soft accent halo when playing */}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
            <div className="w-96 h-96 bg-accent rounded-full blur-3xl animate-pulse" />
          </div>
        )}

        {/* Vertical swipe feed (Swiper.js). One slide per track; Virtual
            module mounts only active ± overscan. See comment above the
            feed useEffects for full reasoning. */}
        <div className="absolute inset-0">
          {feedTracks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center pb-20 px-6">
              <div className="relative z-10 w-full max-w-xl mx-auto">
                <RecordPlayer
                  currentTrack={null}
                  isPaused
                  togglePlay={() => {}}
                  isAppleMusicAuthorized={isAppleMusicAuthorized}
                  onLinkApple={onLinkApple}
                />
                <div className="h-[120px]" aria-hidden />
              </div>
            </div>
          ) : (
            <Swiper
              direction="vertical"
              slidesPerView={1}
              modules={[Virtual, Mousewheel, Keyboard]}
              virtual
              mousewheel={{ thresholdDelta: 50, releaseOnEdges: true }}
              keyboard={{ enabled: !showHistory }}
              speed={350}
              touchReleaseOnEdges
              allowTouchMove={!showHistory}
              className={`h-full w-full ${showHistory ? 'pointer-events-none' : ''}`}
              onSwiper={(sw) => { swiperRef.current = sw; }}
              onSlideChange={(sw) => {
                if (programmaticSlideRef.current) return;
                const idx = sw.activeIndex;
                if (idx !== currentTrackIndex && idx >= 0 && idx < feedTracks.length) {
                  jumpToIndex?.(idx).catch((e) => console.warn('[feed] jumpToIndex failed', e));
                }
              }}
            >
              {feedTracks.map((track, idx) => {
                const isCenter = idx === currentTrackIndex;
                return (
                  <SwiperSlide key={track.id} virtualIndex={idx} className="!h-full">
                    <div className="h-full flex flex-col items-center justify-center pb-20 px-6">
                      <div className={`relative z-10 w-full max-w-xl mx-auto ${isCenter ? '' : 'pointer-events-none'}`}>
                        <RecordPlayer
                          currentTrack={track}
                          isPaused={isCenter ? !isPlaying : false}
                          isTransitioning={isCenter ? isTransitioning : false}
                          togglePlay={isCenter ? togglePlay : () => {}}
                          isAppleMusicAuthorized={isAppleMusicAuthorized}
                          onLinkApple={isCenter ? onLinkApple : undefined}
                        />
                        {isCenter ? (
                          <>
                            <MiniLyrics lyrics={lyrics} onClick={() => setShowLyrics(true)} />
                            {!isAppleMusicAuthorized && onLinkApple && (
                              <div className={`mt-4 flex justify-center transition-opacity duration-200 ${showHistory || !currentTrack ? 'opacity-0 pointer-events-none' : ''}`}>
                                <button
                                  onClick={onLinkApple}
                                  className="text-[13px] text-accent hover:text-accent-2 transition-colors font-medium flex items-center gap-1.5"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 18V5l12-2v13" />
                                    <circle cx="6" cy="18" r="3" />
                                    <circle cx="18" cy="16" r="3" />
                                  </svg>
                                  {t('chat.connectAppleMusic')}
                                </button>
                              </div>
                            )}
                            {isAppleMusicAuthorized && (playbackTime?.total || 0) > 0 && (
                              <div className={`max-w-sm mx-auto px-2 mt-4 flex items-center gap-3 transition-opacity duration-200 ${showHistory || !currentTrack ? 'opacity-0 pointer-events-none' : ''}`}>
                                <span className="text-[11px] font-mono text-ink-3 tabular-nums shrink-0">
                                  {formatTime(seekDisplayValue)}
                                </span>
                                <div className="relative flex-1 h-5 flex items-center">
                                  <div className="w-full h-1 bg-ink/15 rounded-full pointer-events-none overflow-hidden">
                                    <div
                                      className="h-full bg-ink rounded-full"
                                      style={{ width: `${Math.min(100, (seekDisplayValue / (playbackTime?.total || 1)) * 100)}%` }}
                                    />
                                  </div>
                                  <div
                                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-ink rounded-full shadow pointer-events-none"
                                    style={{ left: `calc(${Math.min(100, (seekDisplayValue / (playbackTime?.total || 1)) * 100)}% - 5px)` }}
                                  />
                                  <input
                                    type="range"
                                    min={0}
                                    max={playbackTime?.total || 1}
                                    step={0.1}
                                    value={seekDisplayValue}
                                    onPointerDown={() => { seekDragTrackIdRef.current = currentTrack?.id ?? null; }}
                                    onChange={(e) => { setSeekDragging(true); setSeekDragValue(parseFloat(e.target.value)); }}
                                    onPointerUp={(e) => {
                                      // Only apply seek if the track is still the one we started on.
                                      // Otherwise the user's intent doesn't transfer cleanly.
                                      if (seekDragTrackIdRef.current && seekDragTrackIdRef.current === currentTrack?.id) {
                                        onSeek?.(parseFloat((e.target as HTMLInputElement).value));
                                      }
                                      seekDragTrackIdRef.current = null;
                                      setSeekDragging(false);
                                    }}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                                  />
                                </div>
                                <span className="text-[11px] font-mono text-ink-3 tabular-nums shrink-0">
                                  {formatTime(playbackTime?.total || 0)}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          // Reserve same vertical space the playing card uses
                          // (MiniLyrics + seek bar) so cover Y is constant.
                          <div className="h-[120px]" aria-hidden />
                        )}
                      </div>
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
          )}
        </div>

        {/* Transcript Overlay */}
        <TranscriptOverlay
          messages={messages}
          rawMessages={rawMessages}
          isLoading={isLoading}
          showHistory={showHistory}
          queueOps={queueOps}
          storefront={musicActions?.storefront}
          playTrackById={playTrackById}
        />

      </div>

      {/* Command Console — fixed at bottom. No bg mask: the composer's
          own glass pill provides the visual separation. A hard
          `from-page → transparent` gradient here would create a colour
          band where its top edge meets the mood blob bg (the two
          page-derived hues never line up). */}
      <div className={`absolute bottom-0 left-0 right-0 px-6 pb-5 pt-10 z-30 transition-all duration-300 ${
        showLyrics && !showHistory ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100 pointer-events-auto translate-y-0'
      }`}>
        {/* Toggle row — only rendered in chat mode (showHistory) as the
            "back to feed" affordance, or on mobile when a playlist is
            available (the playlist button lives here). In feed mode it's
            empty and not needed: the pill itself is the entry point. */}
        <div className={`max-w-xl mx-auto flex items-center transition-all duration-200 ${showHistory || hasPlaylist ? 'mb-2 h-8 opacity-100' : 'h-0 mb-0 opacity-0 pointer-events-none overflow-hidden'}`}>
          {showHistory && (
            <button
              onClick={toggleHistory}
              className="relative w-8 h-8 rounded-full flex items-center justify-center"
              title="Back to feed"
              aria-label="Back to feed"
            >
              {(() => {
                const artUrl = currentTrack?.artworkUrl
                  ? currentTrack.artworkUrl.replace('{w}', '64').replace('{h}', '64')
                  : '';
                const hasArt = !!currentTrack && !!artUrl;

                if (hasArt) {
                  // Track artwork doubles as a "what's playing" indicator
                  // while transcript is up. Tap collapses back to feed.
                  return (
                    <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-rule relative group">
                      <img src={artUrl} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="w-8 h-8 rounded-full hairline bg-ink text-page border-ink flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                );
              })()}
            </button>
          )}

          {/* Playlist button — mobile only, right-aligned, shown when a playlist exists */}
          {hasPlaylist && (
            <button
              onClick={openPlaylist}
              className="md:hidden ml-auto w-8 h-8 rounded-full hairline bg-chip flex items-center justify-center text-ink-3 hover:text-ink hover:bg-chip-2 transition-colors"
              title="View Playlist"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13" />
                <circle cx="6" cy="19" r="3" fill="currentColor" stroke="none" />
                <circle cx="18" cy="16" r="3" fill="currentColor" stroke="none" />
              </svg>
            </button>
          )}
        </div>

        {/* Tools row — sits just above the ChatInput. Per-track actions
            like Like / Save go here so they're always reachable in feed
            mode without having to open chat. Extend by adding more buttons. */}
        {currentTrack && (
          <div className="max-w-xl mx-auto mb-2 flex items-center gap-2 px-1">
            <button
              onClick={toggleLiked}
              disabled={!userId}
              title={isLiked ? t('chatInput.unlike') : t('chatInput.like')}
              aria-label={isLiked ? t('chatInput.unlike') : t('chatInput.like')}
              aria-pressed={isLiked}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all hairline ${
                isLiked
                  ? 'bg-rose-500/15 text-rose-500 border-rose-500/40'
                  : 'bg-chip text-ink-2 hover:text-ink hover:bg-chip-2'
              } disabled:opacity-40`}
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-4.35-9.5-8.5C.5 9 2.5 5 6.5 5c2.5 0 3.99 1.5 5.5 3 1.51-1.5 3-3 5.5-3 4 0 6 4 4 7.5C19 16.65 12 21 12 21z" />
              </svg>
            </button>
            <AddToPlaylistButton
              track={currentTrack}
              userId={userId}
              conversations={conversationsForLike}
              onMutated={onConversationsRefetch}
            />
            {trackMenuItems.length > 0 && (
              <TrackMenu
                items={trackMenuItems}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all hairline bg-chip text-ink-2 hover:text-ink hover:bg-chip-2"
                iconClassName="w-[18px] h-[18px]"
              />
            )}
          </div>
        )}

        {/* Input Bar — pill in feed mode (default), expanded composer once
            the user activates chat. iOS pattern: tap pill → enters chat
            (showHistory true); explicit toggle button or ESC → back to feed. */}
        <ChatInput
          input={input}
          isLoading={isLoading}
          isDJSpeaking={isDJSpeaking}
          isPlaying={isPlaying}
          onInputChange={setInput}
          onSend={() => handleSendMessage()}
          onAttach={handleAttach}
          attachments={attachments.map((a) => a.file)}
          onRemoveAttachment={handleRemoveAttachment}
          collapsed={!showHistory}
          onActivate={toggleHistory}
        />

      </div>

      {/* Lyrics Overlay — rendered last to sit on top of everything */}
      <FullLyrics
        lyrics={lyrics}
        isOpen={showLyrics && !showHistory}
        onClose={() => setShowLyrics(false)}
        onSeek={(time) => onSeek?.(time)}
        artworkUrl={currentTrack?.artworkUrl}
      />
    </div>
  );
};
