/**
 * ChatInterface - Main chat UI component
 * @module components/ChatInterface
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RecordPlayer } from './RecordPlayer';
import { NewChatView } from './NewChatView';
import { SkeletonLoader } from './SkeletonLoader';
import { ChatInput } from './chat/ChatInput';
import { TranscriptOverlay } from './chat/TranscriptOverlay';
import { MiniLyrics } from './lyrics/MiniLyrics';
import { FullLyrics } from './lyrics/FullLyrics';
import { useChat } from '../hooks/useChat';
import { useLyrics } from '../hooks/useLyrics';
import { useInitialMessage } from '../hooks/useChatHelpers';
import { usePlaylistSheet } from '../contexts/PlaylistSheetContext';
import type { PlaybackTime } from '../types';
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
}: ChatInterfaceProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { openPlaylist, hasPlaylist } = usePlaylistSheet();
  const [seekDragging, setSeekDragging] = useState(false);
  const [seekDragValue, setSeekDragValue] = useState(0);
  const seekDisplayValue = seekDragging ? seekDragValue : (playbackTime?.current || 0);
  const [showLyrics, setShowLyrics] = useState(false);
  const lyrics = useLyrics(currentTrack, playbackTime?.current || 0);

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

  // --- N-card swipe feed ---
  //
  // The feed is the *flat* MusicKit item list: history + currentTrack +
  // upcoming. Each track gets its own card (keyed by track.id); the
  // currently-playing card is the one whose index equals
  // `currentTrackIndex`. Scroll-snap moves the viewport between cards
  // natively — when the user lands on a non-current card we call
  // jumpToIndex(absoluteIndex) so MusicKit advances. No role-swap,
  // no 400 ms scrollTo bounce-back, no shrinking-cover transition;
  // cards stay mounted, owned by their track id.
  //
  // Auto-advance / external skip / LLM add_to_queue → currentTrackIndex
  // changes, the feed scrolls itself to that index (only when the user
  // isn't actively scrolling so we don't yank).

  const scrollRef = useRef<HTMLDivElement>(null);

  const feedTracks = useMemo<UnifiedTrack[]>(() => {
    // queueTracks = [currentTrack, ...upcoming], history = items before position
    return [...historyTracks, ...queueTracks];
  }, [historyTracks, queueTracks]);

  const currentTrackIndex = historyTracks.length;

  // User-gesture lock: while the user is mid-touch / wheeling, we
  // suppress the auto-scroll-to-current effect to avoid yanking them.
  const userScrollingRef = useRef(false);
  // While a programmatic scrollTo is animating, ignore landing-detection
  // (else we'd fire jumpToIndex on the snap we initiated ourselves).
  const programmaticScrollRef = useRef(false);
  const scrollSettleTimerRef = useRef<number>(0);

  // Center the playing track on mount + whenever it changes externally.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || currentTrackIndex < 0) return;
    if (userScrollingRef.current) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: currentTrackIndex * el.clientHeight, behavior: 'instant' as ScrollBehavior });
    // Release the lock on next frame so the snap event we just caused
    // doesn't bounce into landing-detection.
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [currentTrackIndex, sessionId]);

  // Scroll-snap landing detection: when the user settles on a card,
  // jump MusicKit to that index. Debounced so wheel/touch don't fire
  // multiple times during inertia.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      userScrollingRef.current = true;
      clearTimeout(scrollSettleTimerRef.current);
      scrollSettleTimerRef.current = window.setTimeout(() => {
        userScrollingRef.current = false;
        const idx = Math.round(el.scrollTop / el.clientHeight);
        if (idx !== currentTrackIndex && idx >= 0 && idx < feedTracks.length) {
          jumpToIndex?.(idx).catch((e) => console.warn('[feed] jumpToIndex failed', e));
        }
      }, 140);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(scrollSettleTimerRef.current);
    };
  }, [currentTrackIndex, feedTracks.length, jumpToIndex]);

  // Arrow keys = step ±1 (smooth, native scroll-snap handles physics).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showHistory) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const el = scrollRef.current;
      if (!el) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showHistory]);

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

        {/* N-card feed — one card per track in history + currentTrack
            + upcoming. Cards are keyed by track id and never role-swap.
            See ChatInterface comment above the swipe useEffects. */}
        <div
          ref={scrollRef}
          className={`absolute inset-0 snap-y snap-mandatory no-scrollbar ${
            showHistory ? 'overflow-hidden' : 'overflow-y-scroll'
          }`}
          style={{ overscrollBehaviorY: 'contain' }}
        >
          {feedTracks.length === 0 && (
            <div className="h-full snap-start snap-always flex flex-col items-center justify-center pb-20">
              <div className="relative z-10 w-full max-w-xl px-6">
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
          )}
          {feedTracks.map((track, idx) => {
            const isCenter = idx === currentTrackIndex;
            // Lazy: only render cover artwork for ±2 cards around current.
            // Outside that window the card stays as a sized placeholder
            // so the scroll height stays correct.
            const inWindow = Math.abs(idx - currentTrackIndex) <= 2;
            return (
              <div
                key={track.id}
                className="h-full shrink-0 snap-start snap-always flex flex-col items-center justify-center pb-20"
              >
                <div className={`relative z-10 w-full max-w-xl px-6 ${isCenter ? '' : 'pointer-events-none'}`}>
                  {inWindow ? (
                    <RecordPlayer
                      currentTrack={track}
                      isPaused={isCenter ? !isPlaying : false}
                      isTransitioning={isCenter ? isTransitioning : false}
                      togglePlay={isCenter ? togglePlay : () => {}}
                      isAppleMusicAuthorized={isAppleMusicAuthorized}
                      onLinkApple={isCenter ? onLinkApple : undefined}
                    />
                  ) : (
                    // Outside the lazy window — keep the card shape so
                    // scroll height matches feedTracks.length * vh, but
                    // skip the image network request.
                    <div className="flex flex-col items-center gap-7 w-full">
                      <div className="w-full aspect-square rounded-card bg-chip" aria-hidden />
                      <div className="text-center space-y-1.5 max-w-lg px-4 w-full">
                        <h2 className="text-[26px] font-display font-medium text-ink-3 line-clamp-1">{track.name || 'Unknown'}</h2>
                        <p className="text-[15px] text-ink-3 font-display">{track.artist || 'Unknown Artist'}</p>
                      </div>
                    </div>
                  )}
                  {isCenter && (
                    <>
                      <MiniLyrics lyrics={lyrics} onClick={() => setShowLyrics(true)} />
                      {/* Connect Apple Music banner (when not authorized) */}
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
                      {/* Seek bar */}
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
                              onChange={(e) => { setSeekDragging(true); setSeekDragValue(parseFloat(e.target.value)); }}
                              onPointerUp={(e) => { onSeek?.(parseFloat((e.target as HTMLInputElement).value)); setSeekDragging(false); }}
                              className="absolute inset-0 w-full opacity-0 cursor-pointer"
                            />
                          </div>
                          <span className="text-[11px] font-mono text-ink-3 tabular-nums shrink-0">
                            {formatTime(playbackTime?.total || 0)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {!isCenter && (
                    // Reserve the same vertical space the playing card
                    // uses for MiniLyrics + seek bar, so the cover sits at
                    // the same Y across every card in the feed (no jump).
                    <div className="h-[120px]" aria-hidden />
                  )}
                </div>
              </div>
            );
          })}
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
        {/* Toggle Button + Mobile Playlist Button */}
        <div className="max-w-xl mx-auto mb-2 flex items-center">
          <button
            onClick={toggleHistory}
            className="relative w-8 h-8 rounded-full flex items-center justify-center"
            title={showHistory ? 'Back to Player' : 'View Transcript'}
          >
            {(() => {
              const artUrl = currentTrack?.artworkUrl
                ? currentTrack.artworkUrl.replace('{w}', '64').replace('{h}', '64')
                : '';
              const hasArt = !!currentTrack && !!artUrl;

              if (hasArt && showHistory) {
                return (
                  <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-rule">
                    <img src={artUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                );
              }

              return (
                <div className={`w-8 h-8 rounded-full hairline flex items-center justify-center transition-colors duration-200 ${
                  showHistory
                    ? 'bg-ink text-page border-ink'
                    : 'bg-chip text-ink-3 hover:text-ink hover:bg-chip-2'
                }`}>
                  {showHistory ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 10l12-3" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </div>
              );
            })()}
          </button>

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

        {/* Input Bar */}
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
