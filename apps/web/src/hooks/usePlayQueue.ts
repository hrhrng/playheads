/**
 * Global play queue hook — single queue for all conversations.
 *
 * Model: queue[] = full track list, currentIndex = now-playing position.
 * Tracks are never discarded on skip — supports bidirectional feed navigation.
 *
 * Uses MusicKit native queue for playback ordering and auto-advance.
 * Syncs from MusicKit's nowPlayingItemDidChange to update currentIndex.
 *
 * Backend sync is driven by a useEffect on queue/index state —
 * any state change triggers a sync, regardless of the source.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';
import type { AppleMusicProvider } from '../providers/AppleMusicProvider';

export interface UsePlayQueueReturn {
  queue: UnifiedTrack[];
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
  const [queue, setQueue] = useState<UnifiedTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  // Cache metadata for tracks whose MusicKit items may lack full info
  const metadataCache = useRef<Map<string, UnifiedTrack>>(new Map());

  // Derived state
  const nowPlaying = useMemo(
    () => (currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null),
    [queue, currentIndex],
  );
  const upNext = useMemo(
    () => (currentIndex >= 0 ? queue.slice(currentIndex + 1) : []),
    [queue, currentIndex],
  );

  // ── Backend sync: driven by React state changes ─────────────────
  // Skip the very first render (initial empty state) and restore-driven
  // setQueue calls (we don't want to sync back what we just fetched).
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
      const body = JSON.stringify({
        user_id: userId,
        queue: queueRef.current,
        currentIndex: indexRef.current,
      });
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/queue/sync`, blob);
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [userId]);

  // ── Sync from MusicKit nowPlayingItemDidChange ──────────────────
  // When MusicKit auto-advances or changes track, update currentIndex
  // to point at the new track. No tracks are removed.
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onNowPlayingChange((trackId) => {
      if (!trackId) return;
      const q = queueRef.current;
      const idx = q.findIndex(t => t.id === trackId);
      console.log('[usePlayQueue] nowPlayingChange: trackId=', trackId, 'idx=', idx, 'queueLen=', q.length);
      if (idx < 0) return; // not found in our queue
      if (idx === indexRef.current) return; // already there
      setCurrentIndex(idx);
    });
    return unsub;
  }, [provider]);

  // ── queueItemsDidChange: intentionally NOT subscribed ───────────
  // React state is the single source of truth for the queue.
  // All mutations (addTrack, removeTrack, playAtIndex) update React
  // state directly. Auto-advance is handled by nowPlayingItemDidChange.
  // Subscribing to onQueueChange caused queue flicker: MusicKit's
  // internal queue is often incomplete/stale (e.g. 1 track after restore
  // when React has 12) and would overwrite React state.

  // ── Listen for unresolvable IDs from the provider ───────────────
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onUnresolvableIds((badIds) => {
      setQueue(prev => {
        const next = prev.filter(t => !badIds.has(t.id));
        // Adjust currentIndex: count how many removed tracks were before current
        const ci = indexRef.current;
        if (ci >= 0) {
          let removedBefore = 0;
          for (let i = 0; i < ci && i < prev.length; i++) {
            if (badIds.has(prev[i].id)) removedBefore++;
          }
          const wasCurrent = ci < prev.length && badIds.has(prev[ci].id);
          const newIndex = wasCurrent
            ? Math.min(ci - removedBefore, next.length - 1)
            : ci - removedBefore;
          setCurrentIndex(Math.max(newIndex, next.length > 0 ? 0 : -1));
        }
        return next;
      });
    });
    return unsub;
  }, [provider]);

  // ── Queue operations ────────────────────────────────────────────

  const addTrack = useCallback((track: UnifiedTrack) => {
    metadataCache.current.set(track.id, track);
    setQueue(prev => [...prev, track]);
    // If nothing is playing yet, point to the new track
    if (indexRef.current < 0) {
      setCurrentIndex(0);
    }
    if (provider) {
      if (!provider.playbackState.currentTrack) {
        provider.setDisplayTrack(track);
      }
      provider.addToNativeQueue(track.id).catch(console.error);
    }
  }, [provider]);

  const removeTrack = useCallback((index: number) => {
    const ci = indexRef.current;
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setCurrentIndex(-1);
      } else if (index < ci) {
        // Removed before current — shift index back
        setCurrentIndex(ci - 1);
      } else if (index === ci) {
        // Removed the now-playing track — play the next one (or clamp)
        const newIdx = Math.min(ci, next.length - 1);
        setCurrentIndex(newIdx);
        if (provider && next.length > 0) {
          const songIds = next.map(t => t.id);
          provider.playWithQueue(songIds, newIdx).catch(console.error);
        }
      }
      // index > ci: no index adjustment needed
      return next;
    });
  }, [provider]);

  const playAtIndex = useCallback(async (index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length || !provider) return;

    setCurrentIndex(index);
    // Give MusicKit the full queue and start at the clicked index
    const songIds = q.map(t => t.id);
    await provider.playWithQueue(songIds, index);
  }, [provider]);

  const skipNext = useCallback(async () => {
    if (!provider) return;
    await provider.skipToNext();
    // MusicKit's nowPlayingItemDidChange will update currentIndex
  }, [provider]);

  const skipPrev = useCallback(async () => {
    if (!provider) return;
    await provider.skipToPrev();
    // MusicKit's nowPlayingItemDidChange will update currentIndex
  }, [provider]);

  /** Called by useMusicProvider during restore — sets queue without triggering sync */
  const setQueueFn = useCallback((tracks: UnifiedTrack[], index?: number) => {
    for (const t of tracks) metadataCache.current.set(t.id, t);
    setQueue(tracks);
    setCurrentIndex(index ?? (tracks.length > 0 ? 0 : -1));
  }, []);

  /** Mark restore as complete — subsequent state changes will sync to backend */
  const finishRestore = useCallback(() => {
    console.log('[usePlayQueue] finishRestore: restore complete, MusicKit sync re-enabled');
    isRestoringRef.current = false;
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
    setCurrentIndex(-1);
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
