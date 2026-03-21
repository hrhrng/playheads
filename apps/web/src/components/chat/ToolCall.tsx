/**
 * ToolCall - Semantic tool call display component
 *
 * Music-specific tools show compact semantic output:
 * - search_music: search results card list
 * - play_track: single line "Playing: {name}"
 * - add_to_queue: single line "Added {name} to queue"
 * - skip_next: single line "Skipped to next"
 * - remove_from_playlist: single line "Removed {name}"
 *
 * Unknown tools fall back to the collapsible JSON view.
 *
 * @module components/chat/ToolCall
 */

import { useState } from 'react';

interface ToolCallProps {
  id: string;
  tool_name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: 'pending' | 'success' | 'error';
}

// Helper to safely extract track info from result
function extractTrackName(result: unknown, args: Record<string, unknown>): string {
  if (!result) return (args?.name as string) || (args?.query as string) || 'track';
  if (typeof result === 'object' && result !== null) {
    const r = result as Record<string, any>;
    return r.name || r.trackName || r.title || (args?.name as string) || 'track';
  }
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      return parsed.name || parsed.trackName || parsed.title || 'track';
    } catch { /* ignore */ }
  }
  return (args?.name as string) || 'track';
}

// Helper to extract search results
function extractSearchResults(result: unknown): Array<{ name: string; artist: string; artworkUrl?: string }> {
  if (!result) return [];
  let data: any = result;
  if (typeof result === 'string') {
    try { data = JSON.parse(result); } catch { return []; }
  }

  // Handle various result shapes
  const tracks = data?.tracks || data?.results || data?.songs || data?.data || data;
  if (!Array.isArray(tracks)) return [];

  return tracks.slice(0, 5).map((t: any) => ({
    name: t.name || t.title || t.trackName || 'Unknown',
    artist: t.artist || t.artistName || t.artists?.[0]?.name || 'Unknown',
    artworkUrl: t.artworkUrl || t.artwork?.url || t.albumArt || undefined,
  }));
}

function formatArtwork(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace('{w}', '64').replace('{h}', '64');
}

export const ToolCall = ({
  id,
  tool_name,
  args,
  result,
  status = 'pending'
}: ToolCallProps): React.JSX.Element => {
  // Try semantic rendering first
  const semantic = renderSemantic(tool_name, args, result, status);
  if (semantic) return semantic;

  // Fallback: collapsible JSON view for unknown tools
  return <ToolCallFallback id={id} tool_name={tool_name} args={args} result={result} status={status} />;
};

function renderSemantic(
  tool_name: string,
  args: Record<string, unknown>,
  result: unknown,
  status: string,
): React.JSX.Element | null {
  const isPending = status === 'pending';

  switch (tool_name) {
    case 'search_music': {
      const query = (args?.query as string) || (args?.term as string) || '...';
      if (isPending) {
        return (
          <div className="text-sm text-gray-500 py-1.5 flex items-center gap-2">
            <span className="animate-pulse">Searching for &ldquo;{query}&rdquo;...</span>
          </div>
        );
      }
      const tracks = extractSearchResults(result);
      if (tracks.length === 0) {
        return (
          <div className="text-sm text-gray-500 py-1.5">
            No results for &ldquo;{query}&rdquo;
          </div>
        );
      }
      return (
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="text-xs text-gray-400 px-3 py-1.5 bg-gray-50">
            Results for &ldquo;{query}&rdquo;
          </div>
          {tracks.map((track, i) => {
            const art = formatArtwork(track.artworkUrl);
            return (
              <div key={i} className="flex items-center gap-2.5 px-3 py-1.5 border-t border-gray-50">
                {art ? (
                  <img src={art} alt="" className="w-8 h-8 rounded shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-100 shrink-0 flex items-center justify-center">
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{track.name}</p>
                  <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    case 'play_track': {
      const name = extractTrackName(result, args);
      if (isPending) {
        return <div className="text-sm text-gray-500 py-1 animate-pulse">Loading track...</div>;
      }
      return (
        <div className="text-sm text-gray-600 py-1 flex items-center gap-1.5">
          <span className="text-green-500">&#9654;</span>
          <span>Playing &ldquo;{name}&rdquo;</span>
        </div>
      );
    }

    case 'add_to_queue': {
      const name = extractTrackName(result, args);
      if (isPending) {
        return <div className="text-sm text-gray-500 py-1 animate-pulse">Adding to queue...</div>;
      }
      return (
        <div className="text-sm text-gray-600 py-1 flex items-center gap-1.5">
          <span className="text-blue-500">+</span>
          <span>Added &ldquo;{name}&rdquo; to queue</span>
        </div>
      );
    }

    case 'skip_next': {
      if (isPending) {
        return <div className="text-sm text-gray-500 py-1 animate-pulse">Skipping...</div>;
      }
      return (
        <div className="text-sm text-gray-600 py-1 flex items-center gap-1.5">
          <span className="text-gray-400">&#9193;</span>
          <span>Skipped to next</span>
        </div>
      );
    }

    case 'remove_from_playlist': {
      const name = extractTrackName(result, args);
      if (isPending) {
        return <div className="text-sm text-gray-500 py-1 animate-pulse">Removing...</div>;
      }
      return (
        <div className="text-sm text-gray-600 py-1 flex items-center gap-1.5">
          <span className="text-red-400">&times;</span>
          <span>Removed &ldquo;{name}&rdquo;</span>
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * Fallback collapsible JSON view for unknown tools.
 */
function ToolCallFallback({
  id,
  tool_name,
  args,
  result,
  status = 'pending',
}: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolDisplayNames: Record<string, string> = {
    web_search: 'Web Search',
    get_now_playing: 'Now Playing',
    get_playlist: 'Get Playlist',
  };

  type StatusConfig = { icon: string; color: string; iconClass: string };
  const statusConfig: Record<string, StatusConfig> = {
    pending: { icon: '\u25CB', color: 'text-blue-500 bg-blue-50/50 border-blue-200', iconClass: 'animate-pulse' },
    success: { icon: '\u2713', color: 'text-green-600 bg-green-50/50 border-green-200', iconClass: '' },
    error: { icon: '\u2717', color: 'text-red-600 bg-red-50/50 border-red-200', iconClass: '' },
  };

  const config = statusConfig[status!] || statusConfig.pending;
  const displayName = toolDisplayNames[tool_name] || tool_name || 'Tool';

  return (
    <div className={`text-sm w-full border rounded-lg overflow-hidden ${config.color}`}>
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-black/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className={`font-mono text-base ${config.iconClass}`}>{config.icon}</span>
          <span className="font-medium font-mono text-xs tracking-wide">{displayName}</span>
        </div>
        <div className="text-gray-400 text-xs">{isExpanded ? '\u25BC' : '\u25B6'}</div>
      </div>

      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2 bg-white/50">
          <div className="space-y-2">
            {args && Object.keys(args).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">INPUT</div>
                <pre className="bg-white border border-gray-200 p-2 rounded text-[11px] overflow-x-auto font-mono text-gray-700">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">OUTPUT</div>
              {result ? (
                <pre className="bg-white border border-gray-200 p-2 rounded text-[11px] overflow-x-auto font-mono text-gray-700 whitespace-pre-wrap break-words max-h-48">
                  {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                </pre>
              ) : (
                <div className="bg-white border border-gray-200 p-2 rounded text-[11px] font-mono text-gray-400 italic">
                  {status === 'pending' ? 'Executing...' : 'No output'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
