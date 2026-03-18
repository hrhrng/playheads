/**
 * Global play queue hook — single queue for all conversations.
 *
 * Uses MusicKit native queue for playback ordering and auto-advance.
 * Mirrors our track array to MusicKit via playWithQueue / addToNativeQueue.
 * Syncs currentIndex from MusicKit's nowPlayingItemDidChange events.
 *
 * If the user switches provider, the queue should be cleared externally.
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

  // ── Backend sync (debounced) ────────────────────────────────────
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<string>('');

  const syncToBackend = useCallback((q: UnifiedTrack[], idx: number) => {
    if (!userId) return;
    const serialized = JSON.stringify(q.map(t => t.id)) + ':' + idx;
    if (serialized === lastSyncedRef.current) return;

    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      lastSyncedRef.current = serialized;
      fetch(`${API_BASE}/queue/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, queue: q, currentIndex: idx }),
      }).catch(e => console.error('[PlayQueue] sync error:', e));
    }, 500);
  }, [userId]);

  // ── Sync currentIndex from MusicKit nowPlayingItemDidChange ─────
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onNowPlayingChange((trackId) => {
      if (!trackId) return;
      const q = queueRef.current;
      const idx = q.findIndex(t => t.id === trackId);
      if (idx >= 0 && idx !== currentIndexRef.current) {
        setCurrentIndex(idx);
        syncToBackend(q, idx);
      }
    });
    return unsub;
  }, [provider, syncToBackend]);

  // ── Queue operations ────────────────────────────────────────────

  const addTrack = useCallback((track: UnifiedTrack) => {
    setQueue(prev => {
      const next = [...prev, track];
      // Append to MusicKit native queue so it auto-advances
      if (provider) {
        provider.addToNativeQueue(track.id).catch(console.error);
      }
      syncToBackend(next, currentIndexRef.current);
      return next;
    });
  }, [provider, syncToBackend]);

  const removeTrack = useCallback((index: number) => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index);
      let newIndex = currentIndexRef.current;
      if (index < newIndex) newIndex--;
      else if (index === newIndex) newIndex = -1;
      setCurrentIndex(newIndex);
      // Rebuild MusicKit queue to reflect removal
      if (provider && next.length > 0 && newIndex >= 0) {
        const songIds = next.map(t => t.id);
        provider.playWithQueue(songIds, newIndex).catch(console.error);
      }
      syncToBackend(next, newIndex);
      return next;
    });
  }, [provider, syncToBackend]);

  const playAtIndex = useCallback(async (index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length || !provider) return;

    setCurrentIndex(index);
    // Set MusicKit queue to ALL songs, start at index — enables native auto-advance
    const songIds = q.map(t => t.id);
    await provider.playWithQueue(songIds, index);
    syncToBackend(q, index);
  }, [provider, syncToBackend]);

  const skipNext = useCallback(async () => {
    if (!provider) return;
    // MusicKit handles skip natively — nowPlayingChange listener updates currentIndex
    await provider.skipToNext();
  }, [provider]);

  const skipPrev = useCallback(async () => {
    if (!provider) return;
    await provider.skipToPrev();
  }, [provider]);

  const setQueueFn = useCallback((tracks: UnifiedTrack[]) => {
    setQueue(tracks);
    syncToBackend(tracks, currentIndexRef.current);
  }, [syncToBackend]);

  const clear = useCallback(() => {
    setQueue([]);
    setCurrentIndex(-1);
    syncToBackend([], -1);
  }, [syncToBackend]);

  // No self-restore here — useMusicProvider handles the full restore
  // (queue + track display) in a single fetch to avoid double-fetching.

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
  };
}
