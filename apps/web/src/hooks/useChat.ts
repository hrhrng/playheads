/**
 * Main chat hook - handles chat lifecycle and session management.
 *
 * Uses useAgentChatAdapter for WebSocket-based communication with
 * the Cloudflare AIChatAgent (MusicChatAgent DO).
 *
 * @module hooks/useChat
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { useAgentChatAdapter } from './useAgentChatAdapter';
import { useChatStore } from '../store/chatStore';
import { API_BASE } from '../config/api';
import type { Message, AgentAction } from '../types/chat';

interface UseChatParams {
  sessionId: string | null;
  userId: string | null;
  onAgentActions?: (actions: AgentAction[]) => Promise<void> | void;
  onMessageSent?: () => void;
  onSessionCreated?: (
    newSessionId: string,
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
 * Main chat hook - manages chat lifecycle, session loading, and message sending.
 * Delegates messaging to useAgentChatAdapter (WebSocket to AIChatAgent).
 */
export function useChat({
  sessionId,
  userId,
  onAgentActions,
  onMessageSent,
  onSessionCreated,
}: UseChatParams): UseChatReturn {
  const navigate = useNavigate() as NavigateFunction;
  const {
    input,
    showHistory,
    setInput,
    setShowHistory,
    toggleHistory,
  } = useChatStore();

  // Use the agent chat adapter when we have a session
  const adapter = useAgentChatAdapter({
    sessionId: sessionId || "__no_session__",
    userId: userId || "",
    onAgentActions,
    onMessageSent,
  });

  // Track whether we have a valid session for the adapter
  const hasSession = !!sessionId && !!userId;

  // Messages come from the adapter when connected, empty otherwise
  const messages = hasSession ? adapter.messages : [];
  const isLoading = hasSession ? adapter.isLoading : false;

  // No separate history loading needed - useAgentChat auto-loads from DO SQLite
  const [isLoadingHistory] = useState(false);

  /**
   * Send message handler - creates session for new chats first
   */
  const creatingSessionRef = useRef(false);

  const handleSendMessage = useCallback(async (
    text?: string,
    _skipAddingUserMessage = false
  ): Promise<void> => {
    const messageText = text || input;
    if (!messageText.trim() || isLoading) return;

    // For new chats without session, create session first and navigate
    if (!sessionId) {
      if (creatingSessionRef.current) return;
      creatingSessionRef.current = true;
      try {
        if (!userId) {
          throw new Error('User ID is required');
        }

        // Create session in D1 (for conversation listing)
        const res = await fetch(`${API_BASE}/session/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId })
        });
        if (!res.ok) throw new Error('Failed to create session');
        const { session_id: newSessionId } = await res.json() as { session_id: string };

        // Navigate to the new session - useAgentChat will connect automatically
        if (onSessionCreated) {
          onSessionCreated(newSessionId, messageText);
        }
      } catch (error) {
        console.error('Failed to create session:', error);
        toast.error('Failed to create chat session', {
          description: 'Please refresh the page or try again'
        });
      } finally {
        creatingSessionRef.current = false;
      }
    } else {
      // Clear input and send via WebSocket
      useChatStore.setState({ input: '' });
      adapter.sendMessage(messageText);
    }
  }, [input, isLoading, sessionId, userId, onSessionCreated, adapter]);

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
