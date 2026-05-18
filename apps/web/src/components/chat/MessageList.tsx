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
import { useMemo, useState, useEffect } from 'react';
import { ToolCall } from './ToolCall';
import { ThinkingProcess } from './ThinkingProcess';
import { MarkdownMessage } from './MarkdownMessage';
import { GenUIErrorBoundary } from '../genui/GenUIErrorBoundary';
import { GenUIProvider } from '../genui/GenUIContext';
import { ShareableCard } from '../genui/ShareableCard';
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
  rawMessages?: UIMessage[];
  isLoading: boolean;
  queueOps?: QueueOperations | null;
  storefront?: string;
  playTrackById?: (trackId: string) => Promise<void>;
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

  // Render all parts (tool calls, thinking) + GenUI spec if present
  // Agent voice: transparent surface with a 2px ink rule on the left, ink prose.
  return (
    <div className="space-y-3 pl-4 border-l-2 border-ink/25">
      {/* Tool calls and thinking — always render from mapped parts */}
      {msg.parts.map((part, pIdx) => {
        if (part.type === 'text') {
          // If we have a spec, use the text extracted by json-render (strips yaml fence)
          // Otherwise use the raw text part
          if (hasSpec) return null; // text rendered separately below
          return (
            <div key={`text-${pIdx}`} className="text-ink text-[15px] leading-relaxed">
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

      {/* GenUI spec — rendered after tool calls */}
      {hasSpec && spec && (
        <>
          {text && (
            <div className="text-ink text-[15px] leading-relaxed">
              <MarkdownMessage content={text} />
            </div>
          )}
          <GenUIErrorBoundary>
            <ShareableCard>
              <JSONUIProvider registry={registry as unknown as ComponentRegistry} initialState={(spec as any)?.state ?? {}}>
                <Renderer spec={spec} registry={registry as unknown as ComponentRegistry} loading={isStreaming} />
              </JSONUIProvider>
            </ShareableCard>
          </GenUIErrorBoundary>
        </>
      )}
    </div>
  );
}

export const MessageList = ({ messages, rawMessages = [], isLoading, queueOps, storefront = 'us', playTrackById }: MessageListProps): React.JSX.Element => {
  // Lightbox state for clicking an inline image attachment.
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    if (!viewerUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerUrl(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerUrl]);

  const isModernMessage = (message: Message): message is Message & { parts: MessagePart[] } => {
    return 'parts' in message && Array.isArray(message.parts);
  };

  const isLegacyMessage = (message: Message): message is Message & { content: string } => {
    return 'content' in message && typeof message.content === 'string';
  };

  return (
    <GenUIProvider queueOps={queueOps || null} storefront={storefront} playTrackById={playTrackById}>
      <div className="space-y-5 pb-12">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col w-full ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div className={`${msg.role === 'user' ? 'max-w-[76%] ml-auto' : 'w-full'}`}>
              {isModernMessage(msg) ? (
                msg.role === 'user' ? (
                  // User message. Image parts use the same 64px thumbnail as
                  // the ChatInput attachment preview; click to view full-size.
                  (() => {
                    const imageParts = msg.parts.filter((p) => p.type === 'image') as Array<{ type: 'image'; url: string; mediaType: string; filename?: string }>;
                    const textParts = msg.parts.filter((p) => p.type === 'text') as Array<{ type: 'text'; content: string }>;
                    return (
                      <div className="space-y-2 flex flex-col items-end">
                        {imageParts.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-2">
                            {imageParts.map((part, pIdx) => (
                              <button
                                key={`img-${pIdx}`}
                                type="button"
                                onClick={() => setViewerUrl(part.url)}
                                className="block focus:outline-none focus:ring-2 focus:ring-accent/60 rounded-card"
                                aria-label={part.filename || 'open image'}
                              >
                                <img
                                  src={part.url}
                                  alt={part.filename || 'attachment'}
                                  className="w-16 h-16 object-cover rounded-card hairline"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                        {textParts.map((part, pIdx) => (
                          <div
                            key={`text-${pIdx}`}
                            className="inline-block bg-chip-2 hairline rounded-3xl rounded-br-lg px-4 py-2.5 text-[15px] leading-relaxed text-ink"
                          >
                            <MarkdownMessage content={part.content} />
                          </div>
                        ))}
                      </div>
                    );
                  })()
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
                      ? 'inline-block ml-auto bg-chip-2 hairline rounded-3xl rounded-br-lg px-4 py-2.5 text-ink'
                      : 'text-ink pl-4 border-l-2 border-ink/25'
                  }`}
                >
                  {msg.content}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start pl-4 border-l-2 border-ink/25">
            <span className="text-[13px] text-ink-2 font-semibold animate-pulse tracking-widest">
              ON AIR...
            </span>
          </div>
        )}
      </div>

      {/* Image lightbox — full-screen overlay, click backdrop or press Escape to close */}
      {viewerUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
          onClick={() => setViewerUrl(null)}
        >
          <img
            src={viewerUrl}
            alt=""
            className="max-w-full max-h-full object-contain rounded-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setViewerUrl(null)}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-ink/15 hover:bg-ink/25 text-ink flex items-center justify-center"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </GenUIProvider>
  );
};
