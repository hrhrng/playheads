/**
 * Global play queue hook — single queue for all conversations.
 * Manages track list, current index, auto-advance, and backend sync.
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

  // Refs for provider callbacks (avoid stale closures)
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // Backend sync
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

  // Auto-advance: register track-ended callback on provider
  useEffect(() => {
    if (!provider) return;
    provider.setOnTrackEnded(() => {
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      if (idx >= 0 && idx < q.length - 1) {
        const nextIdx = idx + 1;
        const nextTrack = q[nextIdx];
        if (nextTrack?.id) {
          setCurrentIndex(nextIdx);
          provider.play(nextTrack.id).catch(console.error);
          syncToBackend(q, nextIdx);
        }
      }
    });
    return () => { provider.setOnTrackEnded(null); };
  }, [provider, syncToBackend]);

  const addTrack = useCallback((track: UnifiedTrack) => {
    setQueue(prev => {
      const next = [...prev, track];
      syncToBackend(next, currentIndexRef.current);
      return next;
    });
  }, [syncToBackend]);

  const removeTrack = useCallback((index: number) => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index);
      let newIndex = currentIndexRef.current;
      if (index < newIndex) newIndex--;
      else if (index === newIndex) newIndex = -1;
      setCurrentIndex(newIndex);
      syncToBackend(next, newIndex);
      return next;
    });
  }, [syncToBackend]);

  const playAtIndex = useCallback(async (index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
    const track = q[index];
    if (!track?.id || !provider) return;

    setCurrentIndex(index);
    await provider.play(track.id);
    syncToBackend(q, index);
  }, [provider, syncToBackend]);

  const skipNext = useCallback(async () => {
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (idx < 0 || idx >= q.length - 1 || !provider) return;

    const nextIdx = idx + 1;
    const track = q[nextIdx];
    if (!track?.id) return;

    // Check if was playing before skip
    const wasPlaying = provider.playbackState.isPlaying;
    setCurrentIndex(nextIdx);
    if (wasPlaying) {
      await provider.play(track.id);
    } else {
      // Just update the current track display without playing
      provider.restoreFromState({
        current_track: {
          id: track.id,
          name: track.name,
          artist: track.artist,
          album: track.album,
          artwork_url: track.artworkUrl,
          duration: track.durationSeconds,
        },
        is_playing: false,
        playback_position: 0,
      });
    }
    syncToBackend(queueRef.current, nextIdx);
  }, [provider, syncToBackend]);

  const skipPrev = useCallback(async () => {
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (idx <= 0 || !provider) return;

    const prevIdx = idx - 1;
    const track = q[prevIdx];
    if (!track?.id) return;

    const wasPlaying = provider.playbackState.isPlaying;
    setCurrentIndex(prevIdx);
    if (wasPlaying) {
      await provider.play(track.id);
    } else {
      provider.restoreFromState({
        current_track: {
          id: track.id,
          name: track.name,
          artist: track.artist,
          album: track.album,
          artwork_url: track.artworkUrl,
          duration: track.durationSeconds,
        },
        is_playing: false,
        playback_position: 0,
      });
    }
    syncToBackend(queueRef.current, prevIdx);
  }, [provider, syncToBackend]);

  const setQueueFn = useCallback((tracks: UnifiedTrack[]) => {
    setQueue(tracks);
    syncToBackend(tracks, currentIndexRef.current);
  }, [syncToBackend]);

  const clear = useCallback(() => {
    setQueue([]);
    setCurrentIndex(-1);
    syncToBackend([], -1);
  }, [syncToBackend]);

  // Restore from backend on mount
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/queue?user_id=${userId}`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (data.queue?.length > 0) {
          setQueue(data.queue);
          setCurrentIndex(data.currentIndex ?? -1);
          lastSyncedRef.current = JSON.stringify(data.queue.map((t: UnifiedTrack) => t.id)) + ':' + (data.currentIndex ?? -1);
        }
      } catch { /* network error — start with empty queue */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

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
