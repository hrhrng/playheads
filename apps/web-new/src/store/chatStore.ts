
import { create } from 'zustand';

const API_BASE = 'http://localhost:8000';

export type MessageRole = 'user' | 'agent' | 'system';

export interface TextPart {
  type: 'text';
  content: string;
}

export interface ThinkingPart {
  type: 'thinking';
  content: string;
}

export interface ToolCallPart {
  type: 'tool_call';
  id: string;
  tool_name: string;
  args: Record<string, any>;
  result?: any;
  status: 'pending' | 'success' | 'error';
}

export type MessagePart = TextPart | ThinkingPart | ToolCallPart;

export interface Message {
  role: MessageRole;
  content?: string; // Legacy support or simple text
  parts?: MessagePart[];
}

interface ChatState {
  messages: Message[];
  input: string;
  isLoading: boolean;
  isLoadingHistory: boolean;
  showHistory: boolean;
  sessionId: string | null;
  userId: string | null;
}

interface ChatActions {
  setInput: (input: string) => void;
  setShowHistory: (show: boolean) => void;
  toggleHistory: () => void;
  initialize: (sessionId: string, userId: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  loadHistory: (sessionId: string, userId: string | null) => Promise<'success' | 'not_found' | 'error'>;
  sendMessage: (
    messageText: string,
    onAgentActions?: (actions: any[]) => Promise<void>,
    onMessageSent?: () => void,
    skipAddingUserMessage?: boolean
  ) => Promise<void>;
  addUserMessage: (messageText: string) => void;
  handleStreamingResponse: (response: Response, onAgentActions?: (actions: any[]) => Promise<void>) => Promise<void>;
  createSession: (userId: string) => Promise<string>;
  reset: () => void;
}

type ChatStore = ChatState & ChatActions;

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
  setInput: (input) => set({ input }),

  setShowHistory: (show) => set({ showHistory: show }),

  toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),

  /**
   * Initialize chat with session and user info
   */
  initialize: (sessionId, userId) => {
    const current = get();
    // Only clear messages if switching to a DIFFERENT session
    if (current.sessionId !== sessionId) {
      set({ sessionId, userId, messages: [] });
    } else {
      // Just update userId if needed, but preserve messages
      set({ userId });
    }
  },

  /**
   * Set messages directly (used for navigation state restore)
   */
  setMessages: (messages) => set({ messages }),

  /**
   * Add a single message to the chat
   */
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),

  /**
   * Update the last message (used for streaming)
   */
  updateLastMessage: (content) => set((state) => {
    const messages = [...state.messages];
    if (messages.length > 0) {
      messages[messages.length - 1] = {
        ...messages[messages.length - 1],
        content
      };
    }
    return { messages };
  }),

  /**
   * Load chat history from backend
   */
  loadHistory: async (sessionId, userId) => {
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
        const messages: Message[] = (data.chat_history || []).map((m: any) => {
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
   * Send a message with streaming response
   * NOTE: User message should be added BEFORE calling this (use addUserMessage)
   */
  sendMessage: async (messageText, onAgentActions, onMessageSent, skipAddingUserMessage = false) => {
    const { userId, sessionId, isLoading } = get();

    if (!messageText.trim() || isLoading) return;

    if (!userId) {
      console.error('Missing user ID');
      alert('Unable to send message: User not authenticated. Please refresh the page.');
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

      // Handle streaming response
      await get().handleStreamingResponse(response, onAgentActions);

      // Refresh conversation list
      if (onMessageSent) {
        onMessageSent();
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      set((state) => ({
        messages: [...state.messages, {
          role: 'agent',
          content: 'Sorry, I had trouble connecting. Try again? 🎧'
        }]
      }));
      alert(`Failed to send message: ${error.message || 'Network error'}. Please check your connection.`);
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Add user message to chat (call this before sendMessage for immediate UI update)
   */
  addUserMessage: (messageText) => {
    set((state) => ({
      messages: [...state.messages, { role: 'user', content: messageText }]
    }));
  },

  /**
   * Handle streaming SSE response from backend (Enhanced with parts support)
   */
  handleStreamingResponse: async (response, onAgentActions) => {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // Track current message parts
    let currentParts: MessagePart[] = [];
    const toolCallsMap = new Map<string, ToolCallPart>();  // id -> tool_call object
    let actions: any[] = [];
    let agentMessageAdded = false;
    let currentEvent: string | null = null;
    let currentData = '';

    // Helper function to update the current message in store
    const updateMessage = () => {
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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          // Parse SSE format: event: <type>\ndata: <json>
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6).trim();

            if (!currentData || !currentEvent) continue;

            try {
              const data = JSON.parse(currentData);

              // Handle different event types
              switch (currentEvent) {
                case 'text': {
                  // Text content - append to last part if it's text, otherwise create new part
                  // This ensures chronological order: text -> tool_call -> text
                  const lastPart = currentParts[currentParts.length - 1];

                  if (lastPart && lastPart.type === 'text') {
                    // Continue appending to the current text part
                    lastPart.content += data.content;
                  } else {
                    // Create a new text part (after tool_call or thinking)
                    currentParts.push({ type: 'text', content: data.content });
                  }
                  updateMessage();
                  break;
                }

                case 'thinking': {
                  // Thinking process - add as separate part
                  currentParts.push({ type: 'thinking', content: data.content });
                  updateMessage();
                  break;
                }

                case 'tool_start': {
                  // VALIDATION: Validate tool_name is not empty
                  if (!data.tool_name || !data.tool_name.trim()) {
                    console.warn('[WARN] Skipping malformed tool_start:', data);
                    break;
                  }

                  // DEDUPLICATION: Update existing tool call if it exists (LangGraph sends multiple chunks)
                  const existingToolCall = currentParts.find(
                    p => p.type === 'tool_call' && p.id === data.id
                  ) as ToolCallPart | undefined;

                  if (existingToolCall) {
                    console.log(`[DEBUG] Updating existing tool_start for ${data.id}`);
                    // Update args if new args are more complete (not empty)
                    if (data.args && Object.keys(data.args).length > 0) {
                      existingToolCall.args = data.args;
                      console.log(`[DEBUG] Updated args for ${data.id}:`, data.args);
                      updateMessage();
                    }
                    break;
                  }

                  // Add new tool call
                  const toolCall: ToolCallPart = {
                    type: 'tool_call',
                    id: data.id,
                    tool_name: data.tool_name,
                    args: data.args,
                    status: 'pending'
                  };
                  toolCallsMap.set(data.id, toolCall);
                  currentParts.push(toolCall);
                  updateMessage();
                  break;
                }

                case 'tool_end': {
                  // Tool call completed - update existing tool_call part
                  const toolCall = toolCallsMap.get(data.id);
                  if (toolCall) {
                    toolCall.result = data.result;
                    toolCall.status = data.status;
                    updateMessage();
                  }
                  break;
                }

                case 'done': {
                  // Stream completed
                  if (data.actions && data.actions.length > 0) {
                    actions = data.actions;
                  }
                  // Exit the loop
                  break;
                }

                default:
                  console.warn('Unknown SSE event type:', currentEvent);
              }

              // Reset for next event
              currentEvent = null;
              currentData = '';
            } catch (e) {
              console.error('Failed to parse SSE data:', e, currentData);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      // Add error message if no parts were added
      if (currentParts.length === 0) {
        set((state) => ({
          messages: [...state.messages, {
            role: 'agent',
            parts: [{
              type: 'text',
              content: 'Sorry, I had trouble with the streaming response. Try again? 🎧'
            }]
          }]
        }));
      }
    } finally {
      set({ isLoading: false });

      // Execute actions after streaming completes
      if (actions.length > 0 && onAgentActions) {
        await onAgentActions(actions);
      }
    }
  },

  /**
   * Create a new session
   */
  createSession: async (userId) => {
    try {
      const res = await fetch(`${API_BASE}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });

      if (!res.ok) {
        throw new Error('Failed to create session');
      }

      const { session_id } = await res.json();
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
