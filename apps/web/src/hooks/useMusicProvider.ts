/**
 * useMusicProvider — combines Provider + Queue into a single React hook.
 * Instantiates AppleMusicProvider, bridges its state to React via
 * useSyncExternalStore, and creates the global play queue.
 */

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import { AppleMusicProvider } from '../providers/AppleMusicProvider';
import { usePlayQueue, type UsePlayQueueReturn } from './usePlayQueue';
import type { PlaybackState } from '../providers/types';

interface UseMusicProviderParams {
  userId: string | null;
  storedMusicUserToken?: string | null;
  isTokenChecked?: boolean;
}

interface UseMusicProviderReturn {
  provider: AppleMusicProvider | null;
  playback: PlaybackState;
  queue: UsePlayQueueReturn;
  storefrontId: string;
  isAuthorized: boolean;
  isInitializing: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

interface ProviderSnapshot {
  playback: PlaybackState;
  isAuthorized: boolean;
  isInitializing: boolean;
  storefrontId: string;
}

const DEFAULT_SNAPSHOT: ProviderSnapshot = {
  playback: {
    currentTrack: null,
    isPlaying: false,
    isTransitioning: false,
    playbackTime: { current: 0, total: 0 },
  },
  isAuthorized: false,
  isInitializing: true,
  storefrontId: 'us',
};

export function useMusicProvider({
  userId,
  storedMusicUserToken,
  isTokenChecked = false,
}: UseMusicProviderParams): UseMusicProviderReturn {
  const [provider, setProvider] = useState<AppleMusicProvider | null>(null);
  const providerRef = useRef<AppleMusicProvider | null>(null);

  // Use ref for token so provider is created only once (when isTokenChecked
  // flips true), not recreated every time the token value changes.
  const tokenRef = useRef(storedMusicUserToken);
  tokenRef.current = storedMusicUserToken;

  // Create and initialize provider once when token check is done
  useEffect(() => {
    if (!isTokenChecked) return;

    const p = new AppleMusicProvider({
      storedMusicUserToken: tokenRef.current,
    });
    providerRef.current = p;
    setProvider(p);

    // Initialize — handles MusicKit loading
    if (window.MusicKit) {
      p.initialize();
    } else {
      const onLoaded = () => p.initialize();
      document.addEventListener('musickitloaded', onLoaded);
      return () => {
        document.removeEventListener('musickitloaded', onLoaded);
        p.destroy();
        providerRef.current = null;
      };
    }

    return () => {
      p.destroy();
      providerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTokenChecked]);

  // Bridge ALL provider state to React via useSyncExternalStore.
  const lastSnapshotRef = useRef<ProviderSnapshot>(DEFAULT_SNAPSHOT);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!provider) return () => {};
    return provider.onStateChange(onStoreChange);
  }, [provider]);

  const getSnapshot = useCallback((): ProviderSnapshot => {
    if (!provider) return DEFAULT_SNAPSHOT;
    const next: ProviderSnapshot = {
      playback: provider.playbackState,
      isAuthorized: provider.isAuthorized,
      isInitializing: provider.isInitializing,
      storefrontId: provider.storefrontId,
    };
    const prev = lastSnapshotRef.current;
    if (
      prev.playback === next.playback &&
      prev.isAuthorized === next.isAuthorized &&
      prev.isInitializing === next.isInitializing &&
      prev.storefrontId === next.storefrontId
    ) {
      return prev;
    }
    lastSnapshotRef.current = next;
    return next;
  }, [provider]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const { playback, isAuthorized, isInitializing, storefrontId } = snapshot;

  // Global play queue
  const queueHook = usePlayQueue({ provider, userId });
  const finishRestore = (queueHook as any).finishRestore as () => void;

  // ── Queue restore from localStorage (no autoplay) ──────────────
  const initialRestoreDone = useRef(false);
  const QUEUE_STORAGE_KEY = 'playheads_queue';
  const PLAYBACK_POS_KEY = 'playheads_playback_pos';

  useEffect(() => {
    if (!provider || isInitializing || initialRestoreDone.current) return;
    initialRestoreDone.current = true;

    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (raw) {
        const tracks = JSON.parse(raw);
        if (Array.isArray(tracks) && tracks.length > 0) {
          console.log('[useMusicProvider] restore:', tracks.length, 'tracks from localStorage');
          queueHook.setQueue(tracks);

          // Restore playback position for display (visual only — no seek)
          let savedPos = 0;
          try {
            savedPos = parseFloat(localStorage.getItem(PLAYBACK_POS_KEY) || '0') || 0;
          } catch { /* ignore */ }
          provider.setDisplayTrack(tracks[0], savedPos);

          // Prime MusicKit queue (no play, no changeToMediaAtIndex).
          // React state is authoritative; queueItemsDidChange is not subscribed.
          provider.setQueueWithoutPlaying(tracks.map((t: any) => t.id));
        }
      }
    } catch { /* ignore corrupt localStorage */ }
    finishRestore();
  }, [provider, isInitializing]);

  // ── Persist queue to localStorage ─────────────────────────────
  useEffect(() => {
    if (!initialRestoreDone.current) return;
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueHook.queue));
    } catch { /* ignore */ }
  }, [queueHook.queue]);

  // ── Persist playback position to localStorage ─────────────────
  useEffect(() => {
    if (!initialRestoreDone.current) return;
    const pos = playback.playbackTime.current;
    if (pos > 0) {
      try { localStorage.setItem(PLAYBACK_POS_KEY, String(pos)); } catch { /* ignore */ }
    }
  }, [playback.playbackTime.current]);

  const login = useCallback(async () => {
    if (provider) await provider.login();
  }, [provider]);

  const logout = useCallback(async () => {
    if (provider) await provider.logout();
  }, [provider]);

  return {
    provider,
    playback,
    queue: queueHook,
    storefrontId,
    isAuthorized,
    isInitializing,
    login,
    logout,
  };
}
