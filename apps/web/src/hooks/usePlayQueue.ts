/**
 * Global play queue hook — single queue for all conversations.
 *
 * MusicKit is the single source of truth for queue state.
 * React derives queue/history/currentIndex from mk.queue.items + mk.queue.position.
 * A metadata cache enriches MusicKit items with full track data from agent/search.
 *
 * Backend sync sends the full queue + position to D1.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';
import type { AppleMusicProvider } from '../providers/AppleMusicProvider';

export interface UsePlayQueueReturn {
  /** queue[0] = now playing, queue[1..] = up next */
  queue: UnifiedTrack[];
  /** Previously played tracks */
  history: UnifiedTrack[];
  addTrack(track: UnifiedTrack): void;
  addTracks(tracks: UnifiedTrack[]): void;
  /** Insert tracks at head of queue and start playing the first one. */
  playTracks(tracks: UnifiedTrack[]): Promise<void>;
  removeTrack(index: number): void;
  playAtIndex(index: number): Promise<void>;
  playFromHistory(historyIndex: number): Promise<void>;
  skipNext(): Promise<void>;
  finishQueue(): Promise<void>;
  skipPrev(): Promise<void>;
  setQueue(tracks: UnifiedTrack[]): void;
  clear(): void;
}

interface UsePlayQueueParams {
  provider: AppleMusicProvider | null;
  userId: string | null;
}

/** Read derived queue state from the provider's MusicKit queue. */
function readSnapshot(provider: AppleMusicProvider | null) {
  if (!provider) return { items: [] as UnifiedTrack[], position: -1 };
  return provider.getQueueSnapshot();
}

export function usePlayQueue({ provider, userId }: UsePlayQueueParams): UsePlayQueueReturn & { finishRestore: () => void } {
  // Trigger re-renders when MusicKit queue or now-playing changes.
  // We use a simple counter — bumped by MusicKit events — to force re-read.
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick(n => n + 1), []);

  // Subscribe to provider events that indicate queue/position changed
  useEffect(() => {
    if (!provider) return;
    const unsubs = [
      provider.onNowPlayingChange(() => bump()),
      provider.onQueueChange(() => bump()),
    ];
    return () => unsubs.forEach(u => u());
  }, [provider, bump]);

  // ── Derive queue state from MusicKit ──────────────────────────
  const snapshot = readSnapshot(provider);
  const { items, position } = snapshot;
  const queue = position >= 0 && position < items.length
    ? items.slice(position)
    : items.length > 0 ? items : [];
  const history = position > 0 ? items.slice(0, position) : [];

  const providerRef = useRef(provider);
  providerRef.current = provider;

  // ── Backend sync ──────────────────────────────────────────────
  const isRestoringRef = useRef(true);

  useEffect(() => {
    if (isRestoringRef.current) return;
    if (!userId || !provider) return;

    const body = JSON.stringify({
      user_id: userId,
      queue: items,
      currentIndex: position,
    });
    fetch(`${API_BASE}/queue/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(e => console.error('[PlayQueue] sync error:', e));
  }, [items, position, userId, provider]);

  // ── beforeunload: persist via sendBeacon ──────────────────────
  useEffect(() => {
    if (!userId) return;
    const handler = () => {
      const p = providerRef.current;
      if (!p) return;
      const snap = p.getQueueSnapshot();
      const body = JSON.stringify({
        user_id: userId,
        queue: snap.items,
        currentIndex: snap.position,
      });
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/queue/sync`, blob);
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [userId]);

  // ── Queue operations ──────────────────────────────────────────

  const addTrack = useCallback((track: UnifiedTrack) => {
    const p = providerRef.current;
    if (!p) return;
    p.cacheTrackMetadata(track);
    if (!p.playbackState.currentTrack) {
      p.setDisplayTrack(track);
    }
    p.addToNativeQueue(track.id).catch(console.error);
  }, []);

  /** Batch add multiple tracks in a single MusicKit API call. */
  const addTracks = useCallback((tracks: UnifiedTrack[]) => {
    const p = providerRef.current;
    if (!p || tracks.length === 0) return;
    for (const t of tracks) p.cacheTrackMetadata(t);
    if (!p.playbackState.currentTrack) {
      p.setDisplayTrack(tracks[0]);
    }
    p.addManyToNativeQueue(tracks.map(t => t.id)).catch(console.error);
  }, []);

  /** Insert tracks at head of queue (playNext) and skip to the first one. */
  const playTracks = useCallback(async (tracks: UnifiedTrack[]) => {
    const p = providerRef.current;
    if (!p || tracks.length === 0) return;
    for (const t of tracks) p.cacheTrackMetadata(t);
    p.setDisplayTrack(tracks[0]);
    await p.insertNextInQueue(tracks.map(t => t.id));
    await p.skipToNext();
  }, []);

  const removeTrack = useCallback((index: number) => {
    const p = providerRef.current;
    if (!p) return;
    const snap = p.getQueueSnapshot();
    const absoluteIndex = snap.position + index;
    if (absoluteIndex < 0 || absoluteIndex >= snap.items.length) return;
    p.removeFromQueue(absoluteIndex - snap.position);
  }, []);

  const playAtIndex = useCallback(async (index: number) => {
    const p = providerRef.current;
    if (!p || p.playbackState.isTransitioning) return;
    const snap = p.getQueueSnapshot();
    const absoluteIndex = snap.position + index;
    if (absoluteIndex < 0 || absoluteIndex >= snap.items.length) return;
    p.setDisplayTrack(snap.items[absoluteIndex]);
    await p.changeToIndex(absoluteIndex);
  }, []);

  const playFromHistory = useCallback(async (historyIndex: number) => {
    const p = providerRef.current;
    if (!p || p.playbackState.isTransitioning) return;
    const snap = p.getQueueSnapshot();
    if (historyIndex < 0 || historyIndex >= snap.position) return;
    p.setDisplayTrack(snap.items[historyIndex]);
    await p.changeToIndex(historyIndex);
  }, []);

  const skipNext = useCallback(async () => {
    const p = providerRef.current;
    if (!p) return;
    await p.skipToNext();
  }, []);

  /** End playback: stop + remove current item so it moves to "history" (items before position). */
  const finishQueue = useCallback(async () => {
    const p = providerRef.current;
    if (!p) return;
    try {
      const mk = (p as any).musicKit;
      if (!mk) return;
      await mk.stop();
      // Remove the current (last) item from the queue.
      // MusicKit shifts position, effectively making all remaining items "history".
      const pos = mk.queue?.position ?? -1;
      if (pos >= 0) {
        await mk.queue.remove(pos);
      }
    } catch (e) {
      console.warn('[finishQueue] error:', e);
    }
    // Clear display track
    (p as any).updateState({ currentTrack: null, isPlaying: false });
    bump();
  }, [bump]);

  const skipPrev = useCallback(async () => {
    const p = providerRef.current;
    if (!p) return;
    await p.skipToPrev();
  }, []);

  /** Called by useMusicProvider during restore. Caches metadata + primes MusicKit. */
  const setQueueFn = useCallback((tracks: UnifiedTrack[]) => {
    const p = providerRef.current;
    if (!p) return;
    for (const t of tracks) p.cacheTrackMetadata(t);
    // MusicKit queue is set by useMusicProvider via setQueueWithoutPlaying.
    // Force a re-render so derived state picks up the primed queue.
    bump();
  }, [bump]);

  const finishRestore = useCallback(() => {
    console.log('[usePlayQueue] finishRestore: restore complete, sync re-enabled');
    isRestoringRef.current = false;
    bump();
  }, [bump]);

  const clear = useCallback(() => {
    // No direct MusicKit "clear queue" API — stop playback instead
    const p = providerRef.current;
    if (p) {
      try { (p as any).musicKit?.stop(); } catch { /* ignore */ }
    }
    bump();
  }, [bump]);

  return {
    queue,
    history,
    addTrack,
    addTracks,
    playTracks,
    removeTrack,
    playAtIndex,
    playFromHistory,
    skipNext,
    finishQueue,
    skipPrev,
    setQueue: setQueueFn,
    clear,
    finishRestore,
  } as UsePlayQueueReturn & { finishRestore: () => void };
}
