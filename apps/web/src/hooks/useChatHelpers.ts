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
export function useAutoResizeTextarea(value: string): RefObject<HTMLTextAreaElement | null> {
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
export function useAutoScroll(messages: Message[]): RefObject<HTMLDivElement | null> {
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
  sendMessage: (
    message: string,
    skipAddingUserMessage?: boolean,
    files?: InitialFilePart[],
  ) => Promise<void> | void,
  isLoading: boolean,
  messages: Message[],
  navigate: ((to: string, options?: NavigationOptions) => void) | null,
  pathname: string
): void {
  const hasSentRef = useRef(false);

  useEffect(() => {
    const initialMessage = locationState?.initialMessage;
    const isNewlyCreated = locationState?.isNewlyCreated;
    const initialFiles = locationState?.initialFiles;

    if (!initialMessage && (!initialFiles || initialFiles.length === 0)) return;

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

    // Send the initial message once when the adapter is ready
    if (!isLoading && !hasSentRef.current) {
      hasSentRef.current = true;

      // Clear navigation state to prevent re-sending on re-render
      if (navigate) {
        navigate(pathname, { replace: true, state: {} });
      } else if (window.history.replaceState) {
        window.history.replaceState({}, document.title);
      }

      // useAgentChat handles adding the user message, so don't skip
      sendMessage(initialMessage || '', false, initialFiles);
    }
  }, [
    locationState?.initialMessage,
    locationState?.isNewlyCreated,
    locationState?.initialFiles,
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
interface InitialFilePart {
  type: 'file';
  mediaType: string;
  url: string;
  filename?: string;
}

interface LocationState {
  initialMessage?: string;
  isNewlyCreated?: boolean;
  initialFiles?: InitialFilePart[];
  [key: string]: unknown;
}

/**
 * Navigation options for React Router
 */
interface NavigationOptions {
  replace?: boolean;
  state?: Record<string, unknown>;
}
