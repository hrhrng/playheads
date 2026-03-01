/**
 * Chat store - manages chat state, messages, and backend communication
 * @module store/chatStore
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import { API_BASE } from '../config/api';
import type {
  Message,
  MessagePart,
  AgentAction,
  SSETextEvent,
  SSEThinkingEvent,
  SSEToolStartEvent,
  SSEToolEndEvent,
  SSEDoneEvent,
  SSEActionEvent
} from '../types';

interface ChatStore {
  // State
  messages: Message[];
  input: string;
  isLoading: boolean;
  isLoadingHistory: boolean;
  showHistory: boolean;
  sessionId: string | null;
  userId: string | null;

  // Actions
  setInput: (input: string) => void;
  setShowHistory: (show: boolean) => void;
  toggleHistory: () => void;
  initialize: (sessionId: string | null, userId: string) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  loadHistory: (sessionId: string, userId: string) => Promise<LoadHistoryStatus>;
  sendMessage: (
    messageText: string,
    onAgentActions?: (actions: AgentAction[]) => Promise<void> | void,
    onMessageSent?: () => void,
  ) => Promise<void>;
  addUserMessage: (messageText: string) => void;
  handleStreamingResponse: (
    response: Response,
    onAgentActions?: (actions: AgentAction[]) => Promise<void> | void,
  ) => Promise<void>;
  createSession: (userId: string) => Promise<string>;
  reset: () => void;
}

type LoadHistoryStatus = 'success' | 'not_found' | 'error';

/**
 * Chat store - manages chat state, messages, and backend communication
 */
export const useChatStore = create<ChatStore>((set, get) => ({
  // State
  messages: [],
  input: '',
  isLoading: false,
  isLoadingHistory: false,
  showHistory: false,
  sessionId: null,
  userId: null,

  // Actions
  setInput: (input: string) => set({ input }),

  setShowHistory: (show: boolean) => set({ showHistory: show }),

  toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),

  /**
   * Initialize chat with session and user info
   */
  initialize: (sessionId: string | null, userId: string) => {
    const current = get();
    // Only clear messages if switching to a DIFFERENT session
    if (current.sessionId !== sessionId) {
      set({ sessionId, userId, messages: [], isLoading: false, isLoadingHistory: false });
    } else {
      // Just update userId if needed, but preserve messages
      set({ userId });
    }
  },

  /**
   * Set messages directly (used for navigation state restore)
   */
  setMessages: (messages: Message[]) => set({ messages }),

  /**
   * Add a single message to the chat
   */
  addMessage: (message: Message) => set((state) => ({
    messages: [...state.messages, message]
  })),

  /**
   * Update the last message (used for streaming)
   */
  updateLastMessage: (content: string) => set((state) => {
    const messages = [...state.messages];
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      messages[messages.length - 1] = {
        ...lastMessage,
        content
      } as Message;
    }
    return { messages };
  }),

  /**
   * Load chat history from backend
   */
  loadHistory: async (sessionId: string, userId: string): Promise<LoadHistoryStatus> => {
    if (!sessionId) {
      set({ messages: [], isLoadingHistory: false });
      return 'success';
    }

    set({ isLoadingHistory: true });
    try {
      const url = userId
        ? `${API_BASE}/state?session_id=${sessionId}&user_id=${userId}`
        : `${API_BASE}/state?session_id=${sessionId}`;

      const res = await fetch(url);

      if (res.ok) {
        const data = await res.json();
        const messages = (data.chat_history || []).map((m: any): Message => {
          // Support both new format (parts) and old format (content)
          if (m.parts && Array.isArray(m.parts)) {
            return {
              role: m.role,
              parts: m.parts
            };
          } else {
            return {
              role: m.role,
              content: m.content || ''
            };
          }
        });
        set({ messages, sessionId });
        return 'success';
      } else if (res.status === 404) {
        set({ messages: [] });
        return 'not_found';
      } else {
        set({ messages: [] });
        return 'error';
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
      set({ messages: [] });
      return 'error';
    } finally {
      set({ isLoadingHistory: false });
    }
  },

  /**
   * Send a message with streaming response.
   *
   * The agent graph always completes in a single pass — tools emit MusicKit
   * actions as fire-and-forget SSE events, no interrupt/resume needed.
   */
  sendMessage: async (
    messageText: string,
    onAgentActions?: (actions: AgentAction[]) => Promise<void> | void,
    onMessageSent?: () => void,
  ): Promise<void> => {
    const { userId, sessionId, isLoading } = get();

    if (!messageText.trim() || isLoading) return;

    if (!userId) {
      console.error('Missing user ID');
      toast.error('Authentication required', {
        description: 'Please refresh the page and sign in again'
      });
      return;
    }

    set({ isLoading: true, input: '' });

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          session_id: sessionId,
          user_id: userId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await get().handleStreamingResponse(response, onAgentActions);

      // Refresh conversation list after the turn completes
      if (onMessageSent) {
        onMessageSent();
      }
    } catch (error) {
      console.error('Chat error:', error);
      set((state) => ({
        messages: [...state.messages, {
          role: 'agent' as const,
          content: 'Sorry, I had trouble connecting. Try again? 🎧'
        } as Message]
      }));
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      toast.error('Failed to send message', {
        description: errorMessage,
        action: {
          label: 'Retry',
          onClick: () => {
            get().sendMessage(messageText, onAgentActions, onMessageSent);
          }
        }
      });
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Add user message to chat (call this before sendMessage for immediate UI update)
   */
  addUserMessage: (messageText: string) => {
    set((state) => ({
      messages: [...state.messages, { role: 'user' as const, content: messageText } as Message]
    }));
  },

  /**
   * Handle streaming SSE response from backend.
   *
   * The graph always completes in a single pass — no interrupt/resume needed.
   */
  handleStreamingResponse: async (
    response: Response,
    onAgentActions?: (actions: AgentAction[]) => Promise<void> | void,
  ): Promise<void> => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    let currentParts: MessagePart[] = [];
    const toolCallsMap = new Map<string, MessagePart & { type: 'tool_call' }>();
    let agentMessageAdded = false;

    let actions: AgentAction[] = [];
    let currentEvent: string | null = null;
    let currentData = '';

    // Helper: update the current agent message in store
    const updateMessage = (): void => {
      set((state) => {
        if (!agentMessageAdded) {
          agentMessageAdded = true;
          return {
            messages: [
              ...state.messages,
              { role: 'agent', parts: JSON.parse(JSON.stringify(currentParts)) }
            ]
          };
        } else {
          const messages = [...state.messages];
          messages[messages.length - 1] = {
            role: 'agent',
            parts: JSON.parse(JSON.stringify(currentParts))
          };
          return { messages };
        }
      });
    };

    // Line buffer: accumulates partial lines across TCP chunks to handle
    // fragmentation — a chunk boundary can land mid-line, so we only
    // process complete lines (terminated by '\n').
    let lineBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        // The last element may be an incomplete line — keep it in the buffer
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          // Parse SSE format: event: <type>\ndata: <json>
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6).trim();

            if (!currentData || !currentEvent) continue;

            try {
              const data = JSON.parse(currentData);

              switch (currentEvent) {
                case 'text': {
                  const lastPart = currentParts[currentParts.length - 1];
                  if (lastPart && lastPart.type === 'text') {
                    (lastPart as { type: 'text'; content: string }).content += (data as SSETextEvent).content;
                  } else {
                    currentParts.push({ type: 'text', content: (data as SSETextEvent).content });
                  }
                  updateMessage();
                  break;
                }

                case 'thinking': {
                  currentParts.push({ type: 'thinking', content: (data as SSEThinkingEvent).content });
                  updateMessage();
                  break;
                }

                case 'tool_start': {
                  const toolStartData = data as SSEToolStartEvent;
                  if (!toolStartData.tool_name || !toolStartData.tool_name.trim()) {
                    console.warn('[WARN] Skipping malformed tool_start:', data);
                    break;
                  }

                  // Dedup: update existing tool call if it exists
                  const existingToolCall = currentParts.find(
                    p => p.type === 'tool_call' && (p as { id: string }).id === toolStartData.id
                  ) as { id: string; tool_name: string; args: Record<string, unknown>; status: string } | undefined;

                  if (existingToolCall) {
                    if (toolStartData.args && Object.keys(toolStartData.args).length > 0) {
                      existingToolCall.args = toolStartData.args;
                      updateMessage();
                    }
                    break;
                  }

                  const toolCall: MessagePart & { type: 'tool_call' } = {
                    type: 'tool_call',
                    id: toolStartData.id,
                    tool_name: toolStartData.tool_name,
                    args: toolStartData.args,
                    status: 'pending'
                  };
                  toolCallsMap.set(toolStartData.id, toolCall);
                  currentParts.push(toolCall);
                  updateMessage();
                  break;
                }

                case 'tool_end': {
                  const toolEndData = data as SSEToolEndEvent;
                  const toolCall = toolCallsMap.get(toolEndData.id);
                  if (toolCall) {
                    toolCall.result = toolEndData.result;
                    toolCall.status = toolEndData.status;
                    updateMessage();
                  }
                  break;
                }

                case 'action': {
                  // Execute MusicKit action immediately — awaited to ensure ordering
                  const actionData = data as SSEActionEvent;
                  if (onAgentActions) {
                    try {
                      await onAgentActions([{
                        type: actionData.type,
                        data: actionData.data
                      }]);
                    } catch (err) {
                      console.error('Error executing real-time action:', err);
                    }
                  }
                  break;
                }

                case 'done': {
                  const doneData = data as SSEDoneEvent;
                  if (doneData.actions && doneData.actions.length > 0) {
                    actions = doneData.actions;
                  }
                  break;
                }

                default:
                  console.warn('Unknown SSE event type:', currentEvent);
              }

              currentEvent = null;
              currentData = '';
            } catch (e) {
              // JSON parse failed — likely a corrupted/partial frame, reset SSE state
              console.error('Failed to parse SSE data:', e, currentData);
              currentEvent = null;
              currentData = '';
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      if (currentParts.length === 0) {
        set((state) => ({
          messages: [...state.messages, {
            role: 'agent' as const,
            parts: [{
              type: 'text',
              content: 'Sorry, I had trouble with the streaming response. Try again? 🎧'
            }]
          } as Message]
        }));
      }
    } finally {
      set({ isLoading: false });

      // Execute batched actions from the "done" event (legacy path)
      if (actions.length > 0 && onAgentActions) {
        await onAgentActions(actions);
      }
    }
  },

  /**
   * Create a new session
   */
  createSession: async (userId: string): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });

      if (!res.ok) {
        throw new Error('Failed to create session');
      }

      const { session_id } = await res.json() as { session_id: string };
      set({ sessionId: session_id, messages: [] });
      return session_id;
    } catch (error) {
      console.error('Session creation error:', error);
      throw error;
    }
  },

  /**
   * Reset chat state
   */
  reset: () => set({
    messages: [],
    input: '',
    isLoading: false,
    isLoadingHistory: false,
    showHistory: false,
    sessionId: null
  })
}));
