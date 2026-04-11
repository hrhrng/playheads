/**
 * MessageList - Chat message list component
 *
 * Supports both regular text/tool messages and json-render GenUI specs
 * streamed via YAML. Assistant messages are checked for json-render data
 * parts using useJsonRenderMessage().
 *
 * @module components/chat/MessageList
 */

import { Renderer, JSONUIProvider, type ComponentRegistry, type Spec } from '@json-render/react';
import { useJsonRenderMessage, type DataPart } from '@json-render/react';
import type { UIMessage } from 'ai';
import { useMemo } from 'react';
import { ToolCall } from './ToolCall';
import { ThinkingProcess } from './ThinkingProcess';
import { MarkdownMessage } from './MarkdownMessage';
import { GenUIErrorBoundary } from '../genui/GenUIErrorBoundary';
import { GenUIActionsProvider } from '../genui/GenUIContext';
import { registry } from '../../genui/registry';
import type { Message, MessagePart } from '../../types';

/**
 * Normalize a json-render spec:
 * 1. Every element gets `props: {}` and `children: []` if missing
 * 2. If `root` doesn't exist in `elements`, synthesize a wrapper that
 *    references all top-level elements as children
 */
function normalizeSpec(spec: Spec | null): Spec | null {
  if (!spec?.elements) return spec;
  const elements: Record<string, unknown> = {};
  for (const [key, el] of Object.entries(spec.elements)) {
    const element = el as unknown as Record<string, unknown> | null;
    if (!element) continue;
    elements[key] = {
      ...element,
      props: element.props ?? {},
      children: element.children ?? [],
    };
  }

  // If root element doesn't exist, synthesize one wrapping all top-level elements
  const root = spec.root;
  if (root && !elements[root]) {
    // Collect all element keys that are NOT referenced as children of others
    const referencedAsChild = new Set<string>();
    for (const el of Object.values(elements)) {
      const children = (el as Record<string, unknown>).children;
      if (Array.isArray(children)) {
        for (const c of children) {
          if (typeof c === 'string') referencedAsChild.add(c);
        }
      }
    }
    const topLevel = Object.keys(elements).filter(k => !referencedAsChild.has(k));
    elements[root] = {
      type: 'Section',
      props: { title: null, subtitle: null },
      children: topLevel,
    };
  }

  return { ...spec, elements: elements as Spec['elements'] };
}
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
  const { spec: rawSpec, text, hasSpec } = useJsonRenderMessage(rawParts);

  // Normalize spec: ensure every element has props and children
  const spec = useMemo(() => normalizeSpec(rawSpec), [rawSpec]);

  // If we have a json-render spec, render it alongside text
  if (hasSpec && spec) {
    return (
      <div className="space-y-3">
        {text && (
          <div className="text-gray-800 text-[15px] leading-relaxed">
            <MarkdownMessage content={text} />
          </div>
        )}
        <GenUIErrorBoundary>
          <div className="w-full max-w-[calc(100vw-48px)] rounded-2xl border border-gray-200 bg-white overflow-hidden animate-genui-slide-in shadow-sm">
            <div className="p-4">
              <JSONUIProvider registry={registry as unknown as ComponentRegistry}>
                <Renderer spec={spec} registry={registry as unknown as ComponentRegistry} loading={isStreaming} />
              </JSONUIProvider>
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
