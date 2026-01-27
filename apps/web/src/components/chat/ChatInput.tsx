/**
 * ChatInput - Message input component with auto-resize
 * @module components/chat/ChatInput
 */

import { useAutoResizeTextarea } from '../../hooks/useChatHelpers';

interface ChatInputProps {
  /** Current input value */
  input: string;
  /** Whether a message is currently loading */
  isLoading: boolean;
  /** Whether the DJ is currently speaking */
  isDJSpeaking: boolean;
  /** Whether music is currently playing */
  isPlaying: boolean;
  /** Callback when input changes */
  onInputChange: (value: string) => void;
  /** Callback to send the message */
  onSend: () => void;
}

/**
 * ChatInput - message input component with auto-resize
 */
export const ChatInput = ({
  input,
  isLoading,
  isDJSpeaking,
  isPlaying,
  onInputChange,
  onSend
}: ChatInputProps): React.JSX.Element => {
  const textareaRef = useAutoResizeTextarea(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const getPlaceholder = (): string => {
    if (isDJSpeaking) return 'Push to Interrupt...';
    if (isPlaying) return 'Ask the DJ...';
    return 'Start a vibe...';
  };

  return (
    <div className="max-w-3xl mx-auto bg-gemini-bg rounded-3xl p-2 pl-4 pr-2 flex items-center gap-2 group focus-within:bg-white focus-within:shadow-md transition-all border border-transparent focus-within:border-gemini-border">
      <textarea
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={getPlaceholder()}
        className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-gemini-text placeholder-gemini-subtext text-lg font-medium tracking-tight resize-none py-3 max-h-32 no-scrollbar"
        disabled={isLoading}
      />

      <button
        onClick={onSend}
        disabled={isLoading}
        className={`p-3 rounded-full transition-all ${
          isLoading
            ? 'bg-blue-400 text-white animate-pulse'
            : input.trim()
            ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
            : 'bg-gray-200 text-gray-400'
        }`}
      >
        {isLoading ? (
          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        )}
      </button>
    </div>
  );
};
