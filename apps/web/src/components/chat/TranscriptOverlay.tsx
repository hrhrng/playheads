/**
 * TranscriptOverlay - Chat transcript overlay component
 * @module components/chat/TranscriptOverlay
 */

import type { CSSProperties } from 'react';
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
  storefront?: string;
  playTrackById?: (trackId: string) => Promise<void>;
}

export const TranscriptOverlay = ({
  messages,
  rawMessages,
  isLoading,
  showHistory,
  queueOps,
  storefront,
  playTrackById,
}: TranscriptOverlayProps): React.JSX.Element => {
  const endRef = useAutoScroll(messages);

  // Horizontal gradient mask instead of a solid bg-page/60 scrim: dark
  // in the center, fading to the page bg at the left/right edges so the
  // overlay's edges match the playlist's 12px outer padding (which is
  // just raw page bg). Eliminates the visible color-gap band between
  // the chat panel and the playlist glass card.
  const maskStyle: CSSProperties = {
    backgroundImage:
      'linear-gradient(to right, transparent 0, rgb(var(--page) / 0.7) 64px, rgb(var(--page) / 0.7) calc(100% - 64px), transparent 100%)',
  };

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-start pt-12 pb-4 backdrop-blur-glass transition-opacity duration-500 ease-out ${
        showHistory ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      style={maskStyle}
    >
      <div className="w-full px-6 overflow-y-auto no-scrollbar pb-44 pt-8">
      <div className="max-w-xl mx-auto">
        <MessageList messages={messages} rawMessages={rawMessages} isLoading={isLoading} queueOps={queueOps} storefront={storefront} playTrackById={playTrackById} />
        <div ref={endRef} />
      </div>
      </div>
    </div>
  );
};
