/**
 * ChatInterface - Main chat UI component
 * @module components/ChatInterface
 */

import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RecordPlayer } from './RecordPlayer';
import { NewChatView } from './NewChatView';
import { SkeletonLoader } from './SkeletonLoader';
import { ChatInput } from './chat/ChatInput';
import { TranscriptOverlay } from './chat/TranscriptOverlay';
import { useChat } from '../hooks/useChat';
import { useInitialMessage } from '../hooks/useChatHelpers';
import type { Track, PlaybackTime, Message, AgentAction } from '../types';

interface ChatInterfaceProps {
  /** Whether the DJ is currently speaking */
  isDJSpeaking: boolean;
  /** Whether music is currently playing */
  isPlaying: boolean;
  /** Current track being played */
  currentTrack: Track | null;
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
  /** Callback for agent actions */
  onAgentActions?: (actions: AgentAction[]) => Promise<void> | void;
  /** Callback when message is sent */
  onMessageSent?: () => void;
  /** Callback when new session is created */
  onSessionCreated?: (newSessionId: string, preservedMessages: Message[], initialMessage: string) => void;
  /** Callback to link Apple Music account */
  onLinkApple?: () => Promise<void>;
  /** Session ID that currently owns playback */
  playingSessionId?: string | null;
  /** Title of the conversation that currently owns playback */
  playingConversationTitle?: string | null;
  /** Navigate to the conversation that currently owns playback */
  onNavigateToPlayingConversation?: () => void;
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
  currentTrack,
  togglePlay,
  playbackTime,
  onSeek,
  sessionId,
  userId,
  isAppleMusicAuthorized,
  onAgentActions,
  onMessageSent,
  onSessionCreated,
  onLinkApple,
  playingSessionId,
  playingConversationTitle,
  onNavigateToPlayingConversation,
}: ChatInterfaceProps) => {
  const location = useLocation();
  const navigate = useNavigate();

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
    onAgentActions,
    onMessageSent,
    onSessionCreated,
  });

  // Note: Removed initial warning toast as connection handling is now done via overlay and actionable toasts

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
      {/* Cross-session banner — top-right corner */}
      {(() => {
        const showBanner = !showHistory && !!playingSessionId && !!sessionId && playingSessionId !== sessionId && !!playingConversationTitle;
        return (
          <div className={`absolute top-4 right-4 z-40 transition-all duration-300 ${
            showBanner ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}>
            <button
              onClick={onNavigateToPlayingConversation}
              className="group inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-black/90 hover:bg-black text-white shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-xs">
                Playing from <span className="font-semibold">{playingConversationTitle}</span>
              </span>
              <svg className="w-3.5 h-3.5 text-white/50 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        );
      })()}

      {/* Hero Stage */}
      <div className="flex-1 flex flex-col items-center justify-center relative pb-48">
        {/* Visualizer Background */}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
            <div className="w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse" />
          </div>
        )}

        {/* Record Player - Always Visible */}
        <div className="absolute inset-0 flex items-center justify-center pb-20">
          <div className="relative z-10 w-full max-w-xl px-8">
            <RecordPlayer
              currentTrack={currentTrack}
              isPaused={!isPlaying}
              togglePlay={togglePlay}
              playbackTime={playbackTime}
              onSeek={onSeek}
              isAppleMusicAuthorized={isAppleMusicAuthorized}
              onLinkApple={onLinkApple}
            />
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
        {/* Toggle Button — album art (vinyl spin when playing), fallback to icon */}
        <div className="max-w-xl mx-auto mb-2 flex justify-start">
          <button
            onClick={toggleHistory}
            className="relative w-8 h-8 rounded-full flex items-center justify-center"
            title={showHistory ? 'Back to Player' : 'View Transcript'}
          >
            {(() => {
              const attr = currentTrack ? (currentTrack.attributes || currentTrack) : null;
              const artUrl = attr
                ? ((attr as any).artwork?.url || (currentTrack as any).artworkURL || '')
                    .replace('{w}', '64').replace('{h}', '64')
                : '';
              const hasArt = !!currentTrack && !!artUrl;

              if (hasArt && showHistory) {
                // showHistory: album art visible — spinning when playing, static when paused
                return (
                  <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-200">
                    <img src={artUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                );
              }

              // No track or not showHistory — icon button
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
