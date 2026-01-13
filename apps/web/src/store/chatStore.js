import { create } from 'zustand';

const API_BASE = 'http://localhost:8000';

/**
 * Chat store - manages chat state, messages, and backend communication
 */
export const useChatStore = create((set, get) => ({
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
    set({ sessionId, userId, messages: [] });
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
      return;
    }

    set({ isLoadingHistory: true });
    try {
      const url = userId
        ? `${API_BASE}/state?session_id=${sessionId}&user_id=${userId}`
        : `${API_BASE}/state?session_id=${sessionId}`;

      const res = await fetch(url);

      if (res.ok) {
        const data = await res.json();
        const messages = (data.chat_history || []).map(m => ({
          role: m.role,
          content: m.content
        }));
        set({ messages, sessionId });
      } else {
        set({ messages: [] });
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
      set({ messages: [] });
    } finally {
      set({ isLoadingHistory: false });
    }
  },

  /**
   * Send a message with streaming response
   * NOTE: User message should be added BEFORE calling this (use addUserMessage)
   *
   * @param {string} messageText - The message text to send
   * @param {Function} onAgentActions - Callback for agent actions
   * @param {Function} onMessageSent - Callback when message is sent
   * @param {boolean} skipAddingUserMessage - Skip adding user message (already in state)
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
    } catch (error) {
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
   * Handle streaming SSE response from backend
   */
  handleStreamingResponse: async (response, onAgentActions) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullContent = '';
    let actions = [];
    let agentMessageAdded = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              // Handle content chunks (token-level streaming)
              if (data.content) {
                fullContent += data.content;

                set((state) => {
                  if (!agentMessageAdded) {
                    agentMessageAdded = true;
                    return {
                      messages: [...state.messages, { role: 'agent', content: fullContent }]
                    };
                  } else {
                    const messages = [...state.messages];
                    messages[messages.length - 1] = { role: 'agent', content: fullContent };
                    return { messages };
                  }
                });
              }

              if (data.done) {
                if (data.actions && data.actions.length > 0) {
                  actions = data.actions;
                }
                break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e, dataStr);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      if (!fullContent) {
        set((state) => ({
          messages: [...state.messages, {
            role: 'agent',
            content: 'Sorry, I had trouble with the streaming response. Try again? 🎧'
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
