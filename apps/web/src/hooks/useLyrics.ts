import { useEffect, useRef, useState, useMemo } from 'react';
import { parseLRC } from '../lib/lrcParser';
import type { UnifiedTrack } from '../providers/types';
import type { LyricLine, LyricsState, LyricsStatus } from '../types/lyrics';

interface CachedLyrics {
  status: LyricsStatus;
  lines: LyricLine[];
  plainText: string | null;
}

/**
 * Fetch and track synced lyrics for the current track.
 *
 * - Fetches from LRCLIB on track change (by id)
 * - Caches results per track id for the session
 * - Computes the active line index from currentTime
 */
export function useLyrics(
  currentTrack: UnifiedTrack | null,
  currentTime: number,
): LyricsState {
  const [status, setStatus] = useState<LyricsStatus>('idle');
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [plainText, setPlainText] = useState<string | null>(null);

  const cache = useRef<Map<string, CachedLyrics>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const prevTrackId = useRef<string | null>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    const trackId = currentTrack?.id ?? null;

    // Same track — no refetch
    if (trackId === prevTrackId.current) return;
    prevTrackId.current = trackId;

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
    const cached = cache.current.get(trackId);
    if (cached) {
      setStatus(cached.status);
      setLines(cached.lines);
      setPlainText(cached.plainText);
      return;
    }

    // Fetch from LRCLIB
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus('loading');
    setLines([]);
    setPlainText(null);

    const params = new URLSearchParams({
      artist_name: currentTrack.artist || '',
      track_name: currentTrack.name || '',
      album_name: currentTrack.album || '',
      duration: String(Math.round(currentTrack.durationSeconds || 0)),
    });

    fetch(`https://lrclib.net/api/get?${params}`, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Playheads/1.0' },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: { syncedLyrics?: string | null; plainLyrics?: string | null }) => {
        let result: CachedLyrics;

        if (data.syncedLyrics) {
          const parsed = parseLRC(data.syncedLyrics);
          result = { status: 'synced', lines: parsed, plainText: data.plainLyrics ?? null };
        } else if (data.plainLyrics) {
          result = { status: 'plain', lines: [], plainText: data.plainLyrics };
        } else {
          result = { status: 'not-found', lines: [], plainText: null };
        }

        cache.current.set(trackId, result);
        setStatus(result.status);
        setLines(result.lines);
        setPlainText(result.plainText);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;

        const result: CachedLyrics = { status: 'not-found', lines: [], plainText: null };
        cache.current.set(trackId, result);
        setStatus('not-found');
        setLines([]);
        setPlainText(null);
      });

    return () => ac.abort();
  }, [currentTrack]);

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
