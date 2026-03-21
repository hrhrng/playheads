/**
 * useLyrics - Fetches and manages lyrics data from Apple Music.
 *
 * Uses the MusicKit JS API to fetch TTML lyrics for the current track,
 * parses them, and tracks the current line based on playback position.
 *
 * @module hooks/useLyrics
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { parseTTML, findCurrentLineIndex, type LyricLine } from '../utils/ttmlParser';
import type { PlaybackTime } from '../types';

export type { LyricLine };

interface UseLyricsParams {
  trackId: string | null;
  playbackTime: PlaybackTime;
  storefrontId: string;
  isAppleMusicAuthorized: boolean;
}

export interface UseLyricsReturn {
  lyrics: LyricLine[];
  currentLineIndex: number;
  currentLine: string | null;
  nextLine: string | null;
  hasLyrics: boolean;
  isLoading: boolean;
}

// In-memory cache: trackId → parsed lyrics
const lyricsCache = new Map<string, LyricLine[]>();
// Cache for tracks we know have no lyrics
const noLyricsCache = new Set<string>();

/**
 * Get the MusicKit singleton instance (if available).
 * MusicKit.configure() returns the same instance on subsequent calls,
 * but we can also access it via the getInstance() pattern.
 */
function getMusicKitInstance(): any {
  // MusicKit v3 stores the instance on the global
  return (window as any).MusicKit?.getInstance?.() || null;
}

export function useLyrics({
  trackId,
  playbackTime,
  storefrontId,
  isAppleMusicAuthorized,
}: UseLyricsParams): UseLyricsReturn {
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchingRef = useRef<string | null>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!trackId || !isAppleMusicAuthorized) {
      setLyrics([]);
      return;
    }

    // Check caches
    if (noLyricsCache.has(trackId)) {
      setLyrics([]);
      return;
    }

    const cached = lyricsCache.get(trackId);
    if (cached) {
      setLyrics(cached);
      return;
    }

    // Fetch from API
    const abortController = new AbortController();
    fetchingRef.current = trackId;

    const fetchLyrics = async () => {
      setIsLoading(true);
      try {
        const mk = getMusicKitInstance();
        if (!mk) {
          setLyrics([]);
          return;
        }

        // Apple Music catalog lyrics API
        // The song ID might have a prefix like 'i.' for library items
        const catalogId = trackId.startsWith('i.') ? trackId : trackId;
        const response = await mk.api.music(
          `v1/catalog/${storefrontId}/songs/${catalogId}`,
          { include: 'lyrics' }
        );

        if (abortController.signal.aborted) return;

        // Extract TTML from response
        const songData = (response?.data as any)?.data?.[0];
        const lyricsRelationship = songData?.relationships?.lyrics?.data?.[0];
        const ttmlContent = lyricsRelationship?.attributes?.ttml;

        if (ttmlContent) {
          const parsed = parseTTML(ttmlContent);
          if (parsed.length > 0) {
            lyricsCache.set(trackId, parsed);
            if (fetchingRef.current === trackId) {
              setLyrics(parsed);
            }
          } else {
            noLyricsCache.add(trackId);
            if (fetchingRef.current === trackId) {
              setLyrics([]);
            }
          }
        } else {
          noLyricsCache.add(trackId);
          if (fetchingRef.current === trackId) {
            setLyrics([]);
          }
        }
      } catch (err) {
        console.warn('[useLyrics] Failed to fetch lyrics:', err);
        noLyricsCache.add(trackId);
        if (fetchingRef.current === trackId) {
          setLyrics([]);
        }
      } finally {
        if (fetchingRef.current === trackId) {
          setIsLoading(false);
        }
      }
    };

    fetchLyrics();

    return () => {
      abortController.abort();
    };
  }, [trackId, storefrontId, isAppleMusicAuthorized]);

  // Compute current line index from playback time
  const currentLineIndex = useMemo(
    () => findCurrentLineIndex(lyrics, playbackTime?.current || 0),
    [lyrics, playbackTime?.current]
  );

  const currentLine = currentLineIndex >= 0 ? lyrics[currentLineIndex]?.text ?? null : null;
  const nextLine = currentLineIndex >= 0 && currentLineIndex + 1 < lyrics.length
    ? lyrics[currentLineIndex + 1]?.text ?? null
    : null;

  const hasLyrics = lyrics.length > 0;

  return {
    lyrics,
    currentLineIndex,
    currentLine,
    nextLine,
    hasLyrics,
    isLoading,
  };
}
