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
  /** Whether the token check has completed (from useAppleMusicLink) */
  isTokenChecked?: boolean;
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
  /** Sync just the playlist to backend (no MusicKit auth required) */
  syncPlaylistToBackend: (playlist: FormattedTrack[]) => Promise<void>;
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
  storedMusicUserToken,
  isTokenChecked = false
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
  const playingPlaylistRef = useRef<FormattedTrack[]>([]);
  const playingSessionIdRef = useRef<string | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  // ── MusicKit decoupling gate ───────────────────────────────────────
  // When false, ALL MusicKit event-driven state changes are ignored.
  // This prevents MusicKit's internal auto-restore / stale events from
  // polluting app state. Only set to true after the app's own restore
  // (from backend checkpoint) has completed.
  const playerReadyRef = useRef(false);

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
        is_playing: (musicKit.playbackState as any) === 2 || (musicKit.playbackState as any) === 'playing',
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

  // ==========================================================================
  // Playlist-only sync (no MusicKit auth required)
  //
  // Why: syncMusicKitState gates on musicKit.isAuthorized — if the user hasn't
  // connected Apple Music, playlist changes from SSE actions (add_to_queue,
  // remove_track) are never persisted, and a page refresh loses everything.
  //
  // This function only sends the playlist array to /state/sync, decoupling
  // playlist persistence from MusicKit auth. Called by the debounced
  // viewedPlaylist watcher in App.tsx.
  // ==========================================================================
  const syncPlaylistToBackend = useCallback(async (playlist: FormattedTrack[]): Promise<void> => {
    const sid = playingSessionIdRef.current || syncSessionId || sessionId;
    if (!sid || !userId) return;

    try {
      await fetch(`${API_BASE}/state/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sid,
          user_id: userId,
          playlist: playlist.map(t => ({
            id: t.id,
            name: t.name,
            artist: t.artist,
            album: t.album || '',
            artwork_url: t.artwork_url || '',
            duration: t.duration || 0,
          })),
        }),
      });
    } catch (e) {
      console.error('[SyncPlaylist] Error:', e);
    }
  }, [sessionId, syncSessionId, userId]);

  // Keep ref in sync for event listener access
  syncMusicKitStateRef.current = syncMusicKitState;

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
  // Initialize MusicKit — waits for token check to complete so that
  // storedMusicUserToken is available when MusicKit.configure() runs.
  // This prevents auth loss after deployment (new developer token +
  // missing user token = MusicKit can't restore the session).
  // ==========================================================================
  useEffect(() => {
    // Don't initialize until token check is done — otherwise
    // storedMusicUserToken will be undefined and MusicKit.configure()
    // won't receive it, causing auth loss when the developer token changes.
    if (!isTokenChecked) return;

    // Track event listeners and instance so we can clean up properly
    const listeners: Array<[string, (...args: any[]) => void]> = [];
    let mkInstance: MusicKitInstance | null = null;

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

        // ── Clear MusicKit's browser-persisted playback state ─────────
        // MusicKit stores queue/playback state in the browser (localStorage
        // / IndexedDB) and auto-restores it on configure(). We clear it
        // so configure() starts with a blank slate — the app's own
        // restoreStateFromBackend() is the single source of truth.
        playerReadyRef.current = false;
        // ── Clear MusicKit's browser-persisted playback state ─────────
        // Clear localStorage keys (queue, playback, etc.) but NOT the
        // media-user-token — we don't need to touch it at all.
        // Auth is restored via mk.musicUserToken assignment below.
        try {
          Object.keys(localStorage).forEach(key => {
            if (key.includes('media-user-token')) return; // preserve auth
            if (key.startsWith('music.') || key.startsWith('mk-')) {
              localStorage.removeItem(key);
            }
          });
          // Clear MusicKit IndexedDB databases
          const dbs = await (indexedDB.databases?.() ?? Promise.resolve([]));
          for (const db of dbs) {
            if (db.name && (db.name.includes('music') || db.name.includes('MusicKit'))) {
              indexedDB.deleteDatabase(db.name);
            }
          }
        } catch (_) { /* storage access may be restricted */ }

        const mk = await window.MusicKit.configure({
          developerToken: developerTokenRef.current!,
          app: { name: 'Playhead', build: '1.0.0' }
        } as MusicKitConfig) as MusicKitInstance;
        mkInstance = mk;

        // Stop any auto-restored playback immediately — MusicKit may
        // resume from its own persistence despite our cleanup above.
        try { mk.stop(); } catch (_) { /* ignore */ }

        // Restore auth from server-side token by setting the instance
        // property directly. This avoids hacking localStorage keys.
        if (storedMusicUserToken && !mk.isAuthorized) {
          (mk as any).musicUserToken = storedMusicUserToken;
        }

        setMusicKit(mk);
        setIsAuthorized(mk.isAuthorized);
        setQueueState([]);

        // ── Events ───────────────────────────────────────────────────────
        const on = (event: string, handler: (...args: any[]) => void) => {
          mk.addEventListener(event, handler);
          listeners.push([event, handler]);
        };

        // Auth — always active
        on('authorizationStatusDidChange', () => {
          const nowAuthorized = mk.isAuthorized;
          if (isAuthorized && !nowAuthorized) handleAuthLost();
          setIsAuthorized(nowAuthorized);
        });

        // Playback — gated
        on('mediaItemDidChange', (e: any) => {
          if (!playerReadyRef.current) return;
          if (e.item) { setCurrentTrack(e.item); setPlaybackTime({ current: 0, total: 0 }); }
        });

        on('nowPlayingItemDidChange', () => {
          if (!playerReadyRef.current) return;
          const item = mk.nowPlayingItem;
          if (item) {
            setCurrentTrack(item);
            setPlaybackTime({ current: 0, total: 0 });
            syncMusicKitStateRef.current();
          }
        });

        on('playbackStateDidChange', (e: any) => {
          if (!playerReadyRef.current) return;
          const state = e.state;
          const playing = state === 'playing' || state === 2;
          const paused  = state === 'paused'  || state === 3;
          setIsPlaying(playing);
          if (mk.nowPlayingItem) {
            setCurrentTrack(mk.nowPlayingItem);
            if (playing) lastPlayingTrackIdRef.current = mk.nowPlayingItem.id;
          }
          if (playing || paused) syncMusicKitStateRef.current();

          // Auto-advance from OUR playlist
          const ended = state === 'completed' || state === 10 || state === 'ended' || state === 5;
          if (ended && !isAdvancingRef.current) {
            const playlist = playingPlaylistRef.current;
            const currentId = mk.nowPlayingItem?.id || lastPlayingTrackIdRef.current;
            if (currentId && playlist.length > 0) {
              const idx = playlist.findIndex(t => t.id === currentId);
              if (idx >= 0 && idx < playlist.length - 1) {
                isAdvancingRef.current = true;
                (async () => {
                  for (let i = idx + 1; i < playlist.length; i++) {
                    if (!playlist[i]?.id) continue;
                    try {
                      await mk.setQueue({ song: playlist[i].id, startPlaying: true } as any);
                      return;
                    } catch (err: any) {
                      if (classifyError(err).category === ErrorCategory.AUTH_EXPIRED) { handleAuthLost(); return; }
                    }
                  }
                })().finally(() => { isAdvancingRef.current = false; });
              }
            }
          }
        });

        on('playbackTimeDidChange', (e: any) => {
          if (!playerReadyRef.current) return;
          setPlaybackTime({ current: e.currentPlaybackTime, total: e.currentPlaybackDuration });
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
      // Gate closed — no more events processed
      playerReadyRef.current = false;
      // Stop playback and remove listeners
      if (mkInstance) {
        try { mkInstance.stop(); } catch (_) { /* ignore */ }
        listeners.forEach(([event, handler]) => {
          try { mkInstance!.removeEventListener(event, handler); } catch (_) { /* ignore */ }
        });
      }
    };
  }, [isTokenChecked, storedMusicUserToken]);

  // ==========================================================================
  // Restore playback from backend checkpoint (single source of truth).
  // MusicKit's own persistence is cleared on init, so configure() starts
  // with a blank slate and this function is the only thing that plays.
  // ==========================================================================
  const restoreStateFromBackend = useCallback(async (targetSessionId?: string): Promise<{ playlist?: FormattedTrack[]; current_track?: FormattedTrack | null; is_playing?: boolean; playback_position?: number } | null> => {
    const restoreId = targetSessionId || sessionId;
    if (!restoreId) { playerReadyRef.current = true; return null; }
    if (restoreId === internalSessionId) { playerReadyRef.current = true; return null; }

    try {
      const url = userId
        ? `${API_BASE}/state?session_id=${restoreId}&user_id=${userId}`
        : `${API_BASE}/state?session_id=${restoreId}`;

      const res = await fetch(url);
      if (!res.ok) { playerReadyRef.current = true; return null; }

      const data = await res.json();
      const { current_track, is_playing, playback_position } = data;

      if (!musicKit || !musicKit.isAuthorized) {
        playerReadyRef.current = true;
        return data;
      }

      if (current_track?.id) {
        try {
          // Restore queue and position only — never auto-play on page load.
          // The user must tap play to resume. This prevents ghost background
          // playback and browser autoplay policy issues.
          await musicKit.setQueue({ song: current_track.id, startPlaying: false } as any);
          // Don't seekToTime here — media isn't loaded yet so it won't work.
          // Store the position and seek after play() is called.
          if (playback_position && playback_position > 0) {
            pendingSeekRef.current = playback_position;
          }
          // Manually update React state since we're not calling play() —
          // MusicKit events won't fire to populate the UI.
          if (musicKit.nowPlayingItem) {
            setCurrentTrack(musicKit.nowPlayingItem);
          } else {
            // Fallback: use backend data directly
            setCurrentTrack({
              id: current_track.id,
              name: current_track.name,
              artistName: current_track.artist,
              albumName: current_track.album,
              artworkURL: current_track.artwork_url,
              artwork: current_track.artwork_url ? { url: current_track.artwork_url } : undefined,
              duration: current_track.duration || 0,
            } as any);
          }
          setPlaybackTime({
            current: playback_position || 0,
            total: current_track.duration || 0,
          });
        } catch (restoreErr) {
          const classified = classifyError(restoreErr);
          if (classified.category === ErrorCategory.AUTH_EXPIRED) {
            handleAuthLost();
          } else {
            console.error('[Restore] Failed:', restoreErr);
          }
        }
      }

      playerReadyRef.current = true;
      return data;
    } catch (e) {
      console.error('[Restore] Failed:', e);
      playerReadyRef.current = true;
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
    try {
      playerReadyRef.current = true;
      await musicKit.play();
      // Seek to saved position after play starts (media must be loaded first)
      const pendingSeek = pendingSeekRef.current;
      if (pendingSeek !== null) {
        pendingSeekRef.current = null;
        await musicKit.seekToTime(pendingSeek);
      }
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
    try {
      playerReadyRef.current = true;
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
    try {
      const targetTrack = playingPlaylistRef.current[index];

      if (!targetTrack?.id) {
        console.error('[playTrack] No track at index', index);
        return;
      }

      playerReadyRef.current = true;
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
    syncPlaylistToBackend,
    restoreStateFromBackend,
    updatePlayingPlaylist
  };
}
