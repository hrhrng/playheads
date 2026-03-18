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

  // Global play queue — localStorage is ground truth, loaded on init
  const queueHook = usePlayQueue({ provider, userId });

  // If queue is empty on init, fetch a suggestion from the backend
  const suggestionFetched = useRef(false);
  useEffect(() => {
    if (!provider || isInitializing || suggestionFetched.current) return;
    if (!userId) return;
    if (queueHook.queue.length > 0) return; // localStorage already has a queue
    suggestionFetched.current = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/queue/suggestion?user_id=${userId}`);
        if (!res.ok) return;
        const data = await res.json() as { tracks?: unknown[] };
        if (!data.tracks?.length) return;
        const seen = new Set<string>();
        const deduped = (data.tracks as Array<{ id: string }>).filter(t => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
        if (deduped.length > 0) {
          queueHook.setQueue(deduped as any);
          provider.restoreTrackDisplay(deduped[0] as any, deduped as any, 0, 0);
        }
      } catch (e) {
        console.error('[useMusicProvider] suggestion error:', e);
      }
    })();
  }, [provider, isInitializing, userId, queueHook.queue.length]);

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
