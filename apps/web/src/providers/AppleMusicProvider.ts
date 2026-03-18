/**
 * Apple Music provider — wraps MusicKit JS.
 * Manages MusicKit native queue for real-time playback.
 * If the user switches provider, the queue is cleared externally.
 */

import { toast } from 'sonner';
import { classifyError, showErrorToast } from '../utils/errorHandling';
import { ErrorCategory } from '../types/errors';
import { API_BASE } from '../config/api';
import type { MusicKitInstance } from '../types/musicKit';
import type { MusicProvider, PlaybackState, UnifiedTrack, ProviderType } from './types';

type StateChangeCallback = (state: PlaybackState) => void;
type NowPlayingChangeCallback = (trackId: string | null) => void;
type UnresolvableIdsCallback = (badIds: Set<string>) => void;

interface AppleMusicProviderConfig {
  storedMusicUserToken?: string | null;
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
  private nowPlayingListeners: NowPlayingChangeCallback[] = [];
  private unresolvableListeners: UnresolvableIdsCallback[] = [];
  private eventListeners: Array<[string, (...args: any[]) => void]> = [];
  private config: AppleMusicProviderConfig;
  private destroyed = false;

  // MusicKit decoupling gate
  private playerReadyRef = false;
  private isRestoringRef = false;
  private restoreFinishedAt = 0;
  private pendingQueue: { songIds: string[]; startIndex: number; startTime?: number } | null = null;

  // Playback control
  private playbackLock = false;
  private lastPlayingTrackId: string | null = null;
  private transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private developerToken: string | null = null;

  // Storefront
  private _storefrontId = 'us';

  constructor(config: AppleMusicProviderConfig = {}) {
    this.config = config;
  }

  get isAuthorized(): boolean { return this._isAuthorized; }
  get isInitializing(): boolean { return this._isInitializing; }
  get playbackState(): PlaybackState { return this._playbackState; }
  get storefrontId(): string { return this._storefrontId; }

  // ── State emission ──────────────────────────────────────────────
  private emit() {
    if (this.destroyed) return;
    for (const cb of this.listeners) cb(this._playbackState);
  }

  private updateState(partial: Partial<PlaybackState>) {
    this._playbackState = { ...this._playbackState, ...partial };
    this.emit();
  }

  onStateChange(cb: StateChangeCallback): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  /** Subscribe to nowPlayingItem changes — usePlayQueue syncs queue from this. */
  onNowPlayingChange(cb: NowPlayingChangeCallback): () => void {
    this.nowPlayingListeners.push(cb);
    return () => { this.nowPlayingListeners = this.nowPlayingListeners.filter(l => l !== cb); };
  }

  /** Subscribe to unresolvable track IDs — usePlayQueue filters them out. */
  onUnresolvableIds(cb: UnresolvableIdsCallback): () => void {
    this.unresolvableListeners.push(cb);
    return () => { this.unresolvableListeners = this.unresolvableListeners.filter(l => l !== cb); };
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

      try {
        const response = await fetch(`${API_BASE}/apple-music/developer-token`);
        if (!response.ok) throw new Error(`Developer token request failed: ${response.status}`);
        const data = await response.json();
        this.developerToken = data.token;

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

      this.playerReadyRef = false;

      const mk = await window.MusicKit.configure({
        developerToken: this.developerToken!,
        app: { name: 'Playhead', build: '1.0.0' }
      } as any) as MusicKitInstance;
      this.musicKit = mk;

      // Stop playback on init so we start paused.
      try { mk.stop(); } catch (_) { /* ignore */ }

      if (this.config.storedMusicUserToken && !mk.isAuthorized) {
        (mk as any).musicUserToken = this.config.storedMusicUserToken;
      }

      this._isAuthorized = mk.isAuthorized;
      this._storefrontId = mk.storefrontId || 'us';
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
    this.on(mk, 'authorizationStatusDidChange', () => {
      const nowAuthorized = mk.isAuthorized;
      if (this._isAuthorized && !nowAuthorized) this.handleAuthLost();
      this._isAuthorized = nowAuthorized;
      this.emit();
    });

    this.on(mk, 'nowPlayingItemDidChange', () => {
      if (!this.playerReadyRef) return;
      const item = mk.nowPlayingItem;
      if (item) {
        this.lastPlayingTrackId = item.id;
        this.updateState({ currentTrack: this.formatMusicKitTrack(item) });
        for (const cb of this.nowPlayingListeners) cb(item.id);
      }
    });

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
        this.updateState({ isPlaying: playing, isTransitioning: false, currentTrack });
        if (playing && mk.nowPlayingItem) this.lastPlayingTrackId = mk.nowPlayingItem.id;
      }
    });

    this.on(mk, 'playbackTimeDidChange', (e: any) => {
      if (!this.playerReadyRef) return;
      if (this.isRestoringRef) return;
      if (e.currentPlaybackTime === 0 && Date.now() - this.restoreFinishedAt < 2000) return;
      this.updateState({
        playbackTime: { current: e.currentPlaybackTime, total: e.currentPlaybackDuration },
      });
    });
  }

  formatMusicKitTrack(item: any): UnifiedTrack {
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
      action: { label: 'Reconnect', onClick: () => this.login() },
      duration: Infinity
    });
  }

  private startTransition() {
    this.updateState({ isTransitioning: true });
    if (this.transitionTimeout) clearTimeout(this.transitionTimeout);
    this.transitionTimeout = setTimeout(() => { this.updateState({ isTransitioning: false }); }, 5000);
  }

  private clearTransition() {
    if (this.transitionTimeout) { clearTimeout(this.transitionTimeout); this.transitionTimeout = null; }
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

  // ── Playback — MusicKit native queue ────────────────────────────

  /** Set MusicKit queue to all song IDs and start playback at startIndex. */
  async playWithQueue(songIds: string[], startIndex: number, retried = false): Promise<void> {
    if (!this.musicKit || this.playbackLock || songIds.length === 0) return;
    this.playbackLock = true;
    this.startTransition();
    try {
      this.playerReadyRef = true;
      this.pendingQueue = null;
      await this.musicKit.setQueue({ songs: songIds, startPlaying: false } as any);
      await this.musicKit.changeToMediaAtIndex(startIndex);
      await this.musicKit.play();
      this.updateState({ isPlaying: true });
    } catch (e) {
      // Handle "could not be resolved" errors by filtering bad IDs and retrying
      const msg = String((e as any)?.message || e);
      const match = msg.match(/could not be resolved:\s*(.+)/i);
      if (match && !retried) {
        const badIds = new Set(match[1].split(/[,\s]+/).filter(Boolean));
        const filtered = songIds.filter(id => !badIds.has(id));
        // Notify React queue to remove bad tracks
        for (const cb of this.unresolvableListeners) cb(badIds);
        this.playbackLock = false;
        if (filtered.length > 0) {
          await this.playWithQueue(filtered, 0, true);
        }
        return;
      }
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    } finally {
      this.playbackLock = false;
    }
  }

  /** Append a song to the end of MusicKit's native queue. */
  async addToNativeQueue(songId: string): Promise<void> {
    if (!this.musicKit) return;
    try {
      await (this.musicKit as any).playLater({ songs: [songId] });
    } catch (e) {
      console.error('[AppleMusicProvider] playLater error:', e);
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
    }
  }

  /** Skip to next track in MusicKit native queue. */
  async skipToNext(): Promise<void> {
    if (!this.musicKit || this.playbackLock) return;
    this.playbackLock = true;
    this.startTransition();
    try {
      await this.musicKit.skipToNextItem();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    } finally {
      this.playbackLock = false;
    }
  }

  /** Skip to previous track in MusicKit native queue. */
  async skipToPrev(): Promise<void> {
    if (!this.musicKit || this.playbackLock) return;
    this.playbackLock = true;
    this.startTransition();
    try {
      await this.musicKit.skipToPreviousItem();
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    } finally {
      this.playbackLock = false;
    }
  }

  /** Resume or start playback (single track fallback / pending queue flush). */
  async play(trackId?: string, startTime?: number): Promise<void> {
    if (!this.musicKit || this.playbackLock) return;
    this.playbackLock = true;
    this.startTransition();
    try {
      this.playerReadyRef = true;
      if (trackId) {
        this.pendingQueue = null;
        await this.musicKit.setQueue({ song: trackId, startPlaying: true, startTime } as any);
      } else if (this.pendingQueue) {
        await this.flushPendingQueue();
      } else {
        await this.musicKit.play();
      }
      this.updateState({ isPlaying: true });
    } catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
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
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
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
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    } finally {
      this.playbackLock = false;
    }
  }

  seekTo(seconds: number): void {
    if (!this.musicKit) return;
    try { this.musicKit.seekToTime(seconds); }
    catch (e) {
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    }
  }

  // ── Search ──────────────────────────────────────────────────────
  async search(query: string): Promise<UnifiedTrack[]> {
    if (!this.musicKit) return [];
    const storefront = this.musicKit.storefrontId || 'us';
    try {
      const response = await this.musicKit.api.music(`v1/catalog/${storefront}/search`, {
        term: query, types: 'songs', limit: 10
      }) as any;
      const songs = response.data?.results?.songs?.data || [];
      return songs.map((s: any) => this.formatMusicKitTrack(s));
    } catch (e) {
      console.error('[AppleMusicProvider] Search error:', e);
      return [];
    }
  }

  /** Read MusicKit's current native queue as UnifiedTrack[]. */
  getNativeQueue(): UnifiedTrack[] {
    const items = this.musicKit?.queue?.items;
    if (!items?.length) return [];
    return items.map(item => this.formatMusicKitTrack(item));
  }

  // ── Restore from backend ────────────────────────────────────────
  /** Set the UI track display without starting playback. Stores full queue in pendingQueue. */
  restoreTrackDisplay(track: UnifiedTrack, allTracks: UnifiedTrack[], startIndex: number, playbackPosition = 0): void {
    this.lastPlayingTrackId = track.id;
    const alreadyPlaying = this.musicKit?.nowPlayingItem?.id === track.id;

    if (!alreadyPlaying && track.provider === 'apple-music') {
      const startTime = playbackPosition > 0 ? playbackPosition : undefined;
      this.pendingQueue = {
        songIds: allTracks.map(t => t.id),
        startIndex,
        startTime,
      };
    }

    this.updateState({
      currentTrack: track,
      isPlaying: false,
      playbackTime: alreadyPlaying
        ? this._playbackState.playbackTime
        : { current: playbackPosition, total: track.durationSeconds },
    });
    // Open the event gate so MusicKit events flow through after restore
    this.playerReadyRef = true;
  }

  // ── Internal ────────────────────────────────────────────────────
  private async flushPendingQueue() {
    const pending = this.pendingQueue;
    if (!pending || !this.musicKit || this.isFlushing) return;
    this.isFlushing = true;
    this.pendingQueue = null;
    this.isRestoringRef = true;
    try {
      this.playerReadyRef = true;
      await this.musicKit.setQueue({ songs: pending.songIds, startPlaying: false } as any);
      await this.musicKit.changeToMediaAtIndex(pending.startIndex);
      if (pending.startTime) {
        await this.musicKit.seekToTime(pending.startTime);
      }
      await this.musicKit.play();
    } catch (e) {
      // Handle unresolvable IDs during flush
      const msg = String((e as any)?.message || e);
      const match = msg.match(/could not be resolved:\s*(.+)/i);
      if (match) {
        const badIds = new Set(match[1].split(/[,\s]+/).filter(Boolean));
        for (const cb of this.unresolvableListeners) cb(badIds);
        const filtered = pending.songIds.filter(id => !badIds.has(id));
        if (filtered.length > 0) {
          this.isFlushing = false;
          this.isRestoringRef = false;
          this.restoreFinishedAt = Date.now();
          // Retry with filtered list — release lock first
          await this.playWithQueue(filtered, 0);
          return;
        }
      }
      console.error('[AppleMusicProvider] flushPendingQueue error:', e);
    } finally {
      this.isRestoringRef = false;
      this.restoreFinishedAt = Date.now();
      this.isFlushing = false;
    }
  }

  getMusicUserToken(): string | null {
    return (this.musicKit as any)?.musicUserToken || null;
  }

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
    this.nowPlayingListeners = [];
    this.unresolvableListeners = [];
  }
}
