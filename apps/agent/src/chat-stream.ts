import { createUIMessageStream, type UIMessage } from 'ai';

/** Stream boundary shared by initial responses and client-tool continuations. */
export function createChatStream(messages: UIMessage[], options: Parameters<typeof createUIMessageStream>[0]) {
  return createUIMessageStream({ ...options, originalMessages: messages });
}
