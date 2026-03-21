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
 * Get the MusicKit singleton instance.
 * MusicKit v3 exposes getInstance() on the global.
 */
function getMusicKitInstance(): any {
  try {
    const mk = (window as any).MusicKit;
    if (!mk) return null;
    // MusicKit v3: getInstance() returns the configured singleton
    if (typeof mk.getInstance === 'function') {
      return mk.getInstance();
    }
    return null;
  } catch {
    return null;
  }
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
    let cancelled = false;
    fetchingRef.current = trackId;

    const fetchLyrics = async () => {
      setIsLoading(true);
      try {
        const mk = getMusicKitInstance();
        if (!mk?.api?.music) {
          console.warn('[useLyrics] MusicKit instance or API not available');
          setLyrics([]);
          return;
        }

        // Try multiple approaches to get lyrics

        // Approach 1: Dedicated lyrics endpoint
        // GET /v1/catalog/{storefront}/songs/{id}/lyrics
        let ttmlContent: string | null = null;

        try {
          const lyricsResponse = await mk.api.music(
            `v1/catalog/${storefrontId}/songs/${trackId}/lyrics`
          );
          if (cancelled) return;

          const lyricsData = lyricsResponse?.data?.data?.[0] || lyricsResponse?.data?.[0];
          ttmlContent = lyricsData?.attributes?.ttml || null;
          console.log('[useLyrics] Dedicated endpoint result:', ttmlContent ? 'has TTML' : 'no TTML');
        } catch (e: any) {
          console.log('[useLyrics] Dedicated lyrics endpoint failed:', e?.message || e);
        }

        // Approach 2: Songs endpoint with include=lyrics
        if (!ttmlContent) {
          try {
            const songResponse = await mk.api.music(
              `v1/catalog/${storefrontId}/songs/${trackId}`,
              { include: 'lyrics' }
            );
            if (cancelled) return;

            const songData = songResponse?.data?.data?.[0] || songResponse?.data?.[0];
            const lyricsRel = songData?.relationships?.lyrics?.data?.[0];
            ttmlContent = lyricsRel?.attributes?.ttml || null;
            console.log('[useLyrics] Include=lyrics result:', ttmlContent ? 'has TTML' : 'no TTML');
          } catch (e: any) {
            console.log('[useLyrics] Include=lyrics endpoint failed:', e?.message || e);
          }
        }

        if (cancelled) return;

        if (ttmlContent) {
          const parsed = parseTTML(ttmlContent);
          console.log(`[useLyrics] Parsed ${parsed.length} lyric lines for track ${trackId}`);
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
          console.log(`[useLyrics] No lyrics available for track ${trackId}`);
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
      cancelled = true;
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
