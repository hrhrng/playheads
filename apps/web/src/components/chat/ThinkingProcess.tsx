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
        className="flex items-center gap-2 w-full text-left py-1 text-[12px] text-ink-3 hover:text-ink transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent-2/70" />
        <span className="font-medium">Thinking</span>
        <svg
          className={`w-3 h-3 ml-auto shrink-0 text-ink-4 transition-transform duration-200 ${
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
        <div className="ml-3.5 pl-3 hairline-l pb-2">
          <p className="text-[12px] text-ink-3 italic leading-relaxed whitespace-pre-wrap">
            {content}
          </p>
        </div>
      )}
    </div>
  );
};
