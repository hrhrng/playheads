/**
 * useMusicProvider — combines Provider + Queue into a single React hook.
 * Instantiates AppleMusicProvider, bridges its state to React via
 * useSyncExternalStore, and creates the global play queue.
 */

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import { AppleMusicProvider } from '../providers/AppleMusicProvider';
import { usePlayQueue, type UsePlayQueueReturn } from './usePlayQueue';
import type { PlaybackState } from '../providers/types';
import { API_BASE } from '../config/api';

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
  // getSnapshot builds a composite object so React re-renders when
  // isInitializing/isAuthorized change, not just playbackState.
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
    // Maintain referential equality when nothing changed
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
  const queue = usePlayQueue({ provider, userId });

  // Restore playback state from backend once authorized
  const initialRestoreDone = useRef(false);
  useEffect(() => {
    if (!provider || !isAuthorized || isInitializing || initialRestoreDone.current) return;
    if (!userId) return;
    initialRestoreDone.current = true;

    (async () => {
      try {
        // Restore queue from backend
        const queueRes = await fetch(`${API_BASE}/queue?user_id=${userId}`);
        if (queueRes.ok) {
          const data = await queueRes.json();
          if (data.queue?.length > 0) {
            queue.setQueue(data.queue);
            // Restore current track display
            const idx = data.currentIndex ?? -1;
            if (idx >= 0 && idx < data.queue.length) {
              provider.restoreTrackDisplay(data.queue[idx], 0);
            }
          }
        }
      } catch (e) {
        console.error('[useMusicProvider] restore error:', e);
      }
    })();
  }, [provider, isAuthorized, isInitializing, userId]);

  // Periodic sync every 10s while playing
  useEffect(() => {
    if (!playback.isPlaying) return;
    const interval = setInterval(() => {
      // Just trigger a queue sync — the queue hook handles debounced sync
    }, 10_000);
    return () => clearInterval(interval);
  }, [playback.isPlaying]);

  const login = useCallback(async () => {
    if (provider) await provider.login();
  }, [provider]);

  const logout = useCallback(async () => {
    if (provider) await provider.logout();
  }, [provider]);

  return {
    provider,
    playback,
    queue,
    storefrontId,
    isAuthorized,
    isInitializing,
    login,
    logout,
  };
}
