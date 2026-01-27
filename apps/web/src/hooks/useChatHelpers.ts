/**
 * Custom hooks for chat functionality
 * @module hooks/useChatHelpers
 */

import { useEffect, useRef, type RefObject } from 'react';
import type { Message } from '../types/chat';

/**
 * Auto-resize textarea hook
 * Automatically adjusts textarea height based on content
 *
 * @param value - Current textarea value
 * @returns Textarea ref object
 */
export function useAutoResizeTextarea(value: string): RefObject<HTMLTextAreaElement> {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return textareaRef;
}

/**
 * Auto-scroll to bottom hook
 * Automatically scrolls to the bottom of a container when messages change
 *
 * @param messages - Array of messages to watch for changes
 * @returns End element ref object for scroll target
 */
export function useAutoScroll(messages: Message[]): RefObject<HTMLDivElement> {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return endRef;
}

/**
 * Initial message auto-send hook
 * Handles auto-sending initial message from navigation state
 *
 * @param locationState - React Router location state
 * @param sendMessage - Function to send a message
 * @param isLoading - Current loading state
 * @param messages - Current messages array
 * @param navigate - Navigate function from React Router
 * @param pathname - Current pathname
 */
export function useInitialMessage(
  locationState: LocationState | null,
  sendMessage: (message: string, skipAddingUserMessage?: boolean) => Promise<void> | void,
  isLoading: boolean,
  messages: Message[],
  navigate: ((to: string, options?: NavigationOptions) => void) | null,
  pathname: string
): void {
  const hasSentRef = useRef(false);

  useEffect(() => {
    const initialMessage = locationState?.initialMessage;
    const isNewlyCreated = locationState?.isNewlyCreated;

    if (!initialMessage) return;

    // Safety check: If we have more than 1 message, we assume the conversation
    // has progressed beyond the initial message (e.g. response received),
    // so we shouldn't send again even if state persists.
    if (isNewlyCreated && Array.isArray(messages) && messages.length > 1) {
      // Clear navigation state just in case
      if (navigate && locationState?.initialMessage) {
        navigate(pathname, { replace: true, state: {} });
      }
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

      // Clear the state to prevent sending again
      console.log('[useInitialMessage] Clearing navigation state...');
      if (navigate) {
        console.log('[useInitialMessage] Using navigate to clear state');
        navigate(pathname, { replace: true, state: {} });
      } else if (window.history.replaceState) {
        console.log('[useInitialMessage] Using window.history to clear state');
        window.history.replaceState({}, document.title);
      }

      // Skip adding user message if it's a newly created session (already in preservedMessages)
      sendMessage(initialMessage, isNewlyCreated);
    }
  }, [
    locationState?.initialMessage,
    locationState?.isNewlyCreated,
    sendMessage,
    isLoading,
    messages,
    navigate,
    pathname
  ]);
}

/**
 * Location state from React Router
 */
interface LocationState {
  initialMessage?: string;
  isNewlyCreated?: boolean;
  preservedMessages?: Message[];
  [key: string]: unknown;
}

/**
 * Navigation options for React Router
 */
interface NavigationOptions {
  replace?: boolean;
  state?: Record<string, unknown>;
}
