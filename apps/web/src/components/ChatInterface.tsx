/**
 * ChatInterface - Main chat UI component
 * @module components/ChatInterface
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RecordPlayer } from './RecordPlayer';
import { NewChatView } from './NewChatView';
import { SkeletonLoader } from './SkeletonLoader';
import { ChatInput } from './chat/ChatInput';
import { TranscriptOverlay } from './chat/TranscriptOverlay';
import { useChat } from '../hooks/useChat';
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
}: ChatInterfaceProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { openPlaylist, hasPlaylist } = usePlaylistSheet();
  const [seekDragging, setSeekDragging] = useState(false);
  const [seekDragValue, setSeekDragValue] = useState(0);
  const seekDisplayValue = seekDragging ? seekDragValue : (playbackTime?.current || 0);

  // Use chat hook for state and methods
  const {
    messages,
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

  // Note: Removed initial warning toast as connection handling is now done via overlay and actionable toasts

  // --- TikTok-style vertical swipe ---
  const swipeContentRef = useRef<HTMLDivElement>(null);   // slider that holds both cards
  const swipeContainerRef = useRef<HTMLDivElement>(null);  // outer overflow-hidden container
  const swipeCleanupRef = useRef<(() => void) | null>(null);
  const wheelCooldownRef = useRef(false);
  const swipeLockedRef = useRef(false);

  // Latest values via refs for native listeners
  const showHistoryRef = useRef(showHistory);
  showHistoryRef.current = showHistory;
  const onSkipNextRef = useRef(onSkipNext);
  onSkipNextRef.current = onSkipNext;
  const onSkipPrevRef = useRef(onSkipPrev);
  onSkipPrevRef.current = onSkipPrev;
  const queueTracksRef = useRef(queueTracks);
  queueTracksRef.current = queueTracks;

  // After swipe animation completes, wait for track change to reset slider
  const pendingResetRef = useRef(false);
  const currentTrackIdRef = useRef(currentTrack?.id);

  useEffect(() => {
    if (currentTrackIdRef.current !== currentTrack?.id) {
      currentTrackIdRef.current = currentTrack?.id;
      if (pendingResetRef.current) {
        const slider = swipeContentRef.current;
        if (slider) {
          slider.style.transition = 'none';
          slider.style.transform = 'translateY(0)';
        }
        pendingResetRef.current = false;
        swipeLockedRef.current = false;
      }
    }
  }, [currentTrack?.id]);

  const nextTrack = queueTracks[1] || null;

  // Ref-based helper for completeSwipe (callable from keyboard useEffect)
  const completeSwipeRef = useRef<(direction: 'up' | 'down') => void>(() => {});

  const formatTime = (seconds: number): string => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isInteractive = (target: HTMLElement) =>
    !!target.closest('button, input, [role="slider"], .rc-slider');

  // Callback ref: sets up all gesture listeners
  const swipeTargetRef = useCallback((el: HTMLDivElement | null) => {
    if (swipeCleanupRef.current) {
      swipeCleanupRef.current();
      swipeCleanupRef.current = null;
    }
    if (!el) return;
    swipeContainerRef.current = el;

    const getH = () => el.offsetHeight || window.innerHeight;

    const setTransform = (y: number, transition?: string) => {
      const slider = swipeContentRef.current;
      if (!slider) return;
      slider.style.transition = transition || 'none';
      slider.style.transform = `translateY(${y}px)`;
    };

    const springBack = () => setTransform(0, 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)');

    const completeSwipe = (direction: 'up' | 'down') => {
      if (swipeLockedRef.current) return;
      swipeLockedRef.current = true;
      const h = getH();
      const targetY = direction === 'up' ? -h : h;
      const skipFn = direction === 'up' ? onSkipNextRef : onSkipPrevRef;

      // Full page transition in both directions
      setTransform(targetY, 'transform 300ms cubic-bezier(0, 0, 0.58, 1)');
      pendingResetRef.current = true;
      skipFn.current?.();

      // Fallback reset if track doesn't change within 1.5s
      setTimeout(() => {
        if (pendingResetRef.current) {
          setTransform(0);
          pendingResetRef.current = false;
          swipeLockedRef.current = false;
        }
      }, 1500);
    };

    // Expose for keyboard handler
    completeSwipeRef.current = completeSwipe;

    // --- Gesture state ---
    let startX = 0, startY = 0, startTime = 0;
    let currentDy = 0;
    let isDragging = false;
    let isVertical: boolean | null = null;
    let lastY = 0, lastTime = 0;

    const onGestureStart = (x: number, y: number) => {
      if (showHistoryRef.current || swipeLockedRef.current) return;
      startX = x; startY = y; startTime = Date.now();
      currentDy = 0; isDragging = true; isVertical = null;
      lastY = y; lastTime = startTime;
    };

    const onGestureMove = (x: number, y: number): boolean => {
      if (!isDragging || swipeLockedRef.current) return false;
      const dx = x - startX;
      const dy = y - startY;

      // Direction lock after 10px
      if (isVertical === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        isVertical = Math.abs(dy) > Math.abs(dx);
        if (!isVertical) { isDragging = false; return false; }
      }
      if (!isVertical) return false;

      currentDy = dy;
      lastY = y; lastTime = Date.now();

      const hasNext = !!queueTracksRef.current[1];
      let appliedDy = dy;

      // 1:1 finger follow by default; linear resistance (0.15) at edges
      if (dy > 0) {
        // Dragging down (prev) — 1:1 follow (card slides down)
        appliedDy = dy;
      } else if (dy < 0 && !hasNext) {
        // Dragging up but no next — edge resistance
        appliedDy = dy * 0.15;
      }

      setTransform(appliedDy);
      return true;
    };

    const onGestureEnd = (y: number) => {
      if (!isDragging || !isVertical) { isDragging = false; return; }
      isDragging = false;

      const dy = currentDy;
      const velocity = (y - lastY) / Math.max(Date.now() - lastTime, 1);
      const h = getH();
      const distThreshold = h * 0.2;
      const velThreshold = 0.3; // px/ms (~300px/s)

      if (dy < -distThreshold || velocity < -velThreshold) {
        completeSwipe('up');
      } else if (dy > distThreshold || velocity > velThreshold) {
        completeSwipe('down');
      } else {
        springBack();
      }
    };

    // --- Touch ---
    const onTouchStart = (e: TouchEvent) => {
      if (isInteractive(e.target as HTMLElement)) return;
      onGestureStart(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (onGestureMove(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => onGestureEnd(e.changedTouches[0].clientY);

    // --- Mouse ---
    let mouseActive = false;
    const onMouseDown = (e: MouseEvent) => {
      if (isInteractive(e.target as HTMLElement)) return;
      if (e.button !== 0) return;
      mouseActive = true;
      onGestureStart(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => { if (mouseActive) onGestureMove(e.clientX, e.clientY); };
    const onMouseUp = (e: MouseEvent) => {
      if (!mouseActive) return;
      mouseActive = false;
      onGestureEnd(e.clientY);
    };

    // --- Wheel: full page transition ---
    const onWheel = (e: WheelEvent) => {
      if (showHistoryRef.current || swipeLockedRef.current) return;
      if (wheelCooldownRef.current) return;
      if (Math.abs(e.deltaY) < 30) return;
      wheelCooldownRef.current = true;
      setTimeout(() => { wheelCooldownRef.current = false; }, 800);
      completeSwipe(e.deltaY > 0 ? 'up' : 'down');
    };

    // Register
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    swipeCleanupRef.current = () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('wheel', onWheel);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // --- Keyboard: arrow up/down for full page transitions ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showHistoryRef.current) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        completeSwipeRef.current('up'); // down arrow = next track
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        completeSwipeRef.current('down'); // up arrow = prev track
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Wrap sendMessage — allow chatting without Apple Music auth;
  // playback errors are caught at the MusicKit layer with reconnect prompts.
  const handleSendMessage = useCallback(async (text?: string, skipAddingUserMessage?: boolean) => {
    await sendMessage(text, skipAddingUserMessage);
  }, [sendMessage]);

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
    <div className="flex flex-col h-full relative bg-white rounded-3xl overflow-hidden shadow-sm border border-white">
      {/* Hero Stage */}
      <div className="flex-1 flex flex-col items-center justify-center relative pb-48">
        {/* Visualizer Background */}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
            <div className="w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse" />
          </div>
        )}

        {/* TikTok-style vertical swipe container */}
        <div
          ref={swipeTargetRef}
          className="absolute inset-0 overflow-hidden"
          style={{ touchAction: 'none' }}
        >
          <div ref={swipeContentRef} className="absolute inset-0" style={{ willChange: 'transform' }}>
            {/* Current track card */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pb-36">
              <div className="relative z-10 w-full max-w-xl px-8">
                <RecordPlayer
                  currentTrack={currentTrack}
                  isPaused={!isPlaying}
                  isTransitioning={isTransitioning}
                  togglePlay={togglePlay}
                  isAppleMusicAuthorized={isAppleMusicAuthorized}
                  onLinkApple={onLinkApple}
                />
              </div>
              {/* Seek bar — directly below album art, moves with swipe */}
              {currentTrack && !showHistory && !isAppleMusicAuthorized && onLinkApple && (
                <div className="w-full max-w-sm px-8 mt-4 flex justify-center">
                  <button
                    onClick={onLinkApple}
                    className="text-sm text-pink-500 hover:text-pink-600 transition-colors font-medium flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                    Connect Apple Music for full playback
                  </button>
                </div>
              )}
              {currentTrack && !showHistory && isAppleMusicAuthorized && (
                <div className="w-full max-w-sm px-8 mt-4 flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 tabular-nums shrink-0">
                    {formatTime(seekDisplayValue)}
                  </span>
                  <div className="relative flex-1 h-5 flex items-center">
                    <div className="w-full h-1.5 bg-gray-100 rounded-full pointer-events-none">
                      <div
                        className="h-full bg-gray-900 rounded-full"
                        style={{ width: `${(seekDisplayValue / (playbackTime?.total || 1)) * 100}%` }}
                      />
                    </div>
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow border border-gray-300 pointer-events-none"
                      style={{ left: `calc(${(seekDisplayValue / (playbackTime?.total || 1)) * 100}% - 6px)` }}
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
                  <span className="text-xs font-mono text-gray-400 tabular-nums shrink-0">
                    {formatTime(playbackTime?.total || 0)}
                  </span>
                </div>
              )}
            </div>

            {/* Next track card (positioned one full page below) */}
            {nextTrack && (
              <div className="absolute inset-0 flex items-center justify-center pb-36" style={{ transform: 'translateY(100%)' }}>
                <div className="relative z-10 w-full max-w-xl px-8 pointer-events-none">
                  <RecordPlayer
                    currentTrack={nextTrack}
                    isPaused={true}
                    isTransitioning={false}
                    togglePlay={() => {}}
                    isAppleMusicAuthorized={isAppleMusicAuthorized}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Transcript Overlay */}
        <TranscriptOverlay
          messages={messages}
          isLoading={isLoading}
          showHistory={showHistory}
        />
      </div>

      {/* Command Console - Fixed at Bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 pt-10 z-30 bg-gradient-to-t from-white via-white/95 to-transparent">
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
                  <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-200">
                    <img src={artUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                );
              }

              return (
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors duration-200 ${
                  showHistory
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600 hover:border-gray-300'
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
              className="md:hidden ml-auto w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
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
        />

        <div className="text-center mt-2.5 text-[9px] text-gray-300 tracking-[0.2em] uppercase">
          Playhead Radio &bull; Live
        </div>
      </div>
    </div>
  );
};
