/**
 * ThinkingProcess - Minimal thinking/reasoning display
 *
 * Inspired by Vercel AI Elements <Reasoning>:
 * - Collapsed by default, same visual weight as ToolCall
 * - Single-line toggle, no loud colors
 *
 * @module components/chat/ThinkingProcess
 */

import { useState } from 'react';

interface ThinkingProcessProps {
  /** The thinking content to display */
  content: string;
}

export const ThinkingProcess = ({ content }: ThinkingProcessProps): React.JSX.Element | null => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="group">
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-violet-300" />
        <span className="font-medium">Thinking</span>
        <svg
          className={`w-3 h-3 ml-auto shrink-0 text-gray-300 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="ml-3.5 pl-3 border-l border-gray-100 pb-2">
          <p className="text-[11px] text-gray-500 italic leading-relaxed whitespace-pre-wrap">
            {content}
          </p>
        </div>
      )}
    </div>
  );
};
