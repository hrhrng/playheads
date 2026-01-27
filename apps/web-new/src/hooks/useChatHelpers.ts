
import { useEffect, useRef, RefObject } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';

/**
 * Auto-resize textarea hook
 *
 * @param value - Current textarea value
 * @returns Textarea ref
 */
export const useAutoResizeTextarea = (value: string): RefObject<HTMLTextAreaElement | null> => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value]);

  return textareaRef;
};

/**
 * Auto-scroll to bottom hook
 *
 * @param messages - Array of messages
 * @returns End element ref
 */
export const useAutoScroll = (messages: any[]): RefObject<HTMLDivElement | null> => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return endRef;
};

/**
 * Initial message auto-send hook
 * Handles auto-sending initial message from navigation state
 *
 * @param initialMessage - The message to send
 * @param isNewlyCreated - Whether this is a new session
 * @param sendMessage - Send message function
 * @param isLoading - Loading state
 * @param messages - Current messages array
 */
export const useInitialMessage = (
  initialMessage: string | undefined,
  isNewlyCreated: boolean | undefined,
  sendMessage: (msg: string, onActions?: any, onSent?: any, skip?: boolean) => void,
  isLoading: boolean,
  messages: any[]
) => {
  const hasSentRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!initialMessage) return;

    // Safety check: If we have more than 1 message, we assume the conversation
    // has progressed beyond the initial message (e.g. response received),
    // so we shouldn't send again even if state persists.
    if (isNewlyCreated && Array.isArray(messages) && messages.length > 1) {
      // Clear navigation state just in case (TanStack Router specific logic needed here if using history state)
      // For now, we assume the initialMessage prop passed down is reactive and cleared by the parent
      return;
    }

    // For newly created sessions, wait until we have messages (from preservedMessages)
    // Then send without adding user message again (it's already in state)
    if (!isLoading && !hasSentRef.current) {
      // For newly created sessions, only send when messages are loaded
      if (isNewlyCreated && (!messages || messages.length === 0)) {
        return; // Wait for preservedMessages to load
      }

      hasSentRef.current = true;
      console.log('[useInitialMessage] Auto-sending initial message:', initialMessage);

      // In TanStack router, we might handle state clearing differently,
      // but here we just rely on the side effect of sending.
      // The parent component should handle clearing the "initialMessage" prop if it comes from location state.

      // Skip adding user message if it's a newly created session (already in preservedMessages)
      sendMessage(initialMessage, undefined, undefined, isNewlyCreated);
    }
  }, [initialMessage, isNewlyCreated, sendMessage, isLoading, messages]);
};
