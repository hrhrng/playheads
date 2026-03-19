/**
 * useLyrics — fetches timed lyrics from Apple Music API and tracks current line.
 */

import { useState, useEffect, useRef, useMemo } from 'react';

export interface LyricLine {
  startTime: number;
  endTime: number;
  text: string;
}

interface UseLyricsReturn {
  /** All parsed lyric lines */
  lines: LyricLine[];
  /** Index of the line currently being sung (-1 if none) */
  currentIndex: number;
  /** Whether lyrics are being fetched */
  isLoading: boolean;
}

/** Convert TTML time string "HH:MM:SS.mmm" or "MM:SS.mmm" to seconds */
function parseTime(t: string): number {
  const parts = t.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(t) || 0;
}

/** Parse TTML lyrics XML into LyricLine[] */
function parseTTML(ttml: string): LyricLine[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(ttml, 'text/xml');
  const lines: LyricLine[] = [];

  // Each <p> with begin/end is a lyric line
  const paragraphs = doc.querySelectorAll('p[begin]');
  for (const p of paragraphs) {
    const begin = p.getAttribute('begin');
    const end = p.getAttribute('end');
    // Text content: concatenate all text nodes / spans
    const text = (p.textContent || '').trim();
    if (begin && end && text) {
      lines.push({
        startTime: parseTime(begin),
        endTime: parseTime(end),
        text,
      });
    }
  }

  return lines;
}

/** Get configured MusicKit instance */
function getMusicKitInstance(): any {
  try {
    return (window as any).MusicKit?.getInstance?.();
  } catch {
    return null;
  }
}

export function useLyrics(
  trackId: string | undefined,
  currentTime: number,
): UseLyricsReturn {
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchedId = useRef<string | null>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!trackId || trackId === lastFetchedId.current) return;

    let cancelled = false;
    lastFetchedId.current = trackId;
    setLines([]);
    setIsLoading(true);

    (async () => {
      try {
        const mk = getMusicKitInstance();
        if (!mk) return;

        const storefront = mk.storefrontId || 'us';
        // Fetch song with lyrics relationship
        const res = await mk.api.music(
          `v1/catalog/${storefront}/songs/${trackId}`,
          { include: 'lyrics' },
        );

        if (cancelled) return;

        const songData = res?.data?.data?.[0];
        const lyricsRelationship = songData?.relationships?.lyrics?.data;

        if (lyricsRelationship?.length > 0) {
          const ttml = lyricsRelationship[0]?.attributes?.ttml;
          if (ttml) {
            setLines(parseTTML(ttml));
            return;
          }
        }

        // Fallback: try direct lyrics endpoint
        const lyricsRes = await mk.api.music(
          `v1/catalog/${storefront}/songs/${trackId}/lyrics`,
        );
        if (cancelled) return;

        const lyricsData = lyricsRes?.data?.data?.[0];
        const ttml = lyricsData?.attributes?.ttml;
        if (ttml) {
          setLines(parseTTML(ttml));
        }
      } catch (e) {
        // Lyrics not available — silently ignore
        console.debug('[useLyrics] Could not fetch lyrics:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [trackId]);

  // Find current line index based on playback time
  const currentIndex = useMemo(() => {
    if (lines.length === 0) return -1;
    // Find the line that contains the current time
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].startTime) {
        // Check if we haven't passed the end of this line
        if (currentTime <= lines[i].endTime) return i;
        // Between lines — show the next upcoming line as "current"
        if (i < lines.length - 1) return i + 1;
        return i;
      }
    }
    return 0; // Before first line — show it
  }, [lines, currentTime]);

  return { lines, currentIndex, isLoading };
}
