import { useEffect, useRef, useState, useMemo } from 'react';
import { parseLRC } from '../lib/lrcParser';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';
import type { LyricLine, LyricsState, LyricsStatus } from '../types/lyrics';

interface CachedLyrics {
  status: LyricsStatus;
  lines: LyricLine[];
  plainText: string | null;
}

interface UseLyricsOptions {
  userId?: string | null;
  storefront?: string | null;
}

/**
 * Fetch and track synced lyrics for the current track.
 *
 * - Fetches from the agent lyrics proxy on track/user/storefront change
 * - Caches results per track id for the session
 * - Computes the active line index from currentTime
 */
export function useLyrics(
  currentTrack: UnifiedTrack | null,
  currentTime: number,
  options: UseLyricsOptions = {},
): LyricsState {
  const [status, setStatus] = useState<LyricsStatus>('idle');
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [plainText, setPlainText] = useState<string | null>(null);

  const cache = useRef<Map<string, CachedLyrics>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const prevFetchKey = useRef<string | null>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    const trackId = currentTrack?.id ?? null;
    const storefront = options.storefront || 'us';
    const fetchKey = trackId ? `${trackId}:${storefront}:${options.userId || ''}` : null;

    // Same track/user/storefront — no refetch
    if (fetchKey === prevFetchKey.current) return;
    prevFetchKey.current = fetchKey;

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = null;

    if (!currentTrack || !trackId) {
      setStatus('idle');
      setLines([]);
      setPlainText(null);
      return;
    }

    // Check cache
    const cached = cache.current.get(fetchKey || trackId);
    if (cached) {
      setStatus(cached.status);
      setLines(cached.lines);
      setPlainText(cached.plainText);
      return;
    }

    // Fetch lyrics via agent worker proxy
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus('loading');
    setLines([]);
    setPlainText(null);

    // Add timeout to prevent hanging requests
    const timeout = setTimeout(() => ac.abort(), 30000);

    const params = new URLSearchParams();
    if (currentTrack.artist) params.set('artist_name', currentTrack.artist);
    if (currentTrack.name) params.set('track_name', currentTrack.name);
    if (currentTrack.album) params.set('album_name', currentTrack.album);
    if (currentTrack.durationSeconds) params.set('duration', String(Math.round(currentTrack.durationSeconds)));
    if (currentTrack.provider === 'apple-music') params.set('track_id', currentTrack.id);
    if (storefront) params.set('storefront', storefront);
    if (options.userId) params.set('user_id', options.userId);

    // Capture trackId in closure to avoid race conditions on rapid track changes
    const fetchTrackId = trackId;
    const fetchCacheKey = fetchKey;

    fetch(`${API_BASE}/lyrics?${params}`, {
      signal: ac.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: { syncedLyrics?: string | null; plainLyrics?: string | null }) => {
        // Guard: if track changed while fetching, discard result
        if (prevFetchKey.current !== fetchCacheKey) return;

        let result: CachedLyrics;

        if (data.syncedLyrics) {
          const parsed = parseLRC(data.syncedLyrics);
          result = { status: 'synced', lines: parsed, plainText: data.plainLyrics ?? null };
        } else if (data.plainLyrics) {
          result = { status: 'plain', lines: [], plainText: data.plainLyrics };
        } else {
          result = { status: 'not-found', lines: [], plainText: null };
        }

        cache.current.set(fetchCacheKey || fetchTrackId, result);
        setStatus(result.status);
        setLines(result.lines);
        setPlainText(result.plainText);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (prevFetchKey.current !== fetchCacheKey) return;

        const result: CachedLyrics = { status: 'not-found', lines: [], plainText: null };
        cache.current.set(fetchCacheKey || fetchTrackId, result);
        setStatus('not-found');
        setLines([]);
        setPlainText(null);
      })
      .finally(() => clearTimeout(timeout));

    return () => { clearTimeout(timeout); ac.abort(); };
  }, [currentTrack, options.userId, options.storefront]);

  // Compute current line index from playback time
  const currentIndex = useMemo(() => {
    if (lines.length === 0) return -1;

    // Find the last line where time <= currentTime
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lines, currentTime]);

  return { status, lines, plainText, currentIndex };
}
