/**
 * Apple Music integration hook
 * @module hooks/useAppleMusic
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { classifyError, showErrorToast } from '../utils/errorHandling';
import { ErrorCategory } from '../types/errors';
import { API_BASE } from '../config/api';
import type {
  Track,
  PlaybackTime,
  FormattedTrack,
  SearchResultItem,
  MusicKitInstance,
  AgentAction
} from '../types/index.d';

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
  executeAgentActions: (actions: AgentAction[]) => Promise<void>;
  /** Sync real MusicKit playback state to backend DB (reads from MusicKit, not React) */
  syncMusicKitState: () => Promise<void>;
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
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
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
    if (!isAuthorized || isInitializing || isRestoring) return;

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
  }, [isAuthorized, isInitializing, isRestoring, currentTrack, queue, isPlaying, syncToBackend]);

  // ==========================================================================
  // Sync MusicKit state directly to backend (reads from MusicKit, not React)
  // Used as an ACK after each agent action so the backend DB sees real state
  // before the next agent turn starts.
  // ==========================================================================
  const syncMusicKitState = useCallback(async (): Promise<void> => {
    if (!musicKit || !isAuthorized) return;

    try {
      const nowPlaying = musicKit.nowPlayingItem;
      const queueItems = musicKit.queue?.items ?? [];

      const payload = {
        session_id: sessionId,
        user_id: userId,
        current_track: nowPlaying ? formatTrackForSync(nowPlaying) : null,
        playlist: queueItems.map((item: Track) => formatTrackForSync(item)),
        is_playing: musicKit.playbackState === ('playing' as any),
        playback_position: musicKit.currentPlaybackTime ?? 0,
      };

      await fetch(`${API_BASE}/state/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error('[SyncMusicKit] Error:', e);
    }
  }, [musicKit, isAuthorized, sessionId, userId, formatTrackForSync]);

  // ==========================================================================
  // Execute agent commands
  // After each action, sync MusicKit state to backend as an ACK so the
  // next agent turn reads real state from DB.
  // ==========================================================================
  const executeAgentActions = useCallback(async (actions: AgentAction[]): Promise<void> => {
    if (!musicKit || !actions || actions.length === 0) return;
    if (!isAuthorized) {
      toast.error('Cannot perform action', {
        description: 'Apple Music connection required'
      });
      return;
    }

    for (const action of actions) {
      switch (action.type) {
        case 'play_track': {
          const index = action.data?.index as number | undefined;
          // Validate against MusicKit queue (not React state, which may lag)
          if (index != null && index >= 0 && index < musicKit.queue.items.length) {
            try {
              await musicKit.changeToMediaAtIndex(index);
              await musicKit.play();
            } catch (e) {
              console.error('[Agent] play_track error:', e);
            }
          }
          break;
        }

        case 'add_to_queue': {
          const trackId = action.data?.track_id as string | undefined;
          if (!trackId || trackId === 'undefined' || trackId === 'null') {
            console.error('[Agent] add_to_queue: invalid track_id', action.data);
            break;
          }
          try {
            await (musicKit as any).playLater({ songs: [trackId] });
          } catch (e) {
            console.error('[Agent] add_to_queue playLater error:', e);
            // Fallback: rebuild queue preserving current position
            try {
              const currentIndex = musicKit.queue.position ?? 0;
              const currentItems = musicKit.queue.items.map((item: any) => item.id || item);
              await musicKit.setQueue({ items: [...currentItems, trackId] as any });
              if (currentIndex > 0 && currentIndex < currentItems.length) {
                await musicKit.changeToMediaAtIndex(currentIndex);
              }
            } catch (e2) {
              console.error('[Agent] add_to_queue fallback error:', e2);
            }
          }
          break;
        }

        case 'remove_track': {
          const index = action.data?.index as number | undefined;
          if (index != null && index >= 0 && index < musicKit.queue.items.length) {
            try {
              await musicKit.queue.remove(index);
            } catch (e) {
              console.error('[Agent] remove_track error:', e);
            }
          }
          break;
        }

        default:
          console.warn('[Agent] Unknown action type:', action.type);
      }

      // ACK: sync real MusicKit state to backend after each action
      // so the next agent turn sees the actual queue/playback state
      await syncMusicKitState();
    }
  }, [musicKit, isAuthorized, syncMusicKitState]);

  // ==========================================================================
  // Handle authentication loss
  // ==========================================================================
  const handleAuthLost = useCallback(() => {
    toast.error('Your Apple Music session expired', {
      description: 'Please reconnect to continue playing music',
      action: {
        label: 'Reconnect',
        onClick: () => login()
      },
      duration: Infinity  // Don't auto-dismiss
    });
  }, []);

  // ==========================================================================
  // Initialize MusicKit
  // ==========================================================================
  useEffect(() => {
    const initMusicKit = async (): Promise<void> => {
      try {
        if (!window.MusicKit) {
          console.error('[MusicKit] window.MusicKit not available — CDN script may not have loaded');
          setIsInitializing(false);
          return;
        }

        // Fetch developer token from backend API (with caching and refresh)
        try {
          console.log(`[MusicKit] Fetching developer token from ${API_BASE}/apple-music/developer-token`);
          const response = await fetch(`${API_BASE}/apple-music/developer-token`);
          if (!response.ok) {
            throw new Error(`Developer token request failed: ${response.status} ${response.statusText}`);
          }
          const data = await response.json();
          const developerToken = data.token;
          const expiresAt = data.expires_at;

          developerTokenRef.current = developerToken;
          console.log('[MusicKit] Developer token fetched successfully');

          // Set up token refresh before expiration (5 minutes before expiry)
          const refreshTime = (expiresAt - Date.now() / 1000 - 300) * 1000;
          if (refreshTime > 0) {
            setTimeout(() => {
              // Refresh token by re-initializing MusicKit
              initMusicKit();
            }, refreshTime);
          }
        } catch (error) {
          console.error('[MusicKit] Failed to fetch developer token:', error);
          setIsInitializing(false);
          return;
        }

        console.log('[MusicKit] Configuring MusicKit...');
        const mk = await window.MusicKit.configure({
          developerToken: developerTokenRef.current,
          app: { name: 'Playhead', build: '1.0.0' }
        }) as MusicKitInstance;
        console.log('[MusicKit] Configured successfully, isAuthorized:', mk.isAuthorized);

        setMusicKit(mk);
        setIsAuthorized(mk.isAuthorized);

        if (mk.queue?.items) {
          setQueueState([...mk.queue.items]);
        }

        // Event Listeners
        mk.addEventListener('authorizationStatusDidChange', () => {
          const wasAuthorized = isAuthorized;
          const nowAuthorized = mk.isAuthorized;

          setIsAuthorized(nowAuthorized);

          // Detect authentication loss
          if (wasAuthorized && !nowAuthorized) {
            handleAuthLost();
          }
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
  // Restore music state from backend checkpoint
  // Frontend (MusicKit) is the ground-truth.
  // Backend is checkpoint for:
  // - Restoring frontend after page refresh
  // - Agent reading current state
  // - Saving/loading state when switching sessions
  // ==========================================================================
  const restoreStateFromBackend = useCallback(async (): Promise<void> => {
    if (!musicKit || !isAuthorized || !sessionId) return;

    // Skip for anonymous sessions
    if (sessionId === internalSessionId) {
      console.log('[Restore] Anonymous session, skipping');
      return;
    }

    setIsRestoring(true);

    try {
      const url = userId
        ? `${API_BASE}/state?session_id=${sessionId}&user_id=${userId}`
        : `${API_BASE}/state?session_id=${sessionId}`;

      console.log(`[Restore] Loading checkpoint for session: ${sessionId}`);
      const res = await fetch(url);

      if (!res.ok) {
        if (res.status === 404) {
          console.log('[Restore] No checkpoint found (new session)');
        } else {
          console.error('[Restore] Failed to fetch checkpoint:', res.status);
        }
        return;
      }

      const data = await res.json();
      const { playlist, current_track, is_playing, playback_position } = data;

      // Skip if no saved playlist
      if (!playlist || playlist.length === 0) {
        console.log('[Restore] Empty playlist in checkpoint');
        return;
      }

      // Validate track IDs (filter out null/undefined/invalid)
      const validTrackIds = playlist
        .map((t: FormattedTrack) => t.id)
        .filter((id: string) => id && id !== 'undefined' && id !== 'null');

      if (validTrackIds.length === 0) {
        console.warn('[Restore] No valid track IDs in checkpoint');
        return;
      }

      console.log(`[Restore] Restoring ${validTrackIds.length} tracks from checkpoint`);

      // Restore queue to MusicKit (ground-truth)
      await musicKit.setQueue({ items: validTrackIds as any });

      // Restore current track position
      if (current_track) {
        const currentIndex = playlist.findIndex(
          (t: FormattedTrack) => t.id === current_track.id
        );

        if (currentIndex >= 0) {
          console.log(`[Restore] Restoring track at index ${currentIndex}`);
          await musicKit.changeToMediaAtIndex(currentIndex);

          // Restore playback position
          if (playback_position && playback_position > 0) {
            console.log(`[Restore] Seeking to ${playback_position}s`);
            musicKit.seekToTime(playback_position);
          }

          // Restore playing state
          if (is_playing) {
            console.log('[Restore] Resuming playback');
            await musicKit.play();
          }
        }
      }

      console.log('[Restore] State restored from checkpoint ✓');
    } catch (e) {
      console.error('[Restore] Failed to restore from checkpoint:', e);
      // Fail silently - user can start fresh
    } finally {
      setIsRestoring(false);
    }
  }, [musicKit, isAuthorized, sessionId, userId, internalSessionId]);

  // ==========================================================================
  // Restore state from checkpoint when session changes
  // Triggered when: page refresh (authorization completes), session switch
  // ==========================================================================
  useEffect(() => {
    if (!isAuthorized || isInitializing) return;

    // Debounce: wait for initial sync to complete
    const timer = setTimeout(() => {
      restoreStateFromBackend();
    }, 500);

    return () => clearTimeout(timer);
  }, [isAuthorized, isInitializing, sessionId, restoreStateFromBackend]);

  // ==========================================================================
  // Auth
  // ==========================================================================
  const login = useCallback(async (): Promise<void> => {
    if (!musicKit) {
      toast.error('Apple Music is not ready', {
        description: 'MusicKit failed to initialize. Please refresh the page and try again.'
      });
      return;
    }

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
      showErrorToast(
        new Error('Apple Music not connected'),
        'playback'
      );
      return;
    }
    try {
      await musicKit.play();
      syncToBackend();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, isAuthorized, syncToBackend, handleAuthLost]);

  const pause = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      showErrorToast(
        new Error('Apple Music not connected'),
        'playback'
      );
      return;
    }
    try {
      await musicKit.pause();
      syncToBackend();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, isAuthorized, syncToBackend, handleAuthLost]);

  const togglePlay = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      showErrorToast(
        new Error('Apple Music not connected'),
        'playback'
      );
      return;
    }
    try {
      isPlaying ? await musicKit.pause() : await musicKit.play();
      syncToBackend();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, isAuthorized, isPlaying, syncToBackend, handleAuthLost]);

  const setQueue = useCallback(async (
    items: (string | Track)[],
    startPlaying = true
  ): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      showErrorToast(
        new Error('Apple Music not connected'),
        'playback'
      );
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
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'queue management');
      }
    }
  }, [musicKit, isAuthorized, syncToBackend, handleAuthLost]);

  const playTrack = useCallback(async (index: number): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      showErrorToast(
        new Error('Apple Music not connected'),
        'playback'
      );
      return;
    }
    try {
      await musicKit.changeToMediaAtIndex(index);
      const track = queue[index] || musicKit.queue.items[index];
      if (track) setCurrentTrack(track);
      await musicKit.play();
      syncToBackend();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, isAuthorized, queue, syncToBackend, handleAuthLost]);

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
      showErrorToast(
        new Error('Apple Music not connected'),
        'playback'
      );
      return;
    }
    try {
      musicKit.seekToTime(time);
      syncToBackend();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, isAuthorized, syncToBackend, handleAuthLost]);

  const skipNext = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      showErrorToast(
        new Error('Apple Music not connected'),
        'playback'
      );
      return;
    }
    try {
      await musicKit.skipToNextItem();
      syncToBackend();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, isAuthorized, syncToBackend, handleAuthLost]);

  const skipPrev = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!isAuthorized) {
      showErrorToast(
        new Error('Apple Music not connected'),
        'playback'
      );
      return;
    }
    try {
      await musicKit.skipToPreviousItem();
      syncToBackend();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, isAuthorized, syncToBackend, handleAuthLost]);

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
    executeAgentActions,
    syncMusicKitState
  };
}
