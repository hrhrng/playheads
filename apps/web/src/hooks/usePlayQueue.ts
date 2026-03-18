/**
 * Global play queue hook — single queue for all conversations.
 *
 * Model: queue[0] = now playing, queue.slice(1) = up next.
 * No currentIndex — position is implicit.
 *
 * Uses MusicKit native queue for playback ordering and auto-advance.
 * Syncs from MusicKit's nowPlayingItemDidChange to slice played tracks.
 *
 * Persisted locally via localStorage — frontend is ground truth.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { UnifiedTrack } from '../providers/types';
import type { AppleMusicProvider } from '../providers/AppleMusicProvider';

const STORAGE_KEY = 'playheads_queue';

function loadFromLocalStorage(): UnifiedTrack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UnifiedTrack[];
  } catch {
    return [];
  }
}

function saveToLocalStorage(queue: UnifiedTrack[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage errors
  }
}

export interface UsePlayQueueReturn {
  queue: UnifiedTrack[];
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

export function usePlayQueue({ provider }: UsePlayQueueParams): UsePlayQueueReturn {
  const [queue, setQueue] = useState<UnifiedTrack[]>(() => loadFromLocalStorage());

  const queueRef = useRef(queue);
  queueRef.current = queue;

  // ── Persist to localStorage on every state change ───────────────
  useEffect(() => {
    saveToLocalStorage(queue);
  }, [queue]);

  // ── Sync from MusicKit nowPlayingItemDidChange ──────────────────
  // When MusicKit auto-advances or changes track, slice the queue so
  // the new track becomes queue[0]. Everything before it is gone.
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onNowPlayingChange((trackId) => {
      if (!trackId) return;
      const q = queueRef.current;
      const idx = q.findIndex(t => t.id === trackId);
      if (idx <= 0) return; // already at head or not found
      setQueue(q.slice(idx));
    });
    return unsub;
  }, [provider]);

  // ── Listen for unresolvable IDs from the provider ───────────────
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onUnresolvableIds((badIds) => {
      setQueue(prev => prev.filter(t => !badIds.has(t.id)));
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
      if (index === 0 && provider && next.length > 0) {
        // Removed the now-playing track — play the new head
        const songIds = next.map(t => t.id);
        provider.playWithQueue(songIds, 0).catch(console.error);
      }
      return next;
    });
  }, [provider]);

  const playAtIndex = useCallback(async (index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length || !provider) return;

    // Slice so clicked track becomes queue[0]
    const newQueue = q.slice(index);
    setQueue(newQueue);
    const songIds = newQueue.map(t => t.id);
    await provider.playWithQueue(songIds, 0);
  }, [provider]);

  const skipNext = useCallback(async () => {
    if (!provider) return;
    await provider.skipToNext();
    // MusicKit's nowPlayingItemDidChange will trigger the queue slice
  }, [provider]);

  const skipPrev = useCallback(async () => {
    if (!provider) return;
    await provider.skipToPrev();
  }, [provider]);

  const setQueueFn = useCallback((tracks: UnifiedTrack[]) => {
    setQueue(tracks);
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
  }, []);

  return {
    queue,
    addTrack,
    removeTrack,
    playAtIndex,
    skipNext,
    skipPrev,
    setQueue: setQueueFn,
    clear,
  };
}
