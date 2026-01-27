
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API_BASE = 'http://localhost:8000';

// Minimal Type Definitions for MusicKit
declare global {
  interface Window {
    MusicKit: any;
  }
}

interface PlaybackTime {
  current: number;
  total: number;
}

interface TrackAttributes {
  name?: string;
  title?: string;
  artistName?: string;
  albumName?: string;
  artwork?: {
    url: string;
  };
  durationInMillis?: number;
  [key: string]: any;
}

interface MusicKitTrack {
  id: string;
  attributes: TrackAttributes;
  [key: string]: any;
}

export interface SyncTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  artwork_url: string;
  duration: number;
}

interface UseAppleMusicReturn {
  musicKit: any;
  isAuthorized: boolean;
  currentTrack: MusicKitTrack | null;
  isPlaying: boolean;
  playbackTime: PlaybackTime;
  queue: MusicKitTrack[];
  sessionId: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlay: () => Promise<void>;
  playTrack: (index: number) => Promise<void>;
  setQueue: (items: any[], startPlaying?: boolean) => Promise<void>;
  search: (term: string, types?: string[]) => Promise<MusicKitTrack[]>;
  seekTo: (time: number) => void;
  skipNext: () => Promise<void>;
  skipPrev: () => Promise<void>;
  isInitializing: boolean;
  syncToBackend: (data?: any, targetSessionId?: string | null) => Promise<void>;
  executeAgentActions: (actions: string[]) => Promise<void>;
}

const useAppleMusic = (userId: string | null, activeSessionId: string | null): UseAppleMusicReturn => {
    const [musicKit, setMusicKit] = useState<any>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [currentTrack, setCurrentTrack] = useState<MusicKitTrack | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackTime, setPlaybackTime] = useState<PlaybackTime>({ current: 0, total: 0 });
    const [queue, setQueueState] = useState<MusicKitTrack[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const developerTokenRef = useRef<string | null>(null);

    // Generate a fallback UUID for anonymous sessions
    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };
    // Internal session ID (fallback)
    const [internalSessionId] = useState(() => generateUUID());

    // Use active session ID if provided, otherwise internal (reactive with useMemo)
    const sessionId = useMemo(() => {
        return activeSessionId || internalSessionId;
    }, [activeSessionId, internalSessionId]);

    // ==========================================================================
    // Helper: Format track for backend sync
    // ==========================================================================
    const formatTrackForSync = useCallback((track: MusicKitTrack | null): SyncTrack | null => {
        if (!track) return null;
        const attr = track.attributes || track;
        return {
            id: track.id || '',
            name: attr.name || attr.title || 'Unknown',
            artist: attr.artistName || 'Unknown',
            album: attr.albumName || '',
            artwork_url: attr.artwork?.url?.replace('{w}', '300').replace('{h}', '300') || '',
            duration: attr.durationInMillis ? attr.durationInMillis / 1000 : 0
        };
    }, []);

    // ==========================================================================
    // Sync state to backend
    // ==========================================================================
    const syncToBackend = useCallback(async (data = {}, targetSessionId: string | null = null) => {
        if (!isAuthorized) return;

        // Use argument ID if provided, otherwise state ID
        const sid = targetSessionId || sessionId;

        try {
            const payload = {
                session_id: sid,
                user_id: userId, // Send user_id for permission check
                current_track: formatTrackForSync(currentTrack),
                playlist: queue.map(formatTrackForSync),
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
    const search = async (term: string, types: string[] = ['songs']): Promise<MusicKitTrack[]> => {
        if (!musicKit) return [];
        const storefront = musicKit.storefrontId || 'us';
        try {
            const response = await musicKit.api.music(`v1/catalog/${storefront}/search`, {
                term,
                types: types.join(','),
                limit: 10
            });
            return response.data?.results?.songs?.data || [];
        } catch (e) {
            console.error('Search error:', e);
            return [];
        }
    };

    const executeAgentActions = useCallback(async (actions: string[]) => {
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
                        await musicKit.setQueue({ items: newQueue.map(t => t.id || t) });
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
                        await musicKit.setQueue({ items: newQueue.map(t => t.id || t) });
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
        const initMusicKit = async () => {
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
                    app: { name: 'Playhead', build: '1.0.0' },
                });

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
                    setIsPlaying(event.state === window.MusicKit.PlaybackStates.playing);
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
    const login = async () => {
        if (!musicKit) return;

        const w = 600, h = 700;
        const left = (window.screen.width - w) / 2;
        const top = (window.screen.height - h) / 2;
        const originalOpen = window.open;

        // @ts-ignore
        window.open = (url, name) => {
            return originalOpen(url, name, `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=yes`);
        };

        try {
            await musicKit.authorize();
            setIsAuthorized(musicKit.isAuthorized);
        } finally {
            window.open = originalOpen;
        }
    };

    const logout = async () => {
        if (musicKit) await musicKit.unauthorize();
    };

    // ==========================================================================
    // Playback Controls (with sync)
    // ==========================================================================
    const play = async () => {
        if (musicKit) {
            await musicKit.play();
            syncToBackend();
        }
    };

    const pause = async () => {
        if (musicKit) {
            await musicKit.pause();
            syncToBackend();
        }
    };

    const togglePlay = async () => {
        if (!musicKit) return;
        isPlaying ? await musicKit.pause() : await musicKit.play();
        syncToBackend();
    };

    const setQueue = async (items: any[], startPlaying = true) => {
        if (!musicKit) return;
        try {
            await musicKit.setQueue({ items });
            if (items.length > 0) setCurrentTrack(items[0]);
            if (startPlaying) {
                await musicKit.play();
            }
            syncToBackend();
        } catch (e) {
            console.error('Failed to set queue:', e);
        }
    };

    const playTrack = async (index: number) => {
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
    };

    const seekTo = (time: number) => {
        if (musicKit) {
            musicKit.seekToTime(time);
            syncToBackend();
        }
    };

    const skipNext = async () => {
        if (!musicKit) return;
        try {
            await musicKit.skipToNextItem();
            syncToBackend();
        } catch (e) {
            console.error('Skip next error:', e);
        }
    };

    const skipPrev = async () => {
        if (!musicKit) return;
        try {
            await musicKit.skipToPreviousItem();
            syncToBackend();
        } catch (e) {
            console.error('Skip prev error:', e);
        }
    };

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
};

export default useAppleMusic;
