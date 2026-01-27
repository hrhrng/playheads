/**
 * MessageList - Chat message list component
 * @module components/chat/MessageList
 */

import { ToolCall } from './ToolCall';
import { ThinkingProcess } from './ThinkingProcess';
import { MarkdownMessage } from './MarkdownMessage';
import type { Message, MessagePart } from '../../types';

interface MessageListProps {
  /** Array of messages to display */
  messages: Message[];
  /** Whether a new message is currently loading */
  isLoading: boolean;
}

/**
 * MessageList - 紧凑简洁的消息列表
 *
 * 设计理念：
 * - Agent消息grouped在一个统一的container里
 * - text 部分保持大字体
 * - tool_call 和 thinking 紧凑展示在同一个block
 */
export const MessageList = ({ messages, isLoading }: MessageListProps): React.JSX.Element => {
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
          <span className="text-[10px] text-gray-500 mb-1 px-1 uppercase tracking-wider font-semibold">
            {msg.role === 'agent' ? 'DJ' : 'You'}
          </span>

          {/* Unified message container */}
          <div className="w-full max-w-[90%]">
            {isModernMessage(msg) ? (
              // New format: render parts in chronological order
              <div className="space-y-3">
                {msg.parts.map((part, pIdx) => {
                  // Render each part in order
                  if (part.type === 'text') {
                    return (
                      <div
                        key={`text-${pIdx}`}
                        className={
                          msg.role === 'user'
                            ? 'text-gray-600 text-right italic text-2xl md:text-3xl'
                            : 'text-gray-900 text-2xl md:text-3xl'
                        }
                      >
                        <MarkdownMessage content={part.content} />
                      </div>
                    );
                  } else if (part.type === 'tool_call') {
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
                className={`text-2xl md:text-3xl font-medium leading-relaxed ${
                  msg.role === 'user'
                    ? 'text-gray-600 text-right italic'
                    : 'text-gray-900'
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
