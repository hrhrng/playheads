/**
 * useMusicProvider — combines Provider + Queue into a single React hook.
 * Instantiates AppleMusicProvider, bridges its state to React via
 * useSyncExternalStore, and creates the global play queue.
 */

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import { AppleMusicProvider } from '../providers/AppleMusicProvider';
import { usePlayQueue, type UsePlayQueueReturn } from './usePlayQueue';
import type { PlaybackState, UnifiedTrack } from '../providers/types';

const QUEUE_STORAGE_KEY = 'playheads_queue';

function loadQueueFromStorage(): UnifiedTrack[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UnifiedTrack[]) : [];
  } catch {
    return [];
  }
}

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

  // Create and initialize provider when token check is done
  useEffect(() => {
    if (!isTokenChecked) return;

    const p = new AppleMusicProvider({
      storedMusicUserToken,
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
  }, [isTokenChecked, storedMusicUserToken]);

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

  // On init, restore queue from localStorage by setting MusicKit queue directly.
  // No deferred state — MusicKit resolves tracks in background, user presses play when ready.
  const queueRestored = useRef(false);
  useEffect(() => {
    if (!provider || isInitializing || queueRestored.current) return;
    queueRestored.current = true;
    const saved = loadQueueFromStorage();
    if (saved.length > 0) {
      // Seed display immediately from localStorage metadata
      queueHook.setQueue(saved);
      // Set MusicKit queue without starting playback
      const ids = saved.map(t => t.id);
      provider.restoreQueue(ids, saved[0], 0).catch(console.error);
    }
  }, [provider, isInitializing]);

  // Persist queue to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueHook.queue));
    } catch { /* ignore */ }
  }, [queueHook.queue]);

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
