import { useEffect, useRef } from 'react';

/**
 * Auto-resize textarea hook
 *
 * @param {string} value - Current textarea value
 * @returns {React.RefObject} Textarea ref
 */
export const useAutoResizeTextarea = (value) => {
  const textareaRef = useRef(null);

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
 * @param {Array} messages - Array of messages
 * @returns {React.RefObject} End element ref
 */
export const useAutoScroll = (messages) => {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return endRef;
};

/**
 * Initial message auto-send hook
 * Handles auto-sending initial message from navigation state
 *
 * @param {object} locationState - React Router location state
 * @param {Function} sendMessage - Send message function
 * @param {boolean} isLoading - Loading state
 * @param {number} messageCount - Current message count
 */
export const useInitialMessage = (locationState, sendMessage, isLoading, messageCount) => {
  const hasSentRef = useRef(false);

  useEffect(() => {
    const initialMessage = locationState?.initialMessage;
    const isNewlyCreated = locationState?.isNewlyCreated;

    // For newly created sessions, wait until we have messages (from preservedMessages)
    // Then send without adding user message again (it's already in state)
    if (initialMessage && !isLoading && !hasSentRef.current) {
      // For newly created sessions, only send when messages are loaded
      if (isNewlyCreated && messageCount === 0) {
        return; // Wait for preservedMessages to load
      }

      hasSentRef.current = true;
      console.log('[useInitialMessage] Auto-sending initial message:', initialMessage);

      // Clear the state to prevent sending again
      if (window.history.replaceState) {
        window.history.replaceState({}, document.title);
      }

      // Skip adding user message if it's a newly created session (already in preservedMessages)
      sendMessage(initialMessage, isNewlyCreated);
    }
  }, [locationState?.initialMessage, locationState?.isNewlyCreated, sendMessage, isLoading, messageCount]);
};
