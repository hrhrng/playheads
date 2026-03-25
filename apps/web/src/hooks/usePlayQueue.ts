/**
 * Global play queue hook — single queue for all conversations.
 *
 * Internal model: queue[0] = now playing, queue.slice(1) = up next.
 * History tracks (sliced off on advance) are kept in a separate array.
 *
 * External model: fullQueue = [...history, ...queue], currentIndex = history.length.
 * This allows bidirectional feed navigation while keeping MusicKit interactions
 * identical to the original slice-based approach.
 *
 * Uses MusicKit native queue for playback ordering and auto-advance.
 * Backend sync sends the full queue + currentIndex.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';
import type { AppleMusicProvider } from '../providers/AppleMusicProvider';

export interface UsePlayQueueReturn {
  /** Full track list: [...history, nowPlaying, ...upNext] */
  queue: UnifiedTrack[];
  /** Index of now-playing track in queue (-1 = none) */
  currentIndex: number;
  nowPlaying: UnifiedTrack | null;
  upNext: UnifiedTrack[];
  addTrack(track: UnifiedTrack): void;
  removeTrack(index: number): void;
  playAtIndex(index: number): Promise<void>;
  skipNext(): Promise<void>;
  skipPrev(): Promise<void>;
  setQueue(tracks: UnifiedTrack[], index?: number): void;
  clear(): void;
}

interface UsePlayQueueParams {
  provider: AppleMusicProvider | null;
  userId: string | null;
}

export function usePlayQueue({ provider, userId }: UsePlayQueueParams): UsePlayQueueReturn & { finishRestore: () => void } {
  // Internal state: queue[0] = now playing (same MusicKit model as before)
  const [upcoming, setUpcoming] = useState<UnifiedTrack[]>([]);
  // History: tracks that have been played (sliced off from queue head)
  const [history, setHistory] = useState<UnifiedTrack[]>([]);

  const upcomingRef = useRef(upcoming);
  upcomingRef.current = upcoming;
  const historyRef = useRef(history);
  historyRef.current = history;

  // Cache metadata for tracks whose MusicKit items may lack full info
  const metadataCache = useRef<Map<string, UnifiedTrack>>(new Map());

  // ── Exposed (external) state ────────────────────────────────────
  const queue = useMemo(() => [...history, ...upcoming], [history, upcoming]);
  const currentIndex = useMemo(
    () => (upcoming.length > 0 ? history.length : -1),
    [history.length, upcoming.length],
  );
  const nowPlaying = upcoming.length > 0 ? upcoming[0] : null;
  const upNext = upcoming.slice(1);

  // ── Backend sync: driven by React state changes ─────────────────
  const isRestoringRef = useRef(true);

  useEffect(() => {
    if (isRestoringRef.current) return;
    if (!userId) return;

    const body = JSON.stringify({ user_id: userId, queue, currentIndex });
    fetch(`${API_BASE}/queue/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(e => console.error('[PlayQueue] sync error:', e));
  }, [queue, currentIndex, userId]);

  // ── beforeunload: persist queue via sendBeacon ──────────────────
  useEffect(() => {
    if (!userId) return;
    const handler = () => {
      const h = historyRef.current;
      const u = upcomingRef.current;
      const fullQueue = [...h, ...u];
      const ci = u.length > 0 ? h.length : -1;
      const body = JSON.stringify({ user_id: userId, queue: fullQueue, currentIndex: ci });
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/queue/sync`, blob);
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [userId]);

  // ── Sync from MusicKit nowPlayingItemDidChange ──────────────────
  // When MusicKit auto-advances, slice the upcoming queue (same as original).
  // Sliced-off tracks are pushed to history.
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onNowPlayingChange((trackId) => {
      if (!trackId) return;
      const q = upcomingRef.current;
      const idx = q.findIndex(t => t.id === trackId);
      console.log('[usePlayQueue] nowPlayingChange: trackId=', trackId, 'idx=', idx, 'queueLen=', q.length);
      if (idx <= 0) return; // already at head or not found — SAME guard as original
      // Move played tracks to history
      setHistory(prev => [...prev, ...q.slice(0, idx)]);
      setUpcoming(q.slice(idx));
    });
    return unsub;
  }, [provider]);

  // ── queueItemsDidChange: intentionally NOT subscribed ───────────
  // React state is the single source of truth for the queue.

  // ── Listen for unresolvable IDs from the provider ───────────────
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onUnresolvableIds((badIds) => {
      setUpcoming(prev => prev.filter(t => !badIds.has(t.id)));
      setHistory(prev => prev.filter(t => !badIds.has(t.id)));
    });
    return unsub;
  }, [provider]);

  // ── Queue operations ────────────────────────────────────────────

  const addTrack = useCallback((track: UnifiedTrack) => {
    metadataCache.current.set(track.id, track);
    // Append to upcoming queue (same as original)
    setUpcoming(prev => [...prev, track]);
    if (provider) {
      if (!provider.playbackState.currentTrack) {
        provider.setDisplayTrack(track);
      }
      provider.addToNativeQueue(track.id).catch(console.error);
    }
  }, [provider]);

  const removeTrack = useCallback((index: number) => {
    const h = historyRef.current;
    const q = upcomingRef.current;

    if (index < h.length) {
      // Removing from history
      setHistory(prev => prev.filter((_, i) => i !== index));
    } else {
      // Removing from upcoming
      const qIdx = index - h.length;
      setUpcoming(prev => {
        const next = prev.filter((_, i) => i !== qIdx);
        if (qIdx === 0 && provider && next.length > 0) {
          // Removed now-playing — play the new head (same as original)
          const songIds = next.map(t => t.id);
          provider.playWithQueue(songIds, 0).catch(console.error);
        }
        return next;
      });
    }
  }, [provider]);

  const playAtIndex = useCallback(async (index: number) => {
    const h = historyRef.current;
    const q = upcomingRef.current;
    const fullLen = h.length + q.length;
    if (index < 0 || index >= fullLen || !provider) return;

    if (index < h.length) {
      // Playing a track from history — reconstruct queue
      const newUpcoming = [...h.slice(index), ...q];
      const newHistory = h.slice(0, index);
      setHistory(newHistory);
      setUpcoming(newUpcoming);
      const songIds = newUpcoming.map(t => t.id);
      await provider.playWithQueue(songIds, 0);
    } else {
      // Playing from upcoming — same as original (slice + playWithQueue)
      const qIdx = index - h.length;
      if (qIdx === 0 && q.length > 0) {
        // Already at head — just replay
        const songIds = q.map(t => t.id);
        await provider.playWithQueue(songIds, 0);
      } else {
        const slicedOff = q.slice(0, qIdx);
        const newUpcoming = q.slice(qIdx);
        setHistory(prev => [...prev, ...slicedOff]);
        setUpcoming(newUpcoming);
        const songIds = newUpcoming.map(t => t.id);
        await provider.playWithQueue(songIds, 0);
      }
    }
  }, [provider]);

  const skipNext = useCallback(async () => {
    if (!provider) return;
    await provider.skipToNext();
    // MusicKit's nowPlayingItemDidChange will slice upcoming + push to history
  }, [provider]);

  const skipPrev = useCallback(async () => {
    if (!provider) return;
    const h = historyRef.current;
    if (h.length === 0) return;
    const q = upcomingRef.current;

    // Move last history track back to head of upcoming
    const lastTrack = h[h.length - 1];
    const newHistory = h.slice(0, -1);
    const newUpcoming = [lastTrack, ...q];
    setHistory(newHistory);
    setUpcoming(newUpcoming);
    const songIds = newUpcoming.map(t => t.id);
    await provider.playWithQueue(songIds, 0);
  }, [provider]);

  /** Called by useMusicProvider during restore — sets queue without triggering sync */
  const setQueueFn = useCallback((tracks: UnifiedTrack[], index?: number) => {
    for (const t of tracks) metadataCache.current.set(t.id, t);
    const idx = index ?? 0;
    if (tracks.length === 0) {
      setHistory([]);
      setUpcoming([]);
    } else {
      setHistory(tracks.slice(0, idx));
      setUpcoming(tracks.slice(idx));
    }
  }, []);

  /** Mark restore as complete — subsequent state changes will sync to backend */
  const finishRestore = useCallback(() => {
    console.log('[usePlayQueue] finishRestore: restore complete, MusicKit sync re-enabled');
    isRestoringRef.current = false;
  }, []);

  const clear = useCallback(() => {
    setUpcoming([]);
    setHistory([]);
  }, []);

  return {
    queue,
    currentIndex,
    nowPlaying,
    upNext,
    addTrack,
    removeTrack,
    playAtIndex,
    skipNext,
    skipPrev,
    setQueue: setQueueFn,
    clear,
    finishRestore,
  };
}
