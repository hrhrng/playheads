/**
 * TranscriptOverlay - Chat transcript overlay component
 * @module components/chat/TranscriptOverlay
 */

import { useAutoScroll } from '../../hooks/useChatHelpers';
import { MessageList } from './MessageList';
import type { Message } from '../../types';

interface TranscriptOverlayProps {
  /** Array of chat messages */
  messages: Message[];
  /** Whether content is currently loading */
  isLoading: boolean;
  /** Whether to show the history overlay */
  showHistory: boolean;
}

/**
 * TranscriptOverlay - overlay showing chat transcript
 */
export const TranscriptOverlay = ({
  messages,
  isLoading,
  showHistory
}: TranscriptOverlayProps): React.JSX.Element => {
  const endRef = useAutoScroll(messages);

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-start pt-12 pb-4 bg-white/60 backdrop-blur-xl transition-opacity duration-500 ease-out ${
        showHistory ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">
        Studio Transcript
      </h3>

      <div className="w-full max-w-2xl px-6 overflow-y-auto no-scrollbar pb-40">
        <MessageList messages={messages} isLoading={isLoading} />
        <div ref={endRef} />
      </div>
    </div>
  );
};
