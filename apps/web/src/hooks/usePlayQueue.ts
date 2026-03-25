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
  /** Tracks that have been played (sliced off). Most recent at end. */
  history: UnifiedTrack[];
  addTrack(track: UnifiedTrack): void;
  removeTrack(index: number): void;
  playAtIndex(index: number): Promise<void>;
  /** Play a track from history by its index. Restores it + everything after to the queue head. */
  playFromHistory(historyIndex: number): Promise<void>;
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
  const [history, setHistory] = useState<UnifiedTrack[]>([]);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const historyRef = useRef(history);
  historyRef.current = history;

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
      console.log('[usePlayQueue] nowPlayingChange: trackId=', trackId, 'idx=', idx, 'queueLen=', q.length);
      if (idx <= 0) return; // already at head or not found
      setHistory(prev => [...prev, ...q.slice(0, idx)]);
      setQueue(q.slice(idx));
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
      setQueue(prev => prev.filter(t => !badIds.has(t.id)));
    });
    return unsub;
  }, [provider]);

  // ── Queue operations ────────────────────────────────────────────

  const addTrack = useCallback((track: UnifiedTrack) => {
    metadataCache.current.set(track.id, track);
    // Directly update React queue — don't rely on MusicKit round-trip
    setQueue(prev => [...prev, track]);
    if (provider) {
      if (!provider.playbackState.currentTrack) {
        provider.setDisplayTrack(track);
      }
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

    // Slice so clicked track becomes queue[0]; save skipped tracks to history
    if (index > 0) setHistory(prev => [...prev, ...q.slice(0, index)]);
    const newQueue = q.slice(index);
    setQueue(newQueue);
    // Show new track artwork immediately before MusicKit loads
    provider.setDisplayTrack(newQueue[0]);
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
    const h = historyRef.current;
    if (h.length === 0) {
      await provider.skipToPrev();
      return;
    }
    // Pop last history track, prepend to queue, play
    const lastTrack = h[h.length - 1];
    const newHistory = h.slice(0, -1);
    const q = queueRef.current;
    const newQueue = [lastTrack, ...q];
    setHistory(newHistory);
    setQueue(newQueue);
    // Show new track artwork immediately before MusicKit loads
    provider.setDisplayTrack(lastTrack);
    const songIds = newQueue.map(t => t.id);
    await provider.playWithQueue(songIds, 0);
  }, [provider]);

  const playFromHistory = useCallback(async (historyIndex: number) => {
    const h = historyRef.current;
    const q = queueRef.current;
    if (historyIndex < 0 || historyIndex >= h.length || !provider) return;
    // Restore history[historyIndex..] + current queue as the new queue
    const restored = h.slice(historyIndex);
    const newQueue = [...restored, ...q];
    const newHistory = h.slice(0, historyIndex);
    setHistory(newHistory);
    setQueue(newQueue);
    // Show new track artwork immediately before MusicKit loads
    provider.setDisplayTrack(restored[0]);
    const songIds = newQueue.map(t => t.id);
    await provider.playWithQueue(songIds, 0);
  }, [provider]);

  /** Called by useMusicProvider during restore — sets queue without triggering sync */
  const setQueueFn = useCallback((tracks: UnifiedTrack[]) => {
    for (const t of tracks) metadataCache.current.set(t.id, t);
    setQueue(tracks);
  }, []);

  /** Mark restore as complete — subsequent state changes will sync to backend */
  const finishRestore = useCallback(() => {
    console.log('[usePlayQueue] finishRestore: restore complete, MusicKit sync re-enabled');
    isRestoringRef.current = false;
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
    setHistory([]);
  }, []);

  return {
    queue,
    history,
    addTrack,
    removeTrack,
    playAtIndex,
    playFromHistory,
    skipNext,
    skipPrev,
    setQueue: setQueueFn,
    clear,
    finishRestore,
  } as UsePlayQueueReturn & { finishRestore: () => void };
}
