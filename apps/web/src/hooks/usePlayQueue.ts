/**
 * Global play queue hook — single queue for all conversations.
 *
 * Model: queue[0] = now playing, queue.slice(1) = up next.
 * No currentIndex — position is implicit.
 *
 * Uses MusicKit native queue for playback ordering and auto-advance.
 * Syncs from MusicKit's nowPlayingItemDidChange to slice played tracks.
 *
 * Backend sync is driven by a useEffect on queue state —
 * any state change triggers a sync, regardless of the source.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';
import type { AppleMusicProvider } from '../providers/AppleMusicProvider';

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

export function usePlayQueue({ provider, userId }: UsePlayQueueParams): UsePlayQueueReturn {
  const [queue, setQueue] = useState<UnifiedTrack[]>([]);

  const queueRef = useRef(queue);
  queueRef.current = queue;

  // Cache metadata for tracks whose MusicKit items may lack full info
  const metadataCache = useRef<Map<string, UnifiedTrack>>(new Map());

  // ── Backend sync: driven by React state changes ─────────────────
  // Skip the very first render (initial empty state) and restore-driven
  // setQueue calls (we don't want to sync back what we just fetched).
  const isRestoringRef = useRef(true);

  useEffect(() => {
    if (isRestoringRef.current) return;
    if (!userId) return;

    const body = JSON.stringify({ user_id: userId, queue });
    fetch(`${API_BASE}/queue/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(e => console.error('[PlayQueue] sync error:', e));
  }, [queue, userId]);

  // ── beforeunload: persist queue via sendBeacon ──────────────────
  useEffect(() => {
    if (!userId) return;
    const handler = () => {
      const body = JSON.stringify({
        user_id: userId,
        queue: queueRef.current,
      });
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/queue/sync`, blob);
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [userId]);

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

  // ── Sync from MusicKit queueItemsDidChange ──────────────────────
  // Each time MusicKit's queue changes, read the native queue and update
  // React state, enriching with cached metadata when MusicKit lacks it.
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onQueueChange(() => {
      const mkItems = provider.getNativeQueue();
      setQueue(mkItems.map(t =>
        t.name !== 'Unknown' ? t : (metadataCache.current.get(t.id) ?? t)
      ));
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
    metadataCache.current.set(track.id, track);
    if (provider) {
      // Show first track immediately in player bar
      if (!provider.playbackState.currentTrack) {
        provider.setDisplayTrack(track);
      }
      // Serialized playLater → queueItemsDidChange will update React state
      provider.addToNativeQueue(track.id).catch(console.error);
    }
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

  /** Called by useMusicProvider during restore — sets queue without triggering sync */
  const setQueueFn = useCallback((tracks: UnifiedTrack[]) => {
    for (const t of tracks) metadataCache.current.set(t.id, t);
    setQueue(tracks);
  }, []);

  /** Mark restore as complete — subsequent state changes will sync to backend */
  const finishRestore = useCallback(() => {
    isRestoringRef.current = false;
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
    finishRestore,
  } as UsePlayQueueReturn & { finishRestore: () => void };
}
