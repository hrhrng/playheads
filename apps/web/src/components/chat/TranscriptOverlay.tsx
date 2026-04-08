/**
 * TranscriptOverlay - Chat transcript overlay component
 * @module components/chat/TranscriptOverlay
 */

import { useAutoScroll } from '../../hooks/useChatHelpers';
import { MessageList } from './MessageList';
import type { Message } from '../../types';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';

interface TranscriptOverlayProps {
  /** Array of chat messages */
  messages: Message[];
  /** Whether content is currently loading */
  isLoading: boolean;
  /** Whether to show the history overlay */
  showHistory: boolean;
  /** Queue operations for GenUI interactive components */
  queueOps?: QueueOperations | null;
}

/**
 * TranscriptOverlay - overlay showing chat transcript
 */
export const TranscriptOverlay = ({
  messages,
  isLoading,
  showHistory,
  queueOps,
}: TranscriptOverlayProps): React.JSX.Element => {
  const endRef = useAutoScroll(messages);

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-start pt-12 pb-4 bg-white/60 backdrop-blur-xl transition-opacity duration-500 ease-out ${
        showHistory ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="w-full px-6 overflow-y-auto no-scrollbar pb-44 pt-8">
      <div className="max-w-xl mx-auto">
        <MessageList messages={messages} isLoading={isLoading} queueOps={queueOps} />
        <div ref={endRef} />
      </div>
      </div>
    </div>
  );
};
