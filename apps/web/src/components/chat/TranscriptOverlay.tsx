/**
 * TranscriptOverlay - Chat transcript overlay component
 * @module components/chat/TranscriptOverlay
 */

import { useAutoScroll } from '../../hooks/useChatHelpers';
import { MessageList } from './MessageList';
import type { UIMessage } from 'ai';
import type { Message } from '../../types';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';

interface TranscriptOverlayProps {
  messages: Message[];
  rawMessages?: UIMessage[];
  isLoading: boolean;
  showHistory: boolean;
  queueOps?: QueueOperations | null;
}

export const TranscriptOverlay = ({
  messages,
  rawMessages,
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
        <MessageList messages={messages} rawMessages={rawMessages} isLoading={isLoading} queueOps={queueOps} />
        <div ref={endRef} />
      </div>
      </div>
    </div>
  );
};
