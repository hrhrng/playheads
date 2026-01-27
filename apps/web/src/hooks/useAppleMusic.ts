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

/**
 * Extract track IDs from queue for comparison
 * Used to detect actual playlist changes vs. just metadata updates
 */
const getQueueIds = (queue: Track[]): string => {
  return queue.map(t => t.id).join(',');
};

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
  const playbackTimeRef = useRef<PlaybackTime>({ current: 0, total: 0 });
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
  // Keep playbackTime ref in sync
  // ==========================================================================
  useEffect(() => {
    playbackTimeRef.current = playbackTime;
  }, [playbackTime]);

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
        playback_position: playbackTimeRef.current.current,
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
  }, [isAuthorized, currentTrack, queue, isPlaying, sessionId, userId, formatTrackForSync]);

  // ==========================================================================
  // Auto-sync when state changes
  // Immediate sync for track/playlist changes, debounced for position-only updates
  // ==========================================================================

  // Track previous values to detect actual changes
  const prevQueueIdsRef = useRef<string>('');
  const prevTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthorized || isInitializing) return;

    // Detect if playlist or current track changed (not just playback position)
    const currentQueueIds = getQueueIds(queue);
    const queueChanged = currentQueueIds !== prevQueueIdsRef.current;
    const trackChanged = currentTrack?.id !== prevTrackIdRef.current;

    if (queueChanged || trackChanged) {
      // Immediate sync for important changes (track/playlist)
      // This ensures the agent sees the latest state when queried
      syncToBackend();
      prevQueueIdsRef.current = currentQueueIds;
      prevTrackIdRef.current = currentTrack?.id ?? null;
    } else {
      // Debounced sync for position-only updates (less critical)
      const timeoutId = setTimeout(() => {
        syncToBackend();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [isAuthorized, isInitializing, currentTrack, queue, isPlaying, syncToBackend]);

  // ==========================================================================
  // Execute agent commands
  // ==========================================================================
  const executeAgentActions = useCallback(async (actions: string[]): Promise<void> => {
    if (!musicKit || !actions || actions.length === 0) return;
    if (!isAuthorized) {
      console.warn('Cannot execute agent actions: Apple Music not authorized');
      return;
    }

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
      } else if (action.startsWith('ACTION:ADD_ID:')) {
        const trackId = action.split(':')[2];
        // Validate trackId before calling MusicKit
        if (!trackId || trackId === 'undefined' || trackId === 'null') {
          console.error('Agent add action error: Invalid track ID:', trackId);
          continue;
        }
        console.log('[DEBUG] Adding track to queue:', { trackId, action });
        try {
          // MusicKit queue.append expects MediaItemDescriptor format
          // Use the 'items' key with proper type specification
          await (musicKit as any).playLater({ songs: [trackId] });
          console.log('[DEBUG] Track added successfully via playLater');
        } catch (e) {
          console.error('Agent add action error (playLater):', e);
          // Fallback: use setQueue but preserve current position
          try {
            const currentIndex = musicKit.queue.position ?? 0;
            const currentItems = musicKit.queue.items.map((item: any) => item.id || item);
            await musicKit.setQueue({ items: [...currentItems, trackId] as any });
            // Restore position if we were playing
            if (currentIndex > 0 && currentIndex < currentItems.length) {
              await musicKit.changeToMediaAtIndex(currentIndex);
            }
            console.log('[DEBUG] Track added successfully via setQueue fallback');
          } catch (e2) {
            console.error('Agent add action error (fallback):', e2, { trackId });
          }
        }
      } else if (action.startsWith('ACTION:SEARCH_AND_ADD:')) {
        const query = action.split(':').slice(2).join(':');
        // Search and add to queue
        const results = await search(query);
        if (results.length > 0 && results[0].id) {
          try {
            // Use playLater to add to end of queue
            await (musicKit as any).playLater({ songs: [results[0].id] });
          } catch (e) {
            console.error('Agent add action error (playLater):', e);
            // Fallback to setQueue
            try {
              const currentItems = musicKit.queue.items.map((item: any) => item.id || item);
              await musicKit.setQueue({ items: [...currentItems, results[0].id] as any });
            } catch (e2) {
              console.error('Agent add action error (fallback):', e2);
            }
          }
        }
      } else if (action.startsWith('ACTION:REMOVE_INDEX:')) {
        const index = parseInt(action.split(':')[2], 10);
        if (!isNaN(index) && index >= 0 && index < queue.length) {
          try {
            // Use native remove method
            await musicKit.queue.remove(index);
          } catch (e) {
            console.error('Agent remove action error:', e);
          }
        }
      }
    }

    // Sync should happen automatically via useEffect when queue/state changes
  }, [musicKit, isAuthorized, queue, syncToBackend]);

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
    if (!musicKit) return;
    if (!isAuthorized) {
      console.warn('Cannot play: Apple Music not authorized');
      return;
    }
    try {
      await musicKit.play();
      syncToBackend();
    } catch (e) {
      console.error('Play error:', e);
    }
  }, [musicKit, isAuthorized, syncToBackend]);

  const pause = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      console.warn('Cannot pause: Apple Music not authorized');
      return;
    }
    try {
      await musicKit.pause();
      syncToBackend();
    } catch (e) {
      console.error('Pause error:', e);
    }
  }, [musicKit, isAuthorized, syncToBackend]);

  const togglePlay = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      console.warn('Cannot toggle play: Apple Music not authorized');
      return;
    }
    try {
      isPlaying ? await musicKit.pause() : await musicKit.play();
      syncToBackend();
    } catch (e) {
      console.error('Toggle play error:', e);
    }
  }, [musicKit, isAuthorized, isPlaying, syncToBackend]);

  const setQueue = useCallback(async (
    items: (string | Track)[],
    startPlaying = true
  ): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      console.warn('Cannot set queue: Apple Music not authorized');
      return;
    }
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
  }, [musicKit, isAuthorized, syncToBackend]);

  const playTrack = useCallback(async (index: number): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      console.warn('Cannot play track: Apple Music not authorized');
      return;
    }
    try {
      await musicKit.changeToMediaAtIndex(index);
      const track = queue[index] || musicKit.queue.items[index];
      if (track) setCurrentTrack(track);
      await musicKit.play();
      syncToBackend();
    } catch (e) {
      console.error('Play track error:', e);
    }
  }, [musicKit, isAuthorized, queue, syncToBackend]);

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
    if (!musicKit) return;
    if (!isAuthorized) {
      console.warn('Cannot seek: Apple Music not authorized');
      return;
    }
    try {
      musicKit.seekToTime(time);
      syncToBackend();
    } catch (e) {
      console.error('Seek error:', e);
    }
  }, [musicKit, isAuthorized, syncToBackend]);

  const skipNext = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      console.warn('Cannot skip next: Apple Music not authorized');
      return;
    }
    try {
      await musicKit.skipToNextItem();
      syncToBackend();
    } catch (e) {
      console.error('Skip next error:', e);
    }
  }, [musicKit, isAuthorized, syncToBackend]);

  const skipPrev = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      console.warn('Cannot skip prev: Apple Music not authorized');
      return;
    }
    try {
      await musicKit.skipToPreviousItem();
      syncToBackend();
    } catch (e) {
      console.error('Skip prev error:', e);
    }
  }, [musicKit, isAuthorized, syncToBackend]);

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
