import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';

/**
 * Main chat hook - handles chat lifecycle and session management
 *
 * @param {string} sessionId - Current session ID
 * @param {string} userId - Current user ID
 * @param {boolean} isNewChat - Whether this is a new chat (no session yet)
 * @param {Function} onAgentActions - Callback for agent actions
 * @param {Function} onMessageSent - Callback when message is sent
 * @param {Function} onSessionCreated - Callback when new session is created (newSessionId, preservedMessages, initialMessage)
 * @returns {object} Chat state and methods
 */
export const useChat = (sessionId, userId, isNewChat, onAgentActions, onMessageSent, onSessionCreated) => {
  const location = useLocation();
  const {
    messages,
    input,
    isLoading,
    isLoadingHistory,
    showHistory,
    setInput,
    setShowHistory,
    toggleHistory,
    sendMessage,
    addUserMessage,
    createSession,
    loadHistory,
    initialize
  } = useChatStore();

  // Initialize chat when session/user changes
  useEffect(() => {
    // For new chats without session, clear messages
    if (isNewChat && !sessionId) {
      useChatStore.setState({ messages: [], sessionId: null });
      return;
    }

    if (!sessionId || !userId) return;

    initialize(sessionId, userId);

    // Check if we have preserved messages from navigation
    const preservedMessages = location.state?.preservedMessages;
    const isNewlyCreated = location.state?.isNewlyCreated;

    if (isNewlyCreated && preservedMessages) {
      // Restore preserved messages immediately (includes user message)
      useChatStore.setState({ messages: preservedMessages });
      // Skip loading from backend
      return;
    }

    // Load history for existing sessions (not new chats and not newly created)
    if (!isNewChat && !isNewlyCreated) {
      loadHistory(sessionId, userId);
    }
  }, [sessionId, userId, isNewChat, location.state?.isNewlyCreated]);

  /**
   * Send message handler - creates session for new chats first
   * Uses flushSync to ensure user message appears immediately
   */
  const handleSendMessage = async (text, skipAddingUserMessage = false) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    // For new chats without session, create session first and navigate
    if (isNewChat && !sessionId) {
      try {
        const newSessionId = await createSession(userId);

        // Add user message to preserved messages so it shows immediately on navigation
        const userMessage = { role: 'user', content: messageText };
        const preservedMessages = [...messages, userMessage];

        // Call onSessionCreated to trigger navigation
        // Pass: (sessionId, messages with user message already included, initial message to send)
        if (onSessionCreated) {
          onSessionCreated(newSessionId, preservedMessages, messageText);
        }

        // After navigation, the new ChatInterface instance will auto-send the message
        // via useInitialMessage hook
      } catch (error) {
        alert('Failed to create session. Please try again.');
      }
    } else {
      // For existing chats, add user message synchronously first (unless skipped)
      // This ensures the message appears immediately before "ON AIR..." loading
      if (!skipAddingUserMessage) {
        flushSync(() => {
          addUserMessage(messageText);
        });
      }

      // Then send to backend
      await sendMessage(messageText, onAgentActions, onMessageSent, skipAddingUserMessage);
    }
  };

  return {
    messages,
    input,
    isLoading,
    isLoadingHistory,
    showHistory,
    setInput,
    setShowHistory,
    toggleHistory,
    sendMessage: handleSendMessage
  };
};
