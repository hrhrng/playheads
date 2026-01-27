/**
 * Apple Music integration hook
 * @module hooks/useAppleMusic
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  Track,
  PlaybackTime,
  FormattedTrack,
  SearchResultItem,
  MusicKitInstance,
  AppleMusicAction
} from '../types';

const API_BASE = 'http://localhost:8000';

interface UseAppleMusicParams {
  userId: string | null;
  activeSessionId: string | null;
}

interface UseAppleMusicReturn {
  // State
  musicKit: MusicKitInstance | null;
  isAuthorized: boolean;
  currentTrack: Track | null;
  isPlaying: boolean;
  playbackTime: PlaybackTime;
  queue: Track[];
  sessionId: string;
  isInitializing: boolean;

  // Methods
  login: () => Promise<void>;
  logout: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlay: () => Promise<void>;
  playTrack: (index: number) => Promise<void>;
  setQueue: (items: (string | Track)[], startPlaying?: boolean) => Promise<void>;
  search: (term: string, types?: string[]) => Promise<SearchResultItem[]>;
  seekTo: (time: number) => void;
  skipNext: () => Promise<void>;
  skipPrev: () => Promise<void>;
  syncToBackend: (data?: Record<string, unknown>, targetSessionId?: string | null) => Promise<void>;
  executeAgentActions: (actions: string[]) => Promise<void>;
}

/**
 * Apple Music integration hook
 * Manages MusicKit initialization, authorization, playback, and backend sync
 *
 * @param params - Hook parameters
 * @returns Apple Music state and methods
 */
export default function useAppleMusic({
  userId,
  activeSessionId
}: UseAppleMusicParams): UseAppleMusicReturn {
  const [musicKit, setMusicKit] = useState<MusicKitInstance | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackTime, setPlaybackTime] = useState<PlaybackTime>({ current: 0, total: 0 });
  const [queue, setQueueState] = useState<Track[]>([]);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const developerTokenRef = useRef<string | null>(null);

  // Generate a fallback UUID for anonymous sessions
  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Internal session ID (fallback)
  const [internalSessionId] = useState<string>(() => generateUUID());

  // Use active session ID if provided, otherwise internal (reactive with useMemo)
  const sessionId = useMemo(() => {
    return activeSessionId || internalSessionId;
  }, [activeSessionId, internalSessionId]);

  // ==========================================================================
  // Helper: Format track for backend sync
  // ==========================================================================
  const formatTrackForSync = useCallback((track: Track | null): FormattedTrack | null => {
    if (!track) return null;
    const attr = track.attributes || track;
    return {
      id: track.id || '',
      name: (attr as any).name || (attr as any).title || 'Unknown',
      artist: (attr as any).artistName || 'Unknown',
      album: (attr as any).albumName || '',
      artwork_url: (attr as any).artwork?.url?.replace('{w}', '300').replace('{h}', '300') || '',
      duration: ((attr as any).durationInMillis ? (attr as any).durationInMillis / 1000 : 0)
    };
  }, []);

  // ==========================================================================
  // Sync state to backend
  // ==========================================================================
  const syncToBackend = useCallback(async (
    data: Record<string, unknown> = {},
    targetSessionId: string | null = null
  ): Promise<void> => {
    if (!isAuthorized) return;

    // Use argument ID if provided, otherwise state ID
    const sid = targetSessionId || sessionId;

    try {
      const payload = {
        session_id: sid,
        user_id: userId, // Send user_id for permission check
        current_track: formatTrackForSync(currentTrack),
        playlist: queue.map(formatTrackForSync) as FormattedTrack[],
        is_playing: isPlaying,
        playback_position: playbackTime.current,
        ...data // Allow overriding partial state if needed
      };

      await fetch(`${API_BASE}/state/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Sync error:', e);
    }
  }, [isAuthorized, currentTrack, queue, isPlaying, playbackTime, sessionId, userId, formatTrackForSync]);

  // ==========================================================================
  // Execute agent commands
  // ==========================================================================
  const executeAgentActions = useCallback(async (actions: string[]): Promise<void> => {
    if (!musicKit || !actions || actions.length === 0) return;

    for (const action of actions) {
      // Ensure action is a string
      if (typeof action !== 'string') continue;

      if (action.startsWith('ACTION:PLAY_INDEX:')) {
        const index = parseInt(action.split(':')[2], 10);
        if (!isNaN(index) && index >= 0 && index < queue.length) {
          try {
            await musicKit.changeToMediaAtIndex(index);
            await musicKit.play();
          } catch (e) {
            console.error('Agent play action error:', e);
          }
        }
      } else if (action.startsWith('ACTION:SEARCH_AND_ADD:')) {
        const query = action.split(':').slice(2).join(':');
        // Search and add to queue
        const results = await search(query);
        if (results.length > 0) {
          const newQueue = [...queue, results[0]];
          try {
            await musicKit.setQueue({ items: newQueue.map(t => t.id || t) as any });
            setQueueState(newQueue);
          } catch (e) {
            console.error('Agent add action error:', e);
          }
        }
      } else if (action.startsWith('ACTION:REMOVE_INDEX:')) {
        const index = parseInt(action.split(':')[2], 10);
        if (!isNaN(index) && index >= 0 && index < queue.length) {
          const newQueue = [...queue];
          newQueue.splice(index, 1);
          try {
            await musicKit.setQueue({ items: newQueue.map(t => t.id || t) as any });
            setQueueState(newQueue);
          } catch (e) {
            console.error('Agent remove action error:', e);
          }
        }
      }
    }

    // Sync after actions
    setTimeout(syncToBackend, 500);
  }, [musicKit, queue, syncToBackend]);

  // ==========================================================================
  // Initialize MusicKit
  // ==========================================================================
  useEffect(() => {
    const initMusicKit = async (): Promise<void> => {
      try {
        if (!window.MusicKit) {
          setIsInitializing(false);
          return;
        }

        // Use fixed developer token from environment variable
        const developerToken = import.meta.env.VITE_APPLE_DEVELOPER_TOKEN;
        if (!developerToken) {
          console.error('VITE_APPLE_DEVELOPER_TOKEN not configured');
          setIsInitializing(false);
          return;
        }
        developerTokenRef.current = developerToken;

        const mk = await window.MusicKit.configure({
          developerToken,
          app: { name: 'Playhead', build: '1.0.0' }
        }) as MusicKitInstance;

        setMusicKit(mk);
        setIsAuthorized(mk.isAuthorized);

        if (mk.queue?.items) {
          setQueueState([...mk.queue.items]);
        }

        // Event Listeners
        mk.addEventListener('authorizationStatusDidChange', () => {
          setIsAuthorized(mk.isAuthorized);
        });

        mk.addEventListener('mediaItemDidChange', (event: any) => {
          if (event.item) {
            setCurrentTrack(event.item);
            setPlaybackTime({ current: 0, total: 0 });
          }
        });

        mk.addEventListener('nowPlayingItemDidChange', () => {
          const item = mk.nowPlayingItem;
          if (item) {
            setCurrentTrack(item);
            setPlaybackTime({ current: 0, total: 0 });
          }
        });

        mk.addEventListener('playbackStateDidChange', (event: any) => {
          setIsPlaying(event.state === 'playing');
          if (mk.nowPlayingItem) {
            setCurrentTrack(mk.nowPlayingItem);
          }
        });

        mk.addEventListener('queueItemsDidChange', () => {
          setQueueState([...mk.queue.items]);
        });

        mk.addEventListener('playbackTimeDidChange', (event: any) => {
          setPlaybackTime({
            current: event.currentPlaybackTime,
            total: event.currentPlaybackDuration
          });
        });

      } catch (err) {
        console.error('Error initializing MusicKit:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    if (window.MusicKit) {
      initMusicKit();
    } else {
      document.addEventListener('musickitloaded', initMusicKit);
    }

    return () => {
      document.removeEventListener('musickitloaded', initMusicKit);
    };
  }, []);

  // ==========================================================================
  // Initial sync on authorization (event-driven, no polling)
  // ==========================================================================
  useEffect(() => {
    if (isAuthorized) {
      // Initial sync when authorized
      syncToBackend();
    }
  }, [isAuthorized, syncToBackend]);

  // ==========================================================================
  // Auth
  // ==========================================================================
  const login = useCallback(async (): Promise<void> => {
    if (!musicKit) return;

    const w = 600, h = 700;
    const left = (window.screen.width - w) / 2;
    const top = (window.screen.height - h) / 2;
    const originalOpen = window.open;

    window.open = ((url: string | URL, target?: string, features?: string) => {
      return originalOpen(url, target, `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=yes`);
    }) as typeof window.open;

    try {
      await musicKit.authorize();
      setIsAuthorized(musicKit.isAuthorized);
    } finally {
      window.open = originalOpen;
    }
  }, [musicKit]);

  const logout = useCallback(async (): Promise<void> => {
    if (musicKit) await musicKit.unauthorize();
  }, [musicKit]);

  // ==========================================================================
  // Playback Controls (with sync)
  // ==========================================================================
  const play = useCallback(async (): Promise<void> => {
    if (musicKit) {
      await musicKit.play();
      syncToBackend();
    }
  }, [musicKit, syncToBackend]);

  const pause = useCallback(async (): Promise<void> => {
    if (musicKit) {
      await musicKit.pause();
      syncToBackend();
    }
  }, [musicKit, syncToBackend]);

  const togglePlay = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    isPlaying ? await musicKit.pause() : await musicKit.play();
    syncToBackend();
  }, [musicKit, isPlaying, syncToBackend]);

  const setQueue = useCallback(async (
    items: (string | Track)[],
    startPlaying = true
  ): Promise<void> => {
    if (!musicKit) return;
    try {
      await musicKit.setQueue({ items: items as any });
      if (items.length > 0) setCurrentTrack(items[0] as Track);
      if (startPlaying) {
        await musicKit.play();
      }
      syncToBackend();
    } catch (e) {
      console.error('Failed to set queue:', e);
    }
  }, [musicKit, syncToBackend]);

  const playTrack = useCallback(async (index: number): Promise<void> => {
    if (!musicKit) return;
    try {
      await musicKit.changeToMediaAtIndex(index);
      const track = queue[index] || musicKit.queue.items[index];
      if (track) setCurrentTrack(track);
      await musicKit.play();
      syncToBackend();
    } catch (e) {
      console.error('Play track error:', e);
    }
  }, [musicKit, queue, syncToBackend]);

  const search = useCallback(async (
    term: string,
    types: string[] = ['songs']
  ): Promise<SearchResultItem[]> => {
    if (!musicKit) return [];
    const storefront = musicKit.storefrontId || 'us';
    try {
      const response = await musicKit.api.music(`v1/catalog/${storefront}/search`, {
        term,
        types: types.join(','),
        limit: 10
      }) as any;
      return response.data?.results?.songs?.data || [];
    } catch (e) {
      console.error('Search error:', e);
      return [];
    }
  }, [musicKit]);

  const seekTo = useCallback((time: number): void => {
    if (musicKit) {
      musicKit.seekToTime(time);
      syncToBackend();
    }
  }, [musicKit, syncToBackend]);

  const skipNext = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    try {
      await musicKit.skipToNextItem();
      syncToBackend();
    } catch (e) {
      console.error('Skip next error:', e);
    }
  }, [musicKit, syncToBackend]);

  const skipPrev = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    try {
      await musicKit.skipToPreviousItem();
      syncToBackend();
    } catch (e) {
      console.error('Skip prev error:', e);
    }
  }, [musicKit, syncToBackend]);

  return {
    musicKit,
    isAuthorized,
    currentTrack,
    isPlaying,
    playbackTime,
    queue,
    sessionId,
    login,
    logout,
    play,
    pause,
    togglePlay,
    playTrack,
    setQueue,
    search,
    seekTo,
    skipNext,
    skipPrev,
    isInitializing,
    syncToBackend,
    executeAgentActions
  };
}
