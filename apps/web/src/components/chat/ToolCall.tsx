/**
 * ToolCall — rich tool call display.
 *
 * search_music: Renders interactive track list with play/queue buttons
 * add_to_queue: Compact confirmation with track name
 * Others: Clean collapsible with status dot + summary
 */

import { useState, useEffect, useRef } from 'react';
import { useGenUIActions, useStorefront, usePlayTrackById } from '../genui/GenUIContext';
import { API_BASE } from '../../config/api';

/** Global artwork cache — LRU with max 200 entries, cleared on page refresh */
const ARTWORK_CACHE_MAX = 200;
const artworkCache = new Map<string, string>();
function cacheArtwork(id: string, url: string) {
  if (artworkCache.size >= ARTWORK_CACHE_MAX) {
    // Delete oldest entry (first key in Map iteration order)
    const oldest = artworkCache.keys().next().value;
    if (oldest !== undefined) artworkCache.delete(oldest);
  }
  artworkCache.set(id, url);
}

interface ToolCallProps {
  id: string;
  tool_name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: 'pending' | 'success' | 'error';
}

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

/** Parse search_music text result into structured tracks */
function parseSearchResult(result: string): { name: string; artist: string; id: string }[] {
  const tracks: { name: string; artist: string; id: string }[] = [];
  const lines = result.split('\n');
  for (const line of lines) {
    // Match: "1. Track Name - Artist (id: 12345)"
    const m = line.match(/^\d+\.\s+(.+?)\s+-\s+(.+?)\s+\(id:\s+(\d+)\)$/);
    if (m) tracks.push({ name: m[1], artist: m[2], id: m[3] });
  }
  return tracks;
}

/** Rich search results with play/queue buttons */
function SearchMusicResult({ result, args }: { result: string; args: Record<string, unknown> }) {
  const actions = useGenUIActions();
  const playById = usePlayTrackById();
  const sf = useStorefront();
  const [artworks, setArtworks] = useState<Record<string, string>>({});

  const tracks = parseSearchResult(result);
  const queries = (args.queries as string[]) || [];
  const queryText = queries.join(', ');
  const fetchedRef = useRef(false);

  // Batch fetch artworks for visible tracks on mount (parallel + cached)
  useEffect(() => {
    if (fetchedRef.current || tracks.length === 0) return;
    fetchedRef.current = true;

    const toFetch = tracks.slice(0, 10).filter(t => !artworkCache.has(t.id));
    if (toFetch.length === 0) {
      // All cached — load from cache
      const cached: Record<string, string> = {};
      for (const t of tracks.slice(0, 10)) {
        const url = artworkCache.get(t.id);
        if (url) cached[t.id] = url;
      }
      setArtworks(cached);
      return;
    }

    // Fetch all in parallel
    Promise.all(
      toFetch.map(async (track) => {
        try {
          const res = await fetch(`${API_BASE}/apple-music/catalog/songs/${track.id}?storefront=${sf}`);
          if (!res.ok) return;
          const data = await res.json();
          const url = data?.data?.[0]?.attributes?.artwork?.url;
          if (url) {
            const sized = url.replace('{w}', '80').replace('{h}', '80');
            cacheArtwork(track.id, sized);
          }
        } catch { /* best effort */ }
      })
    ).then(() => {
      const all: Record<string, string> = {};
      for (const t of tracks.slice(0, 10)) {
        const url = artworkCache.get(t.id);
        if (url) all[t.id] = url;
      }
      setArtworks(all);
    });
  }, [tracks.length, sf]);

  if (tracks.length === 0) {
    return <p className="text-[11px] text-gray-500 py-1">{result}</p>;
  }

  const handlePlay = (trackId: string) => {
    if (playById) playById(trackId).catch(console.error);
  };

  const handleQueue = (trackId: string, name: string, artist: string) => {
    if (!actions) return;
    actions.addTrack({
      id: trackId, name, artist, album: '',
      artworkUrl: artworks[trackId] || '', durationSeconds: 0, provider: 'apple-music',
    });
  };

  return (
    <div className="space-y-1">
      {queryText && (
        <p className="text-[10px] text-gray-400 mb-1.5">Searched: {queryText}</p>
      )}
      <div className="space-y-0.5 max-h-64 overflow-y-auto overflow-x-hidden">
        {tracks.slice(0, 10).map((track, i) => (
          <div
            key={track.id}
            className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-gray-50 group/track transition-colors"
          >
            <span className="text-[10px] text-gray-400 w-4 text-right tabular-nums shrink-0">
              {i + 1}
            </span>

            {/* Mini artwork — lazy loaded on hover */}
            <div className="w-8 h-8 rounded overflow-hidden bg-gray-100 shrink-0">
              {artworks[track.id] ? (
                <img src={artworks[track.id]} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13" />
                  </svg>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-gray-800 truncate">{track.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{track.artist}</p>
            </div>

            {/* Play + Queue buttons */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/track:opacity-100 transition-opacity">
              <button
                onClick={() => handlePlay(track.id)}
                className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center hover:scale-110 transition-transform"
                title="Play"
              >
                <svg className="w-2.5 h-2.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button
                onClick={() => handleQueue(track.id, track.name, track.artist)}
                className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:scale-110 transition-transform"
                title="Add to queue"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      {tracks.length > 10 && (
        <p className="text-[10px] text-gray-400 pt-1">+{tracks.length - 10} more results</p>
      )}
    </div>
  );
}

/** Compact add-to-queue confirmation */
function AddToQueueResult({ result }: { result: string }) {
  // result is like "Added 'Track Name' by Artist to queue."
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <svg className="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className="text-[12px] text-gray-600">{result}</span>
    </div>
  );
}

/** Summarize tool args */
function summarizeArgs(toolName: string, args: Record<string, unknown>): string | null {
  if (!args || Object.keys(args).length === 0) return null;
  if (toolName === 'search_music' && Array.isArray(args.queries)) {
    return (args.queries as string[]).slice(0, 2).map(q => `"${q}"`).join(', ');
  }
  if (args.query && typeof args.query === 'string') return `"${args.query}"`;
  if (args.track_name && typeof args.track_name === 'string') {
    const artist = args.artist_name ? ` — ${args.artist_name}` : '';
    return `${args.track_name}${artist}`;
  }
  if (args.name && typeof args.name === 'string') return args.name as string;
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
  const resultStr = typeof result === 'string' ? result : result ? JSON.stringify(result) : '';

  const dotClass =
    status === 'pending'
      ? 'bg-blue-400 animate-pulse'
      : status === 'error'
        ? 'bg-red-400'
        : 'bg-green-400';

  // Rich rendering for specific tools
  const isSearchMusic = tool_name === 'search_music' && status === 'success' && resultStr;
  const isAddToQueue = tool_name === 'add_to_queue' && status === 'success' && resultStr;

  // add_to_queue: show inline confirmation, no expand needed
  if (isAddToQueue) {
    return <AddToQueueResult result={resultStr} />;
  }

  return (
    <div className="group">
      {/* Header */}
      <button
        type="button"
        className="flex items-center gap-2 w-full min-w-0 text-left py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="font-medium">{label}</span>
        {summary && !isExpanded && (
          <span className="text-gray-400 truncate min-w-0">{summary}</span>
        )}
        <svg
          className={`w-3 h-3 ml-auto shrink-0 text-gray-300 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-3.5 pl-3 border-l border-gray-100 pb-2 text-xs">
          {isSearchMusic ? (
            <SearchMusicResult result={resultStr} args={args} />
          ) : (
            <div className="space-y-2">
              {args && Object.keys(args).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Input</div>
                  <pre className="bg-gray-50 rounded-md p-2 text-[11px] font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(args, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Output</div>
                {result ? (
                  <pre className="bg-gray-50 rounded-md p-2 text-[11px] font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {resultStr}
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
      )}
    </div>
  );
};
