/**
 * Global play queue hook — single queue for all conversations.
 *
 * Uses MusicKit native queue for playback ordering and auto-advance.
 * Mirrors our track array to MusicKit via playWithQueue / addToNativeQueue.
 * Syncs currentIndex from MusicKit's nowPlayingItemDidChange events.
 *
 * Backend sync is driven by a useEffect on queue/currentIndex state —
 * any state change triggers a sync, regardless of the source.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';
import type { AppleMusicProvider } from '../providers/AppleMusicProvider';

export interface UsePlayQueueReturn {
  queue: UnifiedTrack[];
  currentIndex: number;
  addTrack(track: UnifiedTrack): void;
  removeTrack(index: number): void;
  playAtIndex(index: number): Promise<void>;
  skipNext(): Promise<void>;
  skipPrev(): Promise<void>;
  setQueue(tracks: UnifiedTrack[]): void;
  clear(): void;
}

interface UsePlayQueueParams {
  provider: AppleMusicProvider | null;
  userId: string | null;
}

export function usePlayQueue({ provider, userId }: UsePlayQueueParams): UsePlayQueueReturn {
  const [queue, setQueue] = useState<UnifiedTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // ── Backend sync: driven by React state changes ─────────────────
  // Skip the very first render (initial empty state) and restore-driven
  // setQueue calls (we don't want to sync back what we just fetched).
  const isRestoringRef = useRef(true);

  useEffect(() => {
    // Skip during restore phase
    if (isRestoringRef.current) return;
    if (!userId) return;

    const body = JSON.stringify({ user_id: userId, queue, currentIndex });
    fetch(`${API_BASE}/queue/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(e => console.error('[PlayQueue] sync error:', e));
  }, [queue, currentIndex, userId]);

  // ── Sync from MusicKit nowPlayingItemDidChange ──────────────────
  // When MusicKit auto-advances, remove all tracks before the new one
  // (they've been played) and keep currentIndex at 0.
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onNowPlayingChange((trackId) => {
      if (!trackId) return;
      const q = queueRef.current;
      const prevIdx = currentIndexRef.current;
      const newIdx = q.findIndex(t => t.id === trackId);
      if (newIdx < 0 || newIdx === prevIdx) return;

      if (newIdx > prevIdx && prevIdx >= 0) {
        // Moved forward — remove played tracks (indices 0..newIdx-1)
        const remaining = q.slice(newIdx);
        setQueue(remaining);
        setCurrentIndex(0);
      } else {
        // Moved backward (skipPrev) or first play — just update index
        setCurrentIndex(newIdx);
      }
    });
    return unsub;
  }, [provider]);

  // ── Queue operations ────────────────────────────────────────────

  const addTrack = useCallback((track: UnifiedTrack) => {
    setQueue(prev => {
      const next = [...prev, track];
      if (provider) {
        provider.addToNativeQueue(track.id).catch(console.error);
      }
      return next;
    });
  }, [provider]);

  const removeTrack = useCallback((index: number) => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index);
      let newIndex = currentIndexRef.current;
      if (index < newIndex) newIndex--;
      else if (index === newIndex) newIndex = -1;
      setCurrentIndex(newIndex);
      if (provider && next.length > 0 && newIndex >= 0) {
        const songIds = next.map(t => t.id);
        provider.playWithQueue(songIds, newIndex).catch(console.error);
      }
      return next;
    });
  }, [provider]);

  const playAtIndex = useCallback(async (index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length || !provider) return;

    setCurrentIndex(index);
    const songIds = q.map(t => t.id);
    await provider.playWithQueue(songIds, index);
  }, [provider]);

  const skipNext = useCallback(async () => {
    if (!provider) return;
    await provider.skipToNext();
  }, [provider]);

  const skipPrev = useCallback(async () => {
    if (!provider) return;
    await provider.skipToPrev();
  }, [provider]);

  /** Called by useMusicProvider during restore — sets queue without triggering sync */
  const setQueueFn = useCallback((tracks: UnifiedTrack[]) => {
    setQueue(tracks);
  }, []);

  /** Mark restore as complete — subsequent state changes will sync to backend */
  const finishRestore = useCallback(() => {
    isRestoringRef.current = false;
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
    setCurrentIndex(-1);
  }, []);

  return {
    queue,
    currentIndex,
    addTrack,
    removeTrack,
    playAtIndex,
    skipNext,
    skipPrev,
    setQueue: setQueueFn,
    clear,
    finishRestore,
  } as UsePlayQueueReturn & { finishRestore: () => void };
}
