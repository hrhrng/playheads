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
 * @param {Array} messages - Current messages array
 * @param {Function} navigate - Navigate function
 * @param {string} pathname - Current pathname
 */
export const useInitialMessage = (locationState, sendMessage, isLoading, messages, navigate, pathname) => {
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
  }, [locationState?.initialMessage, locationState?.isNewlyCreated, sendMessage, isLoading, messages, navigate, pathname]);
};
