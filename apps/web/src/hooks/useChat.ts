/**
 * Main chat hook - handles chat lifecycle and session management
 * @module hooks/useChat
 */

import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import type { Message, AgentAction } from '../types/chat';

interface UseChatParams {
  sessionId: string | null;
  userId: string | null;
  onAgentActions?: (actions: AgentAction[]) => Promise<void> | void;
  onMessageSent?: () => void;
  onSessionCreated?: (
    newSessionId: string,
    preservedMessages: Message[],
    initialMessage: string
  ) => void;
}

interface UseChatReturn {
  messages: Message[];
  input: string;
  isLoading: boolean;
  isLoadingHistory: boolean;
  showHistory: boolean;
  setInput: (input: string) => void;
  setShowHistory: (show: boolean) => void;
  toggleHistory: () => void;
  sendMessage: (text?: string, skipAddingUserMessage?: boolean) => Promise<void>;
}

/**
 * Main chat hook - manages chat lifecycle, session loading, and message sending
 *
 * @param params - Chat hook parameters
 * @returns Chat state and methods
 */
export function useChat({
  sessionId,
  userId,
  onAgentActions,
  onMessageSent,
  onSessionCreated
}: UseChatParams): UseChatReturn {
  const location = useLocation();
  const navigate = useNavigate() as NavigateFunction;
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
    loadHistory
  } = useChatStore();

  // Track the last loaded sessionId to know when we need to reload
  const lastSessionIdRef = useRef<string | null>(null);

  // Initialize chat based on sessionId from URL
  useEffect(() => {
    // No sessionId = new chat, clear everything
    if (!sessionId) {
      console.log('[useChat] No sessionId, clearing messages');
      useChatStore.setState({ messages: [], sessionId: null, isLoadingHistory: false });
      lastSessionIdRef.current = null;
      return;
    }

    if (!userId) return;

    // sessionId changed, load new session
    if (sessionId !== lastSessionIdRef.current) {
      console.log('[useChat] SessionId changed, loading:', sessionId);
      lastSessionIdRef.current = sessionId;

      // Check if we have preserved messages from navigation (newly created session)
      const preservedMessages = location.state?.preservedMessages as Message[] | undefined;
      const isNewlyCreated = location.state?.isNewlyCreated as boolean | undefined;

      if (isNewlyCreated && preservedMessages) {
        console.log('[useChat] Using preserved messages:', preservedMessages.length);
        useChatStore.setState({ messages: preservedMessages, sessionId });
        return;
      }

      // Load from backend
      loadHistory(sessionId, userId).then(status => {
        if (status === 'not_found') {
          console.log('[useChat] Session not found, redirecting to home');
          navigate('/', { replace: true });
        }
      });
    }
  }, [sessionId, userId]);

  /**
   * Send message handler - creates session for new chats first
   * Uses flushSync to ensure user message appears immediately
   */
  const handleSendMessage = async (
    text?: string,
    skipAddingUserMessage = false
  ): Promise<void> => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    // For new chats without session, create session first and navigate
    if (!sessionId) {
      try {
        if (!userId) {
          throw new Error('User ID is required');
        }

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
        console.error('Failed to create session:', error);
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
}
