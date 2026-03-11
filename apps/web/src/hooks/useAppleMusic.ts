/**
 * Apple Music integration hook
 * @module hooks/useAppleMusic
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { classifyError, showErrorToast } from '../utils/errorHandling';
import { ErrorCategory } from '../types/errors';
import { API_BASE } from '../config/api';
import type { MusicKitConfig } from '../types/musicKit';
import type {
  Track,
  PlaybackTime,
  FormattedTrack,
  SearchResultItem,
  MusicKitInstance,
  AgentAction
} from '../types/index.d';

interface UseAppleMusicParams {
  userId: string | null;
  activeSessionId: string | null;
  /** Which session owns playback — auto-sync writes to this session */
  syncSessionId?: string | null;
  /** Stored Apple Music user token from backend, used to restore authorization */
  storedMusicUserToken?: string | null;
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
  executeAgentActions: (actions: AgentAction[]) => Promise<void>;
  /** Sync real MusicKit playback state to backend DB (reads from MusicKit, not React) */
  syncMusicKitState: () => Promise<void>;
  /** Restore MusicKit queue from backend checkpoint. Returns the state data from backend. */
  restoreStateFromBackend: (targetSessionId?: string) => Promise<{ playlist?: FormattedTrack[]; current_track?: FormattedTrack | null; is_playing?: boolean; playback_position?: number } | null>;
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
  activeSessionId,
  syncSessionId,
  storedMusicUserToken
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

  // Ref to hold latest syncMusicKitState for use in MusicKit event listeners
  const syncMusicKitStateRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ==========================================================================
  // Sync MusicKit state directly to backend (reads from MusicKit, not React)
  // Used as an ACK after each agent action so the backend DB sees real state
  // before the next agent turn starts.
  // ==========================================================================
  const syncMusicKitState = useCallback(async (): Promise<void> => {
    if (!musicKit || !musicKit.isAuthorized) return;

    try {
      const nowPlaying = musicKit.nowPlayingItem;
      const queueItems = musicKit.queue?.items ?? [];

      const sid = syncSessionId || sessionId;
      const payload = {
        session_id: sid,
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
  }, [musicKit, sessionId, syncSessionId, userId, formatTrackForSync]);

  // Keep ref in sync for event listener access
  syncMusicKitStateRef.current = syncMusicKitState;

  // ==========================================================================
  // Helper: show auth-required toast with a Connect button
  // ==========================================================================
  const showAuthRequiredToast = useCallback(() => {
    toast.error('Apple Music not connected', {
      description: 'Connect your Apple Music account to continue',
      action: {
        label: 'Connect',
        onClick: () => {
          if (musicKit) {
            musicKit.authorize().then(() => {
              setIsAuthorized(musicKit.isAuthorized);
            });
          }
        }
      }
    });
  }, [musicKit]);

  // ==========================================================================
  // Execute agent commands
  // After each action, sync MusicKit state to backend as an ACK so the
  // next agent turn reads real state from DB.
  // ==========================================================================
  const executeAgentActions = useCallback(async (actions: AgentAction[]): Promise<void> => {
    if (!musicKit || !actions || actions.length === 0) return;
    // Read auth directly from MusicKit instance to avoid stale closure over React state
    if (!musicKit.isAuthorized) {
      console.warn('[Agent] executeAgentActions blocked: musicKit.isAuthorized is false');
      showAuthRequiredToast();
      return;
    }

    for (const action of actions) {
      switch (action.type) {
        case 'play_track': {
          const index = action.data?.index as number | undefined;
          if (index == null || index < 0) break;

          // Wait for queue to have enough items (race with add_to_queue's playLater)
          let attempts = 0;
          while (index >= musicKit.queue.items.length && attempts < 20) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }

          if (index < musicKit.queue.items.length) {
            try {
              await musicKit.changeToMediaAtIndex(index);
              await musicKit.play();
            } catch (e) {
              console.error('[Agent] play_track error:', e);
            }
          } else {
            console.error('[Agent] play_track: queue not ready after wait', {
              index, queueLength: musicKit.queue.items.length
            });
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
  }, [musicKit, syncMusicKitState]);

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
        const configOptions: MusicKitConfig & { musicUserToken?: string } = {
          developerToken: developerTokenRef.current!,
          app: { name: 'Playhead', build: '1.0.0' }
        };

        // If we have a stored user token, pass it to restore authorization
        if (storedMusicUserToken) {
          configOptions.musicUserToken = storedMusicUserToken;
          console.log('[MusicKit] Restoring authorization with stored user token');
        }

        const mk = await window.MusicKit.configure(configOptions as MusicKitConfig) as MusicKitInstance;
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
            // Sync to backend when track auto-advances (no user action triggers sync)
            syncMusicKitStateRef.current();
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
  // Restore music state from backend checkpoint
  // Frontend (MusicKit) is the ground-truth.
  // Backend is checkpoint for:
  // - Restoring frontend after page refresh
  // - Agent reading current state
  // - Saving/loading state when switching sessions
  // ==========================================================================
  const restoreStateFromBackend = useCallback(async (targetSessionId?: string): Promise<{ playlist?: FormattedTrack[]; current_track?: FormattedTrack | null; is_playing?: boolean; playback_position?: number } | null> => {
    const restoreId = targetSessionId || sessionId;
    if (!musicKit || !musicKit.isAuthorized || !restoreId) return null;

    // Skip for anonymous sessions
    if (restoreId === internalSessionId) {
      console.log('[Restore] Anonymous session, skipping');
      return null;
    }

    try {
      const url = userId
        ? `${API_BASE}/state?session_id=${restoreId}&user_id=${userId}`
        : `${API_BASE}/state?session_id=${restoreId}`;

      console.log(`[Restore] Loading checkpoint for session: ${restoreId}`);
      const res = await fetch(url);

      if (!res.ok) {
        if (res.status === 404) {
          console.log('[Restore] No checkpoint found (new session)');
        } else {
          console.error('[Restore] Failed to fetch checkpoint:', res.status);
        }
        return null;
      }

      const data = await res.json();
      const { playlist, current_track, is_playing, playback_position } = data;

      // Skip MusicKit restore if no saved playlist, but still return data
      if (!playlist || playlist.length === 0) {
        console.log('[Restore] Empty playlist in checkpoint');
        return data;
      }

      // Validate track IDs (filter out null/undefined/invalid)
      const validTrackIds = playlist
        .map((t: FormattedTrack) => t.id)
        .filter((id: string) => id && id !== 'undefined' && id !== 'null');

      if (validTrackIds.length === 0) {
        console.warn('[Restore] No valid track IDs in checkpoint');
        return data;
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
      return data;
    } catch (e) {
      console.error('[Restore] Failed to restore from checkpoint:', e);
      return null;
    }
  }, [musicKit, sessionId, userId, internalSessionId]);

  // NOTE: Auto-restore on session change removed — App.tsx now controls when to restore
  // (only on initial page load, not on conversation switches)

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
    if (!musicKit.isAuthorized) {
      showAuthRequiredToast();
      return;
    }
    try {
      await musicKit.play();
      await syncMusicKitState();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, syncMusicKitState, handleAuthLost]);

  const pause = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!musicKit.isAuthorized) {
      showAuthRequiredToast();
      return;
    }
    try {
      await musicKit.pause();
      await syncMusicKitState();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, syncMusicKitState, handleAuthLost]);

  const togglePlay = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!musicKit.isAuthorized) {
      showAuthRequiredToast();
      return;
    }
    try {
      isPlaying ? await musicKit.pause() : await musicKit.play();
      await syncMusicKitState();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, isPlaying, syncMusicKitState, handleAuthLost]);

  const setQueue = useCallback(async (
    items: (string | Track)[],
    startPlaying = true
  ): Promise<void> => {
    if (!musicKit) return;
    if (!musicKit.isAuthorized) {
      showAuthRequiredToast();
      return;
    }
    try {
      await musicKit.setQueue({ items: items as any });
      if (items.length > 0) setCurrentTrack(items[0] as Track);
      if (startPlaying) {
        await musicKit.play();
      }
      await syncMusicKitState();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'queue management');
      }
    }
  }, [musicKit, syncMusicKitState, handleAuthLost]);

  const playTrack = useCallback(async (index: number): Promise<void> => {
    if (!musicKit) return;
    if (!musicKit.isAuthorized) {
      showAuthRequiredToast();
      return;
    }
    try {
      await musicKit.changeToMediaAtIndex(index);
      const track = queue[index] || musicKit.queue.items[index];
      if (track) setCurrentTrack(track);
      await musicKit.play();
      await syncMusicKitState();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, queue, syncMusicKitState, handleAuthLost]);

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
    if (!musicKit.isAuthorized) {
      showAuthRequiredToast();
      return;
    }
    try {
      musicKit.seekToTime(time);
      syncMusicKitState();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, syncMusicKitState, handleAuthLost]);

  const skipNext = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!musicKit.isAuthorized) {
      showAuthRequiredToast();
      return;
    }
    try {
      await musicKit.skipToNextItem();
      await syncMusicKitState();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, syncMusicKitState, handleAuthLost]);

  const skipPrev = useCallback(async (): Promise<void> => {
    if (!musicKit) return;
    if (!musicKit.isAuthorized) {
      showAuthRequiredToast();
      return;
    }
    try {
      await musicKit.skipToPreviousItem();
      await syncMusicKitState();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, syncMusicKitState, handleAuthLost]);

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
    executeAgentActions,
    syncMusicKitState,
    restoreStateFromBackend
  };
}
