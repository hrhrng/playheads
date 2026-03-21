/**
 * ChatInterface - Three-state main chat UI component.
 *
 * Orchestrates Default, Lyrics, and Chat views with smooth transitions.
 * Replaces the old binary "player + transcript overlay" design.
 *
 * @module components/ChatInterface
 */

import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlayerSection } from './PlayerSection';
import { LyricsSnippet } from './LyricsSnippet';
import { LyricsView } from './LyricsView';
import { ChatFlow } from './ChatFlow';
import { NewChatView } from './NewChatView';
import { SkeletonLoader } from './SkeletonLoader';
import { ChatInput } from './chat/ChatInput';
import { useChat } from '../hooks/useChat';
import { useViewState } from '../hooks/useViewState';
import { useLyrics } from '../hooks/useLyrics';
import { useInitialMessage } from '../hooks/useChatHelpers';
import { usePlaylistSheet } from '../contexts/PlaylistSheetContext';
import type { PlaybackTime } from '../types';
import type { UnifiedTrack } from '../providers/types';
import type { MusicActions, QueueOperations } from '../hooks/useAgentChatAdapter';
import type { Message, TextPart } from '../types/chat';

interface ChatInterfaceProps {
  isDJSpeaking: boolean;
  isPlaying: boolean;
  isTransitioning?: boolean;
  currentTrack: UnifiedTrack | null;
  togglePlay: () => void;
  playbackTime: PlaybackTime;
  onSeek?: (time: number) => void;
  sessionId: string | null;
  userId: string | null;
  isAppleMusicAuthorized: boolean;
  musicActions?: MusicActions;
  queueOps?: QueueOperations;
  onMessageSent?: () => void;
  onSessionCreated?: (newSessionId: string, initialMessage: string) => void;
  onLinkApple?: () => Promise<void>;
  onSkipNext?: () => Promise<void>;
  onSkipPrev?: () => Promise<void>;
  queue?: UnifiedTrack[];
}

/**
 * Extract display text from a message for the preview in Default view.
 */
function getMessagePreviewText(msg: Message): string {
  if ('parts' in msg && msg.parts) {
    for (const part of msg.parts) {
      if (part.type === 'text') return (part as TextPart).content;
    }
  }
  if ('content' in msg && typeof msg.content === 'string') return msg.content;
  return '';
}

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

  // View state machine
  const { mode, goToDefault, goToLyrics, goToChat, setLyricsAvailable } = useViewState();

  // Chat hook
  const {
    messages,
    input,
    isLoading,
    isLoadingHistory,
    setInput,
    sendMessage,
  } = useChat({
    sessionId,
    userId,
    musicActions,
    queueOps,
    onMessageSent,
    onSessionCreated,
  });

  // Lyrics hook
  const storefrontId = musicActions?.storefront || 'us';
  const lyricsData = useLyrics({
    trackId: currentTrack?.id || null,
    playbackTime,
    storefrontId,
    isAppleMusicAuthorized,
  });

  // Sync lyrics availability to view state
  useEffect(() => {
    setLyricsAvailable(lyricsData.hasLyrics);
  }, [lyricsData.hasLyrics, setLyricsAvailable]);

  // Reset view state when session changes
  useEffect(() => {
    goToDefault();
  }, [sessionId]);

  // Wrap sendMessage
  const handleSendMessage = useCallback(async (text?: string, skipAddingUserMessage?: boolean) => {
    await sendMessage(text, skipAddingUserMessage);
  }, [sendMessage]);

  // Auto-send initial message from navigation state
  useInitialMessage(location.state as any, handleSendMessage, isLoading, messages, navigate, location.pathname);

  // Loading skeleton
  if (isLoadingHistory) {
    return <SkeletonLoader />;
  }

  // New chat view (no session)
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

  // Recent messages for Default view preview (last 3)
  const recentMessages = messages.slice(-3);

  // Main three-state interface
  return (
    <div className="flex flex-col h-full relative bg-white rounded-3xl overflow-hidden shadow-sm border border-white">
      {/* ── DEFAULT VIEW ── */}
      {mode === 'default' && (
        <div className="flex flex-col h-full">
          {/* Player area - centered */}
          <div className="flex-1 flex flex-col items-center justify-center relative">
            {/* Visualizer Background */}
            {isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                <div className="w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse" />
              </div>
            )}

            <div className="relative z-10 w-full">
              <PlayerSection
                mode="full"
                currentTrack={currentTrack}
                isPaused={!isPlaying}
                isTransitioning={isTransitioning}
                togglePlay={togglePlay}
                isAppleMusicAuthorized={isAppleMusicAuthorized}
                onLinkApple={onLinkApple}
                playbackTime={playbackTime}
                onSeek={onSeek}
              />
            </div>
          </div>

          {/* Lyrics snippet */}
          <div className="shrink-0">
            <LyricsSnippet
              currentLine={lyricsData.currentLine}
              nextLine={lyricsData.nextLine}
              onClick={goToLyrics}
              lyricsAvailable={lyricsData.hasLyrics}
            />
          </div>

          {/* Recent chat messages preview */}
          <div className="shrink-0 px-6 mb-2 max-h-28 overflow-hidden">
            <div className="max-w-xl mx-auto">
              {recentMessages.length > 0 && (
                <button
                  onClick={goToChat}
                  className="w-full text-left rounded-xl hover:bg-gray-50 transition-colors p-2 -mx-2 cursor-pointer"
                >
                  {recentMessages.map((msg, i) => {
                    const text = getMessagePreviewText(msg);
                    if (!text) return null;
                    const isUser = msg.role === 'user';
                    return (
                      <div key={i} className="flex gap-2 items-start py-0.5">
                        <span className="text-[10px] font-mono text-gray-400 uppercase shrink-0 mt-0.5 w-6">
                          {isUser ? 'You' : 'DJ'}
                        </span>
                        <p className={`text-sm line-clamp-1 ${isUser ? 'text-gray-500 italic' : 'text-gray-600'}`}>
                          {text}
                        </p>
                      </div>
                    );
                  })}
                </button>
              )}
            </div>
          </div>

          {/* Input + footer pinned at bottom */}
          <div className="shrink-0 px-6 pb-5 pt-2 pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-xl mx-auto">
              <ChatInput
                input={input}
                isLoading={isLoading}
                isDJSpeaking={isDJSpeaking}
                isPlaying={isPlaying}
                onInputChange={setInput}
                onSend={() => handleSendMessage()}
              />

              {/* Footer */}
              <div className="flex items-center justify-center mt-2.5 gap-3">
                <span className="text-[9px] text-gray-300 tracking-[0.2em] uppercase">
                  Global Queue &bull; {queueTracks.length} {queueTracks.length === 1 ? 'Track' : 'Tracks'}
                </span>

                {/* Mobile playlist button */}
                {hasPlaylist && (
                  <button
                    onClick={openPlaylist}
                    className="md:hidden w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 transition-colors"
                    title="View Playlist"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LYRICS VIEW ── */}
      {mode === 'lyrics' && (
        <div className="flex flex-col h-full">
          <PlayerSection
            mode="mini"
            currentTrack={currentTrack}
            isPaused={!isPlaying}
            isTransitioning={isTransitioning}
            togglePlay={togglePlay}
            isAppleMusicAuthorized={isAppleMusicAuthorized}
            playbackTime={playbackTime}
            onClickMiniPlayer={goToDefault}
          />
          <LyricsView
            lyrics={lyricsData.lyrics}
            currentLineIndex={lyricsData.currentLineIndex}
            playbackTime={playbackTime}
            onClose={goToDefault}
            onOpenChat={goToChat}
          />
        </div>
      )}

      {/* ── CHAT OVERLAY (always rendered, slides in/out) ── */}
      <ChatFlow
        messages={messages}
        isLoading={isLoading}
        input={input}
        onInputChange={setInput}
        onSend={() => handleSendMessage()}
        isDJSpeaking={isDJSpeaking}
        isPlaying={isPlaying}
        isVisible={mode === 'chat'}
        onClose={goToDefault}
      />
    </div>
  );
};
