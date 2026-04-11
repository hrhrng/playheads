/**
 * MessageList - Chat message list component
 *
 * Supports both regular text/tool messages and json-render GenUI specs
 * streamed via YAML. Assistant messages are checked for json-render data
 * parts using useJsonRenderMessage().
 *
 * @module components/chat/MessageList
 */

import { Renderer, type ComponentRegistry } from '@json-render/react';
import { useJsonRenderMessage, type DataPart } from '@json-render/react';
import type { UIMessage } from 'ai';
import { ToolCall } from './ToolCall';
import { ThinkingProcess } from './ThinkingProcess';
import { MarkdownMessage } from './MarkdownMessage';
import { GenUIErrorBoundary } from '../genui/GenUIErrorBoundary';
import { GenUIActionsProvider } from '../genui/GenUIContext';
import { registry } from '../../genui/registry';
import type { Message, MessagePart } from '../../types';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';

interface MessageListProps {
  messages: Message[];
  /** Raw UIMessages from AI SDK for json-render spec extraction */
  rawMessages?: UIMessage[];
  isLoading: boolean;
  queueOps?: QueueOperations | null;
}

/**
 * Renders a single assistant message bubble.
 * Extracts json-render spec from raw parts if available.
 */
function AssistantMessage({
  msg,
  rawMsg,
  isStreaming,
}: {
  msg: Message & { parts: MessagePart[] };
  rawMsg?: UIMessage;
  isStreaming: boolean;
}) {
  // Extract json-render spec from raw UIMessage parts
  const rawParts = (rawMsg?.parts || []) as DataPart[];
  const { spec, text, hasSpec } = useJsonRenderMessage(rawParts);

  // If we have a json-render spec, render it alongside text
  if (hasSpec) {
    return (
      <div className="space-y-3">
        {text && (
          <div className="text-gray-800 text-[15px] leading-relaxed">
            <MarkdownMessage content={text} />
          </div>
        )}
        <GenUIErrorBoundary>
          {/* Dark container for GenUI */}
          <div className="w-full max-w-[calc(100vw-48px)] rounded-2xl overflow-hidden animate-genui-slide-in"
            style={{ background: 'linear-gradient(160deg, #0f0f23, #1a1a3e)' }}
          >
            <div className="p-4">
              <Renderer spec={spec} registry={registry as unknown as ComponentRegistry} loading={isStreaming} />
            </div>
          </div>
        </GenUIErrorBoundary>
      </div>
    );
  }

  // Regular message — render parts in order
  return (
    <div className="space-y-3">
      {msg.parts.map((part, pIdx) => {
        if (part.type === 'text') {
          return (
            <div key={`text-${pIdx}`} className="text-gray-800 text-[15px] leading-relaxed">
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
            <ThinkingProcess key={`thinking-${pIdx}`} content={part.content} />
          );
        }
        return null;
      })}
    </div>
  );
}

export const MessageList = ({ messages, rawMessages = [], isLoading, queueOps }: MessageListProps): React.JSX.Element => {
  const isModernMessage = (message: Message): message is Message & { parts: MessagePart[] } => {
    return 'parts' in message && Array.isArray(message.parts);
  };

  const isLegacyMessage = (message: Message): message is Message & { content: string } => {
    return 'content' in message && typeof message.content === 'string';
  };

  return (
    <GenUIActionsProvider value={queueOps || null}>
      <div className="space-y-6 pb-12">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col w-full ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div className={`max-w-[90%] ${msg.role === 'user' ? 'ml-auto' : ''}`}>
              {isModernMessage(msg) ? (
                msg.role === 'user' ? (
                  // User message
                  <div className="space-y-3">
                    {msg.parts.map((part, pIdx) =>
                      part.type === 'text' ? (
                        <div
                          key={`text-${pIdx}`}
                          className="inline-block ml-auto bg-gray-100 rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed text-gray-800"
                        >
                          <MarkdownMessage content={part.content} />
                        </div>
                      ) : null
                    )}
                  </div>
                ) : (
                  // Assistant message — may contain json-render spec
                  <AssistantMessage
                    msg={msg}
                    rawMsg={rawMessages[idx]}
                    isStreaming={isLoading && idx === messages.length - 1}
                  />
                )
              ) : isLegacyMessage(msg) ? (
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
    </GenUIActionsProvider>
  );
};
