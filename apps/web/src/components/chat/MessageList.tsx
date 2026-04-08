/**
 * MessageList - Chat message list component
 * @module components/chat/MessageList
 */

import { ToolCall } from './ToolCall';
import { ThinkingProcess } from './ThinkingProcess';
import { MarkdownMessage } from './MarkdownMessage';
import { GenUIContainer, GenUILoadingSkeleton } from '../genui';
import { GenUIErrorBoundary } from '../genui/GenUIErrorBoundary';
import type { Message, MessagePart } from '../../types';
import type { GenUIPayload } from '../../types/genui';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';

interface MessageListProps {
  /** Array of messages to display */
  messages: Message[];
  /** Whether a new message is currently loading */
  isLoading: boolean;
  /** Queue operations for GenUI interactive components */
  queueOps?: QueueOperations | null;
}

/**
 * MessageList - 紧凑简洁的消息列表
 *
 * 设计理念：
 * - Agent消息grouped在一个统一的container里
 * - text 部分保持大字体
 * - tool_call 和 thinking 紧凑展示在同一个block
 */
export const MessageList = ({ messages, isLoading, queueOps }: MessageListProps): React.JSX.Element => {
  /**
   * Type guard to check if message uses modern parts format
   */
  const isModernMessage = (message: Message): message is Message & { parts: MessagePart[] } => {
    return 'parts' in message && Array.isArray(message.parts);
  };

  /**
   * Type guard to check if message uses legacy content format
   */
  const isLegacyMessage = (message: Message): message is Message & { content: string } => {
    return 'content' in message && typeof message.content === 'string';
  };

  return (
    <div className="space-y-6 pb-12">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex flex-col w-full ${
            msg.role === 'user' ? 'items-end' : 'items-start'
          }`}
        >
          {/* Unified message container */}
          <div className={`max-w-[90%] ${msg.role === 'user' ? 'ml-auto' : ''}`}>
            {isModernMessage(msg) ? (
              // New format: render parts in chronological order
              <div className="space-y-3">
                {msg.parts.map((part, pIdx) => {
                  // Render each part in order
                  if (part.type === 'text') {
                    return msg.role === 'user' ? (
                      <div
                        key={`text-${pIdx}`}
                        className="inline-block ml-auto bg-gray-100 rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed text-gray-800"
                      >
                        <MarkdownMessage content={part.content} />
                      </div>
                    ) : (
                      <div
                        key={`text-${pIdx}`}
                        className="text-gray-800 text-[15px] leading-relaxed"
                      >
                        <MarkdownMessage content={part.content} />
                      </div>
                    );
                  } else if (part.type === 'tool_call') {
                    // GenUI: detect _genui marker in tool result
                    const isGenUI = part.result &&
                      typeof part.result === 'object' &&
                      '_genui' in (part.result as Record<string, unknown>);

                    if (isGenUI && part.status === 'success') {
                      const payload = part.result as { data: GenUIPayload };
                      return (
                        <GenUIErrorBoundary key={`genui-${part.id}-${pIdx}`}>
                          <GenUIContainer
                            data={payload.data}
                            queueOps={queueOps}
                          />
                        </GenUIErrorBoundary>
                      );
                    }

                    if (isGenUI && part.status === 'pending') {
                      return <GenUILoadingSkeleton key={`genui-skel-${pIdx}`} />;
                    }

                    return (
                      <ToolCall
                        key={`tool-${part.id}-${pIdx}`}
                        id={part.id}
                        tool_name={part.tool_name}
                        args={part.args}
                        result={part.result}
                        status={part.status}
                      />
                    );
                  } else if (part.type === 'thinking') {
                    return (
                      <ThinkingProcess
                        key={`thinking-${pIdx}`}
                        content={part.content}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            ) : isLegacyMessage(msg) ? (
              // Old format: backward compatibility
              <div
                className={`text-[15px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'inline-block ml-auto bg-gray-100 rounded-2xl rounded-br-md px-4 py-2.5 text-gray-800'
                    : 'text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            ) : null}
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex items-start">
          <span className="text-sm text-blue-600 font-medium animate-pulse tracking-widest">
            ON AIR...
          </span>
        </div>
      )}
    </div>
  );
};
