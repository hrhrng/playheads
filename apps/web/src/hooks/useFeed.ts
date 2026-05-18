/**
 * useFeed — TikTok-style endless music feed.
 *
 * Wraps a server-driven feed (/api/feed/next) with a local ring buffer and a
 * single HTMLAudioElement for playback of 30s preview URLs. Works without
 * Apple Music user authorization — the public preview CDN serves everyone.
 *
 * Sources: 'editorial' | 'mood' | 'dream'
 *   editorial: top charts (no params)
 *   mood:      { moodKey: 'focus' | 'sad' | 'high_energy' | 'chill' | 'surprise' }
 *   dream:     { prompt }  — LLM-generated (v2)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface FeedTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationSeconds: number;
  previewUrl?: string;
}

export type FeedSource = 'editorial' | 'mood' | 'dream';

export interface FeedSourceParams {
  moodKey?: string;
  prompt?: string;
  storefront?: string;
  n?: number;
}

const PREFETCH_THRESHOLD = 3; // when buffer ahead drops below this, fetch more

interface FeedState {
  tracks: FeedTrack[];
  index: number;
  source: FeedSource;
  sourceParams: FeedSourceParams;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useFeed(initial?: { source?: FeedSource; params?: FeedSourceParams }) {
  const [state, setState] = useState<FeedState>({
    tracks: [],
    index: 0,
    source: initial?.source || 'editorial',
    sourceParams: initial?.params || {},
    isPlaying: false,
    isLoading: false,
    error: null,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Lazy-init audio element (must happen after user gesture for autoplay policy)
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      audioRef.current = el;
    }
    return audioRef.current;
  }, []);

  // Fetch more tracks for current source — appends to buffer.
  const fetchMore = useCallback(
    async (source: FeedSource, params: FeedSourceParams): Promise<FeedTrack[]> => {
      const qs = new URLSearchParams({ source, n: String(params.n || 10) });
      if (params.moodKey) qs.set('moodKey', params.moodKey);
      if (params.prompt) qs.set('prompt', params.prompt);
      if (params.storefront) qs.set('storefront', params.storefront);

      const res = await fetch(`/api/feed/next?${qs.toString()}`);
      if (!res.ok) throw new Error(`feed/next ${res.status}`);
      const json = (await res.json()) as { tracks: FeedTrack[] };
      return json.tracks.filter((t) => !!t.previewUrl);
    },
    [],
  );

  // Fire-and-forget signal to backend. Failure is non-fatal.
  const sendSignal = useCallback((trackId: string, action: 'play' | 'skip' | 'like' | 'finish') => {
    fetch('/api/feed/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId, action }),
    }).catch(() => {});
  }, []);

  // Switch source — clears buffer, fetches fresh, plays first track.
  const setSource = useCallback(
    async (source: FeedSource, params: FeedSourceParams = {}) => {
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        const tracks = await fetchMore(source, params);
        setState({
          tracks,
          index: 0,
          source,
          sourceParams: params,
          isPlaying: false,
          isLoading: false,
          error: null,
        });
      } catch (e) {
        setState((s) => ({ ...s, isLoading: false, error: String(e) }));
      }
    },
    [fetchMore],
  );

  // Initial fetch on mount.
  useEffect(() => {
    setSource(state.source, state.sourceParams);
    // intentionally only on first mount — setSource handles future changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-prefetch when running low.
  useEffect(() => {
    const remaining = state.tracks.length - state.index - 1;
    if (remaining < PREFETCH_THRESHOLD && !state.isLoading && state.tracks.length > 0) {
      (async () => {
        try {
          const more = await fetchMore(state.source, state.sourceParams);
          setState((s) => ({ ...s, tracks: [...s.tracks, ...more] }));
        } catch {
          // swallow — UI keeps current track playing
        }
      })();
    }
  }, [state.index, state.tracks.length, state.isLoading, state.source, state.sourceParams, fetchMore]);

  const current: FeedTrack | null = state.tracks[state.index] || null;

  // Sync audio element to current track + play state.
  useEffect(() => {
    if (!current?.previewUrl) return;
    const audio = ensureAudio();
    if (audio.src !== current.previewUrl) {
      audio.src = current.previewUrl;
    }
    if (state.isPlaying) {
      audio.play().catch(() => {
        // autoplay blocked — flip back to paused so UI is honest
        setState((s) => ({ ...s, isPlaying: false }));
      });
    } else {
      audio.pause();
    }
  }, [current, state.isPlaying, ensureAudio]);

  // Auto-advance when current preview ends.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      if (current) sendSignal(current.id, 'finish');
      setState((s) => ({ ...s, index: s.index + 1, isPlaying: true }));
    };
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [current, sendSignal]);

  const play = useCallback(() => {
    if (current) sendSignal(current.id, 'play');
    setState((s) => ({ ...s, isPlaying: true }));
  }, [current, sendSignal]);

  const pause = useCallback(() => setState((s) => ({ ...s, isPlaying: false })), []);

  const togglePlay = useCallback(() => setState((s) => ({ ...s, isPlaying: !s.isPlaying })), []);

  const next = useCallback(() => {
    if (current) sendSignal(current.id, 'skip');
    setState((s) => ({ ...s, index: Math.min(s.index + 1, s.tracks.length - 1), isPlaying: true }));
  }, [current, sendSignal]);

  const prev = useCallback(() => {
    setState((s) => ({ ...s, index: Math.max(s.index - 1, 0), isPlaying: true }));
  }, []);

  const like = useCallback(() => {
    if (current) sendSignal(current.id, 'like');
  }, [current, sendSignal]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  return useMemo(
    () => ({
      current,
      tracks: state.tracks,
      index: state.index,
      source: state.source,
      isPlaying: state.isPlaying,
      isLoading: state.isLoading,
      error: state.error,
      setSource,
      play,
      pause,
      togglePlay,
      next,
      prev,
      like,
    }),
    [current, state.tracks, state.index, state.source, state.isPlaying, state.isLoading, state.error, setSource, play, pause, togglePlay, next, prev, like],
  );
}
