
import { useLocation, useNavigate } from '@tanstack/react-router';
import { RecordPlayer } from './RecordPlayer';
import { NewChatView } from './NewChatView';
import { SkeletonLoader } from './SkeletonLoader';
import { ChatInput } from './chat/ChatInput';
import { TranscriptOverlay } from './chat/TranscriptOverlay';
import { useChat } from '../hooks/useChat';
import { useInitialMessage } from '../hooks/useChatHelpers';
import { SyncTrack } from '../hooks/useAppleMusic';
import { Message } from '../store/chatStore';

interface ChatInterfaceProps {
  isDJSpeaking: boolean;
  isPlaying: boolean;
  currentTrack: SyncTrack | null;
  togglePlay: () => void;
  playbackTime: { current: number; total: number };
  onSeek: (time: number | number[]) => void;
  sessionId: string | null;
  userId: string | null;
  onAgentActions?: (actions: any[]) => Promise<void>;
  onMessageSent?: () => void;
  onSessionCreated?: (newSessionId: string, preservedMessages: Message[], initialMessage: string) => void;
  isNewChat?: boolean;
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
  onAgentActions,
  onMessageSent,
  onSessionCreated,
  isNewChat = false
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
  } = useChat(sessionId, userId, isNewChat, onAgentActions, onMessageSent, onSessionCreated);

  // Auto-send initial message from navigation state
  // Cast state to unknown then to expected type because TanStack Router state is unknown
  const state = location.state as { initialMessage?: string; isNewlyCreated?: boolean } | undefined;

  useInitialMessage(
    state?.initialMessage,
    state?.isNewlyCreated,
    sendMessage,
    isLoading,
    messages
  );

  // Show loading skeleton while fetching history
  if (isLoadingHistory) {
    return <SkeletonLoader />;
  }

  // Show new chat view for empty new chats
  if (messages.length === 0 && isNewChat) {
    return (
      <NewChatView
        onSend={(msg) => sendMessage(msg)}
        isDJSpeaking={isDJSpeaking}
        isPlaying={isPlaying}
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

        {/* Record Player - Always Visible */}
        <div className="absolute inset-0 flex items-center justify-center pb-20">
          <div className="relative z-10 w-full max-w-xl px-8">
            <RecordPlayer
              currentTrack={currentTrack}
              isPaused={!isPlaying}
              togglePlay={togglePlay}
              playbackTime={playbackTime}
              onSeek={onSeek}
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
      <div className="absolute bottom-0 left-0 right-0 p-6 pt-8 z-30 bg-gradient-to-t from-white via-white/95 to-transparent">
        {/* Toggle History Button */}
        <div className="max-w-3xl mx-auto mb-3 flex justify-start">
          <button
            onClick={toggleHistory}
            className={`p-2.5 rounded-full bg-white shadow-md border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all ${
              showHistory ? 'text-blue-600 border-blue-200' : ''
            }`}
            title={showHistory ? 'Back to Player' : 'View Transcript'}
          >
            {showHistory ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 10l12-3" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Input Bar */}
        <ChatInput
          input={input}
          isLoading={isLoading}
          isDJSpeaking={isDJSpeaking}
          isPlaying={isPlaying}
          onInputChange={setInput}
          onSend={() => sendMessage(input)}
        />

        <div className="text-center mt-3 text-[10px] text-gray-300 font-mono tracking-widest uppercase">
          Playhead Radio &bull; Live
        </div>
      </div>
    </div>
  );
};
