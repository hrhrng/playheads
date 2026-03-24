/**
 * ToolCall - Clean, collapsible tool call display
 *
 * Design inspired by Vercel AI Elements:
 * - Collapsed by default — single line with status dot + name + chevron
 * - Progressive disclosure — expand on click for details
 * - No raw JSON by default — show meaningful summaries
 * - Subtle styling — no loud colored backgrounds
 *
 * @module components/chat/ToolCall
 */

import { useState } from 'react';

interface ToolCallProps {
  /** Unique identifier for this tool call */
  id: string;
  /** Name of the tool being called */
  tool_name: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Result returned by the tool */
  result?: unknown;
  /** Execution status */
  status?: 'pending' | 'success' | 'error';
}

/** Human-readable tool names */
const TOOL_LABELS: Record<string, string> = {
  search_music: 'Search Music',
  web_search: 'Web Search',
  play_track: 'Play Track',
  skip_next: 'Skip Next',
  add_to_queue: 'Add to Queue',
  remove_from_playlist: 'Remove from Playlist',
  get_now_playing: 'Now Playing',
  get_playlist: 'Get Playlist',
};

/** Summarize tool args into a short, readable string */
function summarizeArgs(toolName: string, args: Record<string, unknown>): string | null {
  if (!args || Object.keys(args).length === 0) return null;

  // For search tools, show the query
  if (args.query && typeof args.query === 'string') {
    return `"${args.query}"`;
  }
  // For play tools, show the track name
  if (args.track_name && typeof args.track_name === 'string') {
    const artist = args.artist_name ? ` — ${args.artist_name}` : '';
    return `${args.track_name}${artist}`;
  }
  if (args.name && typeof args.name === 'string') {
    return args.name as string;
  }

  return null;
}

export const ToolCall = ({
  id,
  tool_name,
  args,
  result,
  status = 'pending',
}: ToolCallProps): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false);

  const label = TOOL_LABELS[tool_name] || tool_name || 'Tool';
  const summary = summarizeArgs(tool_name, args);

  // Status dot colors
  const dotClass =
    status === 'pending'
      ? 'bg-blue-400 animate-pulse'
      : status === 'error'
        ? 'bg-red-400'
        : 'bg-green-400';

  return (
    <div className="group">
      {/* Header — always visible, single compact line */}
      <button
        type="button"
        className="flex items-center gap-2 w-full min-w-0 text-left py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Status dot */}
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />

        {/* Tool name */}
        <span className="font-medium">{label}</span>

        {/* Inline summary (e.g. search query) */}
        {summary && !isExpanded && (
          <span className="text-gray-400 truncate min-w-0">{summary}</span>
        )}

        {/* Chevron */}
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

      {/* Expanded details */}
      {isExpanded && (
        <div className="ml-3.5 pl-3 border-l border-gray-100 pb-2 space-y-2 text-xs">
          {/* Input */}
          {args && Object.keys(args).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Input</div>
              <pre className="bg-gray-50 rounded-md p-2 text-[11px] font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Output</div>
            {result ? (
              <pre className="bg-gray-50 rounded-md p-2 text-[11px] font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <span className="text-gray-400 italic text-[11px]">
                {status === 'pending' ? 'Running…' : 'No output'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
