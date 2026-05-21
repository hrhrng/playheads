/**
 * ChatInterface - Main chat UI component
 * @module components/ChatInterface
 */

import { useEffect, useRef, useState, useCallback } from 'react';
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
  /** Skip to next track */
  onSkipNext?: () => Promise<void>;
  /** Skip to previous track */
  onSkipPrev?: () => Promise<void>;
  /** Full queue — queue[0] is now playing, queue[1..] is up next */
  queue?: UnifiedTrack[];
  playTrackById?: (trackId: string) => Promise<void>;
  /** Whether there are previously played tracks (enables swipe-up) */
  hasHistory?: boolean;
  onFinishQueue?: () => Promise<void>;
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
  onSkipNext,
  onSkipPrev,
  queue: queueTracks = [],
  playTrackById,
  hasHistory = false,
  onFinishQueue,
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

  // --- Native scroll-snap vertical swipe (TikTok-style physics) ---
  // Uses CSS scroll-snap for native inertia, momentum, and dampening.
  // Layout: [prev placeholder] [current card] [next card]
  // Always scrolled to the middle card (index 1). When the user scrolls
  // to prev/next, we fire skip and reset scroll position on track change.

  const scrollRef = useRef<HTMLDivElement>(null);
  const isResettingRef = useRef(false);
  const scrollTimerRef = useRef<number>(0);
  const pendingResetRef = useRef(false);
  const currentTrackIdRef = useRef(currentTrack?.id);

  const onSkipNextRef = useRef(onSkipNext);
  onSkipNextRef.current = onSkipNext;
  const onSkipPrevRef = useRef(onSkipPrev);
  onSkipPrevRef.current = onSkipPrev;
  const showHistoryRef = useRef(showHistory);
  showHistoryRef.current = showHistory;
  const nextTrack = queueTracks[1] || null;

  const hasHistoryRef = useRef(hasHistory);
  hasHistoryRef.current = hasHistory;
  const nextTrackRef = useRef(nextTrack);
  nextTrackRef.current = nextTrack;
  const onFinishQueueRef = useRef(onFinishQueue);
  onFinishQueueRef.current = onFinishQueue;

  // Scroll to first card (current) on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: hasHistory ? el.clientHeight : 0, behavior: 'instant' as ScrollBehavior });
    });
    // Only on mount/session change — NOT on hasHistory change (would yank user back mid-scroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Detect scroll settle → fire skip if landed on prev/next card
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (isResettingRef.current) return;
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => {
        const page = Math.round(el.scrollTop / el.clientHeight);
        const h = hasHistoryRef.current;
        const currentPage = h ? 1 : 0;
        const resetTop = h ? el.clientHeight : 0;

        if (h && page === 0 && !pendingResetRef.current) {
          // Swiped up → previous track
          pendingResetRef.current = true;
          onSkipPrevRef.current?.();
          setTimeout(() => {
            if (pendingResetRef.current) {
              isResettingRef.current = true;
              el.scrollTo({ top: resetTop, behavior: 'smooth' });
              requestAnimationFrame(() => { isResettingRef.current = false; pendingResetRef.current = false; });
            }
          }, 400);
        } else if (page > currentPage && !pendingResetRef.current) {
          // Swiped down → next track
          pendingResetRef.current = true;
          onSkipNextRef.current?.();
          setTimeout(() => {
            if (pendingResetRef.current) {
              isResettingRef.current = true;
              el.scrollTo({ top: resetTop, behavior: 'smooth' });
              requestAnimationFrame(() => { isResettingRef.current = false; pendingResetRef.current = false; });
            }
          }, 400);
        }
      }, 80);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(scrollTimerRef.current);
    };
  }, []);

  // When track changes after a skip, reset scroll to center
  useEffect(() => {
    if (currentTrackIdRef.current !== currentTrack?.id) {
      currentTrackIdRef.current = currentTrack?.id;
      if (pendingResetRef.current) {
        const el = scrollRef.current;
        if (el) {
          isResettingRef.current = true;
          el.scrollTo({ top: hasHistoryRef.current ? el.clientHeight : 0, behavior: 'instant' as ScrollBehavior });
          requestAnimationFrame(() => {
            isResettingRef.current = false;
            pendingResetRef.current = false;
          });
        }
      }
    }
  }, [currentTrack?.id]);

  // Keyboard: arrow keys trigger programmatic smooth scroll
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showHistoryRef.current) return;
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
  }, []);

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

        {/* Scroll-snap vertical swipe container */}
        <div
          ref={scrollRef}
          className={`absolute inset-0 snap-y snap-mandatory no-scrollbar ${
            showHistory ? 'overflow-hidden' : 'overflow-y-scroll'
          }`}
          style={{ overscrollBehaviorY: 'contain' }}
        >
          {/* Previous card — only when there's history */}
          {hasHistory && <div className="h-full shrink-0 snap-start snap-always" />}

          {/* Current track card */}
          <div className="h-full shrink-0 snap-start snap-always flex flex-col items-center justify-center pb-20">
            <div className="relative z-10 w-full max-w-xl px-6">
              <RecordPlayer
                currentTrack={currentTrack}
                isPaused={!isPlaying}
                isTransitioning={isTransitioning}
                togglePlay={togglePlay}
                isAppleMusicAuthorized={isAppleMusicAuthorized}
                onLinkApple={onLinkApple}
              />
              <MiniLyrics lyrics={lyrics} onClick={() => setShowLyrics(true)} />

              {/* Seek bar — inside same max-w-xl container as album art */}
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
            </div>
          </div>

          {/* Next track card — mirror the current card's wrapper *exactly*
              (max-w-xl px-6, pb-20) so the cover lands at the same X/Y
              position. Swipe-to-next then becomes "track info crossfades"
              instead of "cover suddenly resizes". */}
          {nextTrack && (
            <div className="h-full shrink-0 snap-start snap-always flex flex-col items-center justify-center pb-20">
              <div className="relative z-10 w-full max-w-xl px-6 pointer-events-none">
                <RecordPlayer
                  currentTrack={nextTrack}
                  isPaused={true}
                  isTransitioning={false}
                  togglePlay={() => {}}
                  isAppleMusicAuthorized={isAppleMusicAuthorized}
                />
                {/* Reserve vertical space that the current-track card uses
                    for MiniLyrics + seek bar, so the cover sits at the same
                    Y on both cards (no vertical jump during swipe). */}
                <div className="h-[120px]" aria-hidden />
              </div>
            </div>
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
