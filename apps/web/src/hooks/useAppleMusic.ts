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
import { useChatStore } from '../store/chatStore';
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
  /** Update the playing session's playlist snapshot and session ID atomically */
  updatePlayingPlaylist: (targetSessionId: string, playlist: FormattedTrack[]) => void;
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
  const isAdvancingRef = useRef(false);
  const lastPlayingTrackIdRef = useRef<string | null>(null);
  const isRestoringRef = useRef(false);
  const playingPlaylistRef = useRef<FormattedTrack[]>([]);
  const playingSessionIdRef = useRef<string | null>(null);

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

      // Read session ID and playlist from refs (updated atomically by updatePlayingPlaylist)
      // to avoid cross-session contamination from React state/ref timing mismatches.
      const sid = playingSessionIdRef.current || syncSessionId || sessionId;
      const playlist = playingPlaylistRef.current;

      const payload = {
        session_id: sid,
        user_id: userId,
        current_track: nowPlaying ? formatTrackForSync(nowPlaying) : null,
        playlist: playlist.map(t => ({
          id: t.id,
          name: t.name,
          artist: t.artist,
          album: t.album || '',
          artwork_url: t.artwork_url || '',
          duration: t.duration || 0,
        })),
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
  // Handle authentication loss
  // ==========================================================================
  const handleAuthLost = useCallback(() => {
    setIsAuthorized(false);
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
  // Execute agent commands
  // After each action, sync MusicKit state to backend as an ACK so the
  // next agent turn reads real state from DB.
  // ==========================================================================
  const executeAgentActions = useCallback(async (actions: AgentAction[]): Promise<void> => {
    if (!musicKit || !actions || actions.length === 0) return;
    // Read auth directly from MusicKit instance to avoid stale closure over React state.
    // Also check musicUserToken — MusicKit may report isAuthorized=true from cached/expired tokens
    // but fail with an internal error dialog when making API calls.
    if (!musicKit.isAuthorized || !musicKit.musicUserToken) {
      console.warn('[Agent] executeAgentActions blocked: not authorized or no user token');
      showAuthRequiredToast();
      return;
    }

    for (const action of actions) {
      switch (action.type) {
        case 'play_track': {
          const index = action.data?.index as number | undefined;
          if (index == null || index < 0) break;

          const targetTrack = playingPlaylistRef.current[index];
          if (!targetTrack?.id) {
            console.error('[Agent] play_track: no track at index', { index });
            break;
          }

          try {
            await musicKit.setQueue({ song: targetTrack.id, startPlaying: true } as any);
          } catch (e) {
            console.error('[Agent] play_track error:', e);
            const classified = classifyError(e);
            if (classified.category === ErrorCategory.AUTH_EXPIRED) {
              handleAuthLost();
              return;
            }
            showErrorToast(e, 'playback');
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
            const classified = classifyError(e);
            if (classified.category === ErrorCategory.AUTH_EXPIRED) {
              handleAuthLost();
              return;
            }
            showErrorToast(e, 'queue management');
          }
          break;
        }

        case 'skip_next': {
          const playlist = playingPlaylistRef.current;
          const currentId = musicKit.nowPlayingItem?.id;
          if (currentId && playlist.length > 0) {
            const currentIdx = playlist.findIndex(t => t.id === currentId);
            const nextTrack = playlist[currentIdx + 1];
            if (nextTrack?.id) {
              try {
                await musicKit.setQueue({ song: nextTrack.id, startPlaying: true } as any);
              } catch (e) {
                console.error('[Agent] skip_next error:', e);
                const classified = classifyError(e);
                if (classified.category === ErrorCategory.AUTH_EXPIRED) {
                  handleAuthLost();
                  return;
                }
                showErrorToast(e, 'playback');
              }
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
              const classified = classifyError(e);
              if (classified.category === ErrorCategory.AUTH_EXPIRED) {
                handleAuthLost();
                return;
              }
              showErrorToast(e, 'queue management');
            }
          }
          break;
        }

        default:
          console.warn('[Agent] Unknown action type:', action.type);
      }
    }

    // Fire-and-forget single sync after all actions complete.
    // Avoids blocking the SSE stream with per-action awaits (Bug 3: "ON AIR..." hang).
    syncMusicKitState();
  }, [musicKit, syncMusicKitState, handleAuthLost]);

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
            // Sync to backend when track auto-advances — but NOT during restore
            // (restore reads from backend; syncing back would overwrite with stale viewedPlaylist)
            if (!isRestoringRef.current) {
              syncMusicKitStateRef.current();
            }
          }
        });

        mk.addEventListener('playbackStateDidChange', (event: any) => {
          const state = event.state;
          const isPlayingNow = state === 'playing' || state === 2;
          setIsPlaying(isPlayingNow);
          if (mk.nowPlayingItem) {
            setCurrentTrack(mk.nowPlayingItem);
            // Track the last playing song so we know which song just ended
            if (isPlayingNow) {
              lastPlayingTrackIdRef.current = mk.nowPlayingItem.id;
            }
          }

          // Auto-advance: when a song ends, play the next track from our playlist
          // Check both string and numeric values for robustness
          const isCompleted = state === 'completed' || state === 10;
          const isEnded = state === 'ended' || state === 5;

          if ((isCompleted || isEnded) && !isAdvancingRef.current) {
            const playlist = playingPlaylistRef.current;
            // nowPlayingItem may be null after single-song queue ends, use ref as fallback
            const currentId = mk.nowPlayingItem?.id || lastPlayingTrackIdRef.current;
            if (currentId && playlist.length > 0) {
              const currentIdx = playlist.findIndex(t => t.id === currentId);
              if (currentIdx >= 0 && currentIdx < playlist.length - 1) {
                isAdvancingRef.current = true;
                // Try next tracks, skipping any that fail to resolve
                const tryPlay = async (startIdx: number) => {
                  for (let i = startIdx; i < playlist.length; i++) {
                    const track = playlist[i];
                    if (!track?.id) continue;
                    try {
                      console.log('[AutoAdvance] Playing next:', track.id);
                      await mk.setQueue({ song: track.id, startPlaying: true } as any);
                      return; // success
                    } catch (e: any) {
                      const classified = classifyError(e);
                      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
                        handleAuthLost();
                        return;
                      }
                      console.warn(`[AutoAdvance] Skipping unresolvable track ${track.id}:`, e.message || e);
                    }
                  }
                  console.log('[AutoAdvance] No more playable tracks');
                };
                tryPlay(currentIdx + 1).finally(() => { isAdvancingRef.current = false; });
              }
            }
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

      console.log(`[Restore] Restoring from checkpoint (${validTrackIds.length} tracks in playlist)`);

      // Only restore current track as single-song playback
      // viewedPlaylist is restored by chatStore.loadHistory, not MusicKit queue
      // Suppress sync during restore to avoid overwriting backend with stale viewedPlaylist
      if (current_track?.id) {
        isRestoringRef.current = true;
        try {
          console.log(`[Restore] Restoring current track: ${current_track.id}`);
          await musicKit.setQueue({ song: current_track.id, startPlaying: is_playing } as any);

          if (playback_position && playback_position > 0) {
            console.log(`[Restore] Seeking to ${playback_position}s`);
            musicKit.seekToTime(playback_position);
          }
        } catch (restoreErr) {
          const classified = classifyError(restoreErr);
          if (classified.category === ErrorCategory.AUTH_EXPIRED) {
            handleAuthLost();
          } else {
            console.error('[Restore] Failed to restore current track:', restoreErr);
          }
        } finally {
          isRestoringRef.current = false;
        }
      }

      console.log('[Restore] State restored from checkpoint ✓');
      return data;
    } catch (e) {
      console.error('[Restore] Failed to restore from checkpoint:', e);
      return null;
    }
  }, [musicKit, sessionId, userId, internalSessionId]);

  // Atomically update the playing session ID and playlist snapshot.
  // Both refs are updated together to prevent cross-session contamination.
  const updatePlayingPlaylist = useCallback((targetSessionId: string, playlist: FormattedTrack[]) => {
    playingSessionIdRef.current = targetSessionId;
    playingPlaylistRef.current = playlist;
  }, []);

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
      const targetTrack = playingPlaylistRef.current[index];

      if (!targetTrack?.id) {
        console.error('[playTrack] No track at index', index);
        return;
      }

      await musicKit.setQueue({ song: targetTrack.id, startPlaying: true } as any);
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
      const playlist = playingPlaylistRef.current;
      const currentId = musicKit.nowPlayingItem?.id;
      if (!currentId || playlist.length === 0) return;

      const currentIdx = playlist.findIndex(t => t.id === currentId);
      const nextTrack = playlist[currentIdx + 1];
      if (nextTrack?.id) {
        await musicKit.setQueue({ song: nextTrack.id, startPlaying: true } as any);
        await syncMusicKitState();
      }
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
      const playlist = playingPlaylistRef.current;
      const currentId = musicKit.nowPlayingItem?.id;
      if (!currentId || playlist.length === 0) return;

      const currentIdx = playlist.findIndex(t => t.id === currentId);
      const prevTrack = playlist[currentIdx - 1];
      if (prevTrack?.id) {
        await musicKit.setQueue({ song: prevTrack.id, startPlaying: true } as any);
        await syncMusicKitState();
      }
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }, [musicKit, syncMusicKitState, handleAuthLost]);

  // Periodic sync every 10s while playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      syncMusicKitStateRef.current();
    }, 10_000);
    return () => clearInterval(interval);
  }, [isPlaying]);

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
    restoreStateFromBackend,
    updatePlayingPlaylist
  };
}
