/**
 * Global play queue hook — derives queue state from MusicKit.
 *
 * MusicKit queue is the single source of truth for ordering and position.
 * React state here is derived from MusicKit's queueItemsDidChange events.
 *
 * Metadata cache: tracks added via addTrack() are cached locally so the UI
 * can display name/artist/artwork immediately (before MusicKit resolves them).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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

export function usePlayQueue({ provider }: UsePlayQueueParams): UsePlayQueueReturn {
  const [queue, setQueue] = useState<UnifiedTrack[]>([]);

  const queueRef = useRef(queue);
  queueRef.current = queue;

  // Metadata cache: tracks added locally before MusicKit resolves them
  const metadataCache = useRef<Map<string, UnifiedTrack>>(new Map());

  // ── Sync from MusicKit queueItemsDidChange ───────────────────────
  // MusicKit is ground truth — read queue from it whenever it changes.
  useEffect(() => {
    if (!provider) return;
    const unsub = provider.onQueueChange(() => {
      const mkItems = provider.getNativeQueue();
      // Merge: use MusicKit data when available, fall back to local cache
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
      for (const id of badIds) metadataCache.current.delete(id);
    });
    return unsub;
  }, [provider]);

  // ── Queue operations ────────────────────────────────────────────

  const addTrack = useCallback((track: UnifiedTrack) => {
    metadataCache.current.set(track.id, track);
    if (provider) {
      // If nothing is showing in the player yet, display this track immediately (paused).
      if (!provider.playbackState.currentTrack) {
        provider.setDisplayTrack(track);
      }
      // Optimistic update: show the track immediately without waiting for
      // queueItemsDidChange (MusicKit may not fire it until playback starts).
      setQueue(prev => {
        // Avoid duplicates if MusicKit fires queueItemsDidChange before us.
        if (prev.some(t => t.id === track.id)) return prev;
        return [...prev, track];
      });
      provider.addToNativeQueue(track.id).catch(console.error);
    }
  }, [provider]);

  const removeTrack = useCallback((index: number) => {
    if (!provider) return;
    const q = queueRef.current;
    if (index === 0 && q.length > 1) {
      // Removing now-playing track — restart queue from next track
      const remaining = q.slice(1);
      const songIds = remaining.map(t => t.id);
      provider.playWithQueue(songIds, 0).catch(console.error);
    } else {
      provider.removeFromQueue(index).catch(console.error);
      // queue[] will update via queueItemsDidChange
    }
  }, [provider]);

  const playAtIndex = useCallback(async (index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length || !provider) return;
    const songIds = q.slice(index).map(t => t.id);
    await provider.playWithQueue(songIds, 0);
  }, [provider]);

  const skipNext = useCallback(async () => {
    if (!provider) return;
    await provider.skipToNext();
  }, [provider]);

  const skipPrev = useCallback(async () => {
    if (!provider) return;
    await provider.skipToPrev();
  }, [provider]);

  // setQueue: used externally to seed initial display (e.g. from localStorage restore)
  // This is a display-only operation — actual MusicKit queue is set via restoreQueue.
  const setQueueFn = useCallback((tracks: UnifiedTrack[]) => {
    for (const t of tracks) metadataCache.current.set(t.id, t);
    setQueue(tracks);
  }, []);

  const clear = useCallback(() => {
    metadataCache.current.clear();
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
