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

const DEFAULT_PLAYBACK: PlaybackState = {
  currentTrack: null,
  isPlaying: false,
  isTransitioning: false,
  playbackTime: { current: 0, total: 0 },
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

  // Bridge provider.playbackState to React via useSyncExternalStore
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!provider) return () => {};
    return provider.onStateChange(onStoreChange);
  }, [provider]);

  const getSnapshot = useCallback(() => {
    return provider?.playbackState ?? DEFAULT_PLAYBACK;
  }, [provider]);

  const playback = useSyncExternalStore(subscribe, getSnapshot);

  // Bridge auth/initializing state
  const isAuthorized = provider?.isAuthorized ?? false;
  const isInitializing = provider?.isInitializing ?? true;
  const storefrontId = provider?.storefrontId ?? 'us';

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
