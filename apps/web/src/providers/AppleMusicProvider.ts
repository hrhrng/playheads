/**
 * Apple Music provider — pure TS class wrapping MusicKit JS.
 * Responsible only for single-track playback, auth, and search.
 * Queue management is handled by usePlayQueue.
 */

import { toast } from 'sonner';
import { classifyError, showErrorToast } from '../utils/errorHandling';
import { ErrorCategory } from '../types/errors';
import { API_BASE } from '../config/api';
import type { MusicKitInstance } from '../types/musicKit';
import type { MusicProvider, PlaybackState, UnifiedTrack, ProviderType } from './types';

type StateChangeCallback = (state: PlaybackState) => void;

interface AppleMusicProviderConfig {
  storedMusicUserToken?: string | null;
  onTrackEnded?: () => void;
}

export class AppleMusicProvider implements MusicProvider {
  readonly type: ProviderType = 'apple-music';

  private musicKit: MusicKitInstance | null = null;
  private _isAuthorized = false;
  private _isInitializing = true;
  private _playbackState: PlaybackState = {
    currentTrack: null,
    isPlaying: false,
    isTransitioning: false,
    playbackTime: { current: 0, total: 0 },
  };

  private listeners: StateChangeCallback[] = [];
  private eventListeners: Array<[string, (...args: any[]) => void]> = [];
  private config: AppleMusicProviderConfig;
  private destroyed = false;

  // MusicKit decoupling gate
  private playerReadyRef = false;
  private isRestoringRef = false;
  private restoreFinishedAt = 0;
  private pendingQueue: { songId: string; startTime?: number } | null = null;

  // Playback control
  private playbackLock = false;
  private isAdvancing = false;
  private lastPlayingTrackId: string | null = null;
  private transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private developerToken: string | null = null;

  // Track ended callback — called by usePlayQueue for auto-advance
  private onTrackEnded: (() => void) | null = null;

  // Storefront
  private _storefrontId = 'us';

  constructor(config: AppleMusicProviderConfig = {}) {
    this.config = config;
    this.onTrackEnded = config.onTrackEnded || null;
  }

  get isAuthorized(): boolean { return this._isAuthorized; }
  get isInitializing(): boolean { return this._isInitializing; }
  get playbackState(): PlaybackState { return this._playbackState; }
  get storefrontId(): string { return this._storefrontId; }

  setOnTrackEnded(cb: (() => void) | null) {
    this.onTrackEnded = cb;
  }

  // ── State emission ──────────────────────────────────────────────
  private emit() {
    if (this.destroyed) return;
    for (const cb of this.listeners) {
      cb(this._playbackState);
    }
  }

  private updateState(partial: Partial<PlaybackState>) {
    this._playbackState = { ...this._playbackState, ...partial };
    this.emit();
  }

  onStateChange(cb: StateChangeCallback): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  // ── Initialization ──────────────────────────────────────────────
  async initialize(): Promise<void> {
    try {
      if (!window.MusicKit) {
        console.error('[AppleMusicProvider] window.MusicKit not available');
        this._isInitializing = false;
        this.emit();
        return;
      }

      // Fetch developer token
      try {
        const response = await fetch(`${API_BASE}/apple-music/developer-token`);
        if (!response.ok) throw new Error(`Developer token request failed: ${response.status}`);
        const data = await response.json();
        this.developerToken = data.token;

        // Set up token refresh
        const refreshTime = (data.expires_at - Date.now() / 1000 - 300) * 1000;
        if (refreshTime > 0) {
          setTimeout(() => { if (!this.destroyed) this.initialize(); }, refreshTime);
        }
      } catch (error) {
        console.error('[AppleMusicProvider] Failed to fetch developer token:', error);
        this._isInitializing = false;
        this.emit();
        return;
      }

      // Clear MusicKit browser-persisted state
      this.playerReadyRef = false;
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.includes('media-user-token')) return;
          if (key.startsWith('music.') || key.startsWith('mk-')) {
            localStorage.removeItem(key);
          }
        });
        const dbs = await (indexedDB.databases?.() ?? Promise.resolve([]));
        for (const db of dbs) {
          if (db.name && (db.name.includes('music') || db.name.includes('MusicKit'))) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      } catch (_) { /* storage access may be restricted */ }

      const mk = await window.MusicKit.configure({
        developerToken: this.developerToken!,
        app: { name: 'Playhead', build: '1.0.0' }
      } as any) as MusicKitInstance;
      this.musicKit = mk;

      // Stop any auto-restored playback
      try { mk.stop(); } catch (_) { /* ignore */ }

      // Restore auth from server-side token
      if (this.config.storedMusicUserToken && !mk.isAuthorized) {
        (mk as any).musicUserToken = this.config.storedMusicUserToken;
      }

      this._isAuthorized = mk.isAuthorized;
      this._storefrontId = mk.storefrontId || 'us';

      // Register events
      this.registerEvents(mk);
    } catch (err) {
      console.error('[AppleMusicProvider] Error initializing:', err);
    } finally {
      this._isInitializing = false;
      this.emit();
    }
  }

  private on(mk: MusicKitInstance, event: string, handler: (...args: any[]) => void) {
    mk.addEventListener(event, handler);
    this.eventListeners.push([event, handler]);
  }

  private registerEvents(mk: MusicKitInstance) {
    // Auth
    this.on(mk, 'authorizationStatusDidChange', () => {
      const nowAuthorized = mk.isAuthorized;
      if (this._isAuthorized && !nowAuthorized) this.handleAuthLost();
      this._isAuthorized = nowAuthorized;
      this.emit();
    });

    // Media item change
    this.on(mk, 'nowPlayingItemDidChange', () => {
      if (!this.playerReadyRef) return;
      const item = mk.nowPlayingItem;
      if (item) {
        this.updateState({ currentTrack: this.formatMusicKitTrack(item) });
      }
    });

    // Playback state change
    this.on(mk, 'playbackStateDidChange', (e: any) => {
      if (!this.playerReadyRef) return;
      const state = e.state;
      const playing = state === 'playing' || state === 2;
      const paused = state === 'paused' || state === 3;

      if (playing || paused) {
        this.clearTransition();
        const currentTrack = mk.nowPlayingItem
          ? this.formatMusicKitTrack(mk.nowPlayingItem)
          : this._playbackState.currentTrack;
        this.updateState({
          isPlaying: playing,
          isTransitioning: false,
          currentTrack,
        });
        if (playing && mk.nowPlayingItem) {
          this.lastPlayingTrackId = mk.nowPlayingItem.id;
        }
      }

      // Auto-advance on track end
      const ended = state === 'completed' || state === 10 || state === 'ended' || state === 5;
      if (ended && !this.isAdvancing && this.onTrackEnded) {
        this.onTrackEnded();
      }
    });

    // Playback time
    this.on(mk, 'playbackTimeDidChange', (e: any) => {
      if (!this.playerReadyRef) return;
      if (this.isRestoringRef) return;
      if (e.currentPlaybackTime === 0 && Date.now() - this.restoreFinishedAt < 2000) return;
      this.updateState({
        playbackTime: { current: e.currentPlaybackTime, total: e.currentPlaybackDuration },
      });
    });
  }

  private formatMusicKitTrack(item: any): UnifiedTrack {
    const attr = item.attributes || item;
    return {
      id: item.id || '',
      name: attr.name || attr.title || 'Unknown',
      artist: attr.artistName || 'Unknown',
      album: attr.albumName || '',
      artworkUrl: (attr.artwork?.url || item.artworkURL || '').replace('{w}', '300').replace('{h}', '300'),
      durationSeconds: attr.durationInMillis ? attr.durationInMillis / 1000 : (item.duration || 0),
      provider: 'apple-music' as const,
    };
  }

  private handleAuthLost() {
    this._isAuthorized = false;
    this.emit();
    toast.error('Your Apple Music session expired', {
      description: 'Please reconnect to continue playing music',
      action: {
        label: 'Reconnect',
        onClick: () => this.login()
      },
      duration: Infinity
    });
  }

  private startTransition() {
    this.updateState({ isTransitioning: true });
    if (this.transitionTimeout) clearTimeout(this.transitionTimeout);
    this.transitionTimeout = setTimeout(() => {
      this.updateState({ isTransitioning: false });
    }, 5000);
  }

  private clearTransition() {
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
      this.transitionTimeout = null;
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────
  async login(): Promise<void> {
    if (!this.musicKit) {
      toast.error('Apple Music is not ready', {
        description: 'MusicKit failed to initialize. Please refresh the page and try again.'
      });
      return;
    }

    const w = 600, h = 700;
    const left = (window.screen.width - w) / 2;
    const top = (window.screen.height - h) / 2;
    const originalOpen = window.open;

    window.open = ((url: string | URL, target?: string) => {
      return originalOpen(url, target, `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=yes`);
    }) as typeof window.open;

    try {
      await this.musicKit.authorize();
      this._isAuthorized = this.musicKit.isAuthorized;
      this._storefrontId = this.musicKit.storefrontId || 'us';
      this.emit();
    } finally {
      window.open = originalOpen;
    }
  }

  async logout(): Promise<void> {
    if (this.musicKit) await this.musicKit.unauthorize();
    this._isAuthorized = false;
    this.emit();
  }

  // ── Playback ────────────────────────────────────────────────────
  async play(trackId?: string, startTime?: number): Promise<void> {
    if (!this.musicKit || this.playbackLock) return;
    this.playbackLock = true;
    this.startTransition();
    try {
      this.playerReadyRef = true;

      if (trackId) {
        // Play a specific track
        this.pendingQueue = null;
        await this.musicKit.setQueue({ song: trackId, startPlaying: true, startTime } as any);
      } else if (this.pendingQueue) {
        // Flush pending queue
        await this.flushPendingQueue();
      } else {
        await this.musicKit.play();
      }
      this.updateState({ isPlaying: true });
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        this.handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    } finally {
      this.playbackLock = false;
    }
  }

  async pause(): Promise<void> {
    if (!this.musicKit || this.playbackLock) return;
    this.playbackLock = true;
    this.startTransition();
    try {
      await this.musicKit.pause();
      this.updateState({ isPlaying: false });
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        this.handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    } finally {
      this.playbackLock = false;
    }
  }

  async togglePlay(): Promise<void> {
    if (!this.musicKit || this.playbackLock) return;
    this.playbackLock = true;
    this.startTransition();
    try {
      const currentlyPlaying = this.musicKit.playbackState === 'playing' || (this.musicKit.playbackState as any) === 2;
      if (!currentlyPlaying && this.pendingQueue) {
        await this.flushPendingQueue();
        this.updateState({ isPlaying: true });
      } else if (currentlyPlaying) {
        await this.musicKit.pause();
        this.updateState({ isPlaying: false });
      } else {
        this.playerReadyRef = true;
        await this.musicKit.play();
        this.updateState({ isPlaying: true });
      }
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        this.handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    } finally {
      this.playbackLock = false;
    }
  }

  seekTo(seconds: number): void {
    if (!this.musicKit) return;
    try {
      this.musicKit.seekToTime(seconds);
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) {
        this.handleAuthLost();
      } else {
        showErrorToast(e, 'playback');
      }
    }
  }

  // ── Search ──────────────────────────────────────────────────────
  async search(query: string): Promise<UnifiedTrack[]> {
    if (!this.musicKit) return [];
    const storefront = this.musicKit.storefrontId || 'us';
    try {
      const response = await this.musicKit.api.music(`v1/catalog/${storefront}/search`, {
        term: query,
        types: 'songs',
        limit: 10
      }) as any;
      const songs = response.data?.results?.songs?.data || [];
      return songs.map((s: any) => this.formatMusicKitTrack(s));
    } catch (e) {
      console.error('[AppleMusicProvider] Search error:', e);
      return [];
    }
  }

  // ── Restore from backend state ──────────────────────────────────
  async restoreFromState(state: {
    current_track?: { id: string; name: string; artist: string; album?: string; artwork_url?: string; duration?: number } | null;
    is_playing?: boolean;
    playback_position?: number;
  }): Promise<void> {
    const { current_track, playback_position } = state;

    if (!current_track?.id) {
      this.playerReadyRef = true;
      return;
    }

    this.lastPlayingTrackId = current_track.id;
    const alreadyPlaying = this.musicKit?.nowPlayingItem?.id === current_track.id;

    if (!alreadyPlaying) {
      const startTime = (playback_position && playback_position > 0) ? playback_position : undefined;
      this.pendingQueue = { songId: current_track.id, startTime };
    }

    // Set React-visible state immediately
    this.updateState({
      currentTrack: {
        id: current_track.id,
        name: current_track.name,
        artist: current_track.artist,
        album: current_track.album || '',
        artworkUrl: current_track.artwork_url || '',
        durationSeconds: current_track.duration || 0,
        provider: 'apple-music',
      },
      isPlaying: false,
      playbackTime: alreadyPlaying
        ? this._playbackState.playbackTime
        : { current: playback_position || 0, total: current_track.duration || 0 },
    });

    this.playerReadyRef = true;
  }

  // ── Internal helpers ────────────────────────────────────────────
  private async flushPendingQueue() {
    const pending = this.pendingQueue;
    if (!pending || !this.musicKit || this.isFlushing) return;
    this.isFlushing = true;
    this.pendingQueue = null;
    this.isRestoringRef = true;
    try {
      this.playerReadyRef = true;
      await this.musicKit.setQueue({ song: pending.songId, startPlaying: true, startTime: pending.startTime } as any);
    } finally {
      this.isRestoringRef = false;
      this.restoreFinishedAt = Date.now();
      this.isFlushing = false;
    }
  }

  /** Get the MusicKit user token for backend persistence */
  getMusicUserToken(): string | null {
    return (this.musicKit as any)?.musicUserToken || null;
  }

  // ── Cleanup ─────────────────────────────────────────────────────
  destroy(): void {
    this.destroyed = true;
    this.playerReadyRef = false;
    this.clearTransition();
    if (this.musicKit) {
      try { this.musicKit.stop(); } catch (_) { /* ignore */ }
      for (const [event, handler] of this.eventListeners) {
        try { this.musicKit.removeEventListener(event, handler); } catch (_) { /* ignore */ }
      }
    }
    this.eventListeners = [];
    this.listeners = [];
  }
}
