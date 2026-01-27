
import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { useChatStore, Message } from '../store/chatStore';

/**
 * Main chat hook - handles chat lifecycle and session management
 */
export const useChat = (
  sessionId: string | null,
  userId: string | null,
  isNewChat: boolean,
  onAgentActions?: (actions: any[]) => Promise<void>,
  onMessageSent?: () => void,
  onSessionCreated?: (newSessionId: string, preservedMessages: Message[], initialMessage: string) => void
) => {
  const navigate = useNavigate();
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

  // Track if we've already loaded this session to prevent re-loading on remount
  const loadedSessionRef = useRef<string | null>(null);

  // Initialize chat when session/user changes
  useEffect(() => {
    // For new chats without session, clear messages
    if (isNewChat && !sessionId) {
      useChatStore.setState({ messages: [], sessionId: null });
      loadedSessionRef.current = null;
      return;
    }

    if (!sessionId || !userId) return;

    initialize(sessionId, userId);

    // Check if we have preserved messages from navigation
    // TanStack Router location.state is typed as unknown by default, so we cast it
    const state = location.state as { preservedMessages?: Message[]; isNewlyCreated?: boolean } | undefined;
    const preservedMessages = state?.preservedMessages;
    const isNewlyCreated = state?.isNewlyCreated;

    if (isNewlyCreated && preservedMessages) {
      // Restore preserved messages immediately (includes user message)
      useChatStore.setState({ messages: preservedMessages });
      loadedSessionRef.current = sessionId;
      // Skip loading from backend
      return;
    }

    // Load history for existing sessions (not new chats and not newly created)
    // ONLY if we haven't loaded this session before (prevents reload on remount)
    if (!isNewChat && !isNewlyCreated && loadedSessionRef.current !== sessionId) {
      loadHistory(sessionId, userId).then(status => {
        if (status === 'not_found') {
          console.log("Session not found (404), redirecting to home");
          navigate({ to: '/', replace: true });
        } else if (status === 'success') {
          loadedSessionRef.current = sessionId;
        } else {
          // Error case (network error, 500, etc.)
          // Do NOT redirect - let user retry or see error state
          console.error("Failed to load history due to error, staying on page");
        }
      });
    }
  }, [sessionId, userId, isNewChat, (location.state as any)?.isNewlyCreated, navigate]);

  /**
   * Send message handler - creates session for new chats first
   * Uses flushSync to ensure user message appears immediately
   */
  const handleSendMessage = async (text?: string, skipAddingUserMessage = false) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    // For new chats without session, create session first and navigate
    if (isNewChat && !sessionId) {
      try {
        if (!userId) throw new Error("User ID required");
        const newSessionId = await createSession(userId);

        // Add user message to preserved messages so it shows immediately on navigation
        const userMessage: Message = { role: 'user', content: messageText };
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
        console.error(error);
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
