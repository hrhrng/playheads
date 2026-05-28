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
type QueueChangeCallback = () => void;
type UnresolvableIdsCallback = (badIds: Set<string>) => void;
type Phase = 'init' | 'idle' | 'buffering' | 'playing' | 'paused';

// Passed to MusicKit.configure() on both init and token refresh — must
// stay identical so re-configuring only swaps the developer token and
// doesn't look like a different app to the singleton.
const APP_CONFIG = { name: 'Playhead', build: '1.0.0' } as const;
// Refresh the developer token this many seconds before it expires.
const TOKEN_REFRESH_SAFETY_SECONDS = 300;
// setTimeout delays above the 32-bit signed-int ms limit (~24.8 days)
// overflow and fire immediately. Clamp below that so a long-lived token
// can't wrap the timer into an instant re-fire loop.
const MAX_TIMEOUT_MS = 24 * 24 * 60 * 60 * 1000; // 24 days

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
  private queueChangeListeners: QueueChangeCallback[] = [];
  private unresolvableListeners: UnresolvableIdsCallback[] = [];
  private eventListeners: Array<[string, (...args: any[]) => void]> = [];
  private config: AppleMusicProviderConfig;
  private destroyed = false;

  // Phase state machine — replaces playerReadyRef + playbackLock + isTransitioning flag.
  // init     : MusicKit not yet ready; all playback events ignored.
  // idle     : Ready but no active playback (includes post-restore state).
  // buffering: play() called, waiting for playbackStateDidChange confirmation.
  // playing  : Active playback confirmed by MusicKit event.
  // paused   : Paused (optimistic on pause call, confirmed by event).
  private phase: Phase = 'init';

  // Serialize playLater calls so queueItemsDidChange fires with monotonically growing queue
  private mutationChain: Promise<void> = Promise.resolve();

  // Metadata cache: agent/search provides full metadata, MusicKit items often lack it
  private metadataCache = new Map<string, UnifiedTrack>();

  // Seek target stored during restore: seekToTime() requires nowPlayingItem (i.e. after play()).
  // BOUND TO A TRACK ID — otherwise a leftover target from restore would
  // leak into whatever track the user plays next (e.g. clicking Play all
  // on a topic before resuming the restored track would seek the topic's
  // first song to the restored position, which is nonsense).
  // Set by setQueueWithoutPlaying, applied by playbackStateDidChange when
  // the nowPlayingItem id matches, cleared by playbackTimeDidChange when
  // the seek lands. Setting a new currentTrack (different id) also clears.
  private seekTarget: { trackId: string; time: number } | null = null;
  private transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  private developerToken: string | null = null;
  // Developer-token lifecycle. tokenExp is the JWT's unix-seconds expiry
  // (0 = unknown). refreshTimer fires ~5 min before that; onVisibility
  // re-checks on tab foreground to cover background-throttled timers.
  private tokenExp = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private onVisibility: (() => void) | null = null;

  // Storefront
  private _storefrontId = 'us';

  constructor(config: AppleMusicProviderConfig = {}) {
    this.config = config;
  }

  get isAuthorized(): boolean { return this._isAuthorized; }
  get isInitializing(): boolean { return this._isInitializing; }
  get playbackState(): PlaybackState { return this._playbackState; }
  get storefrontId(): string { return this._storefrontId; }
  /** True when active playback has started (not in init/idle/restore). */
  get isPlayerReady(): boolean { return this.phase !== 'init' && this.phase !== 'idle'; }

  // ── State emission ──────────────────────────────────────────────
  private emit() {
    if (this.destroyed) return;
    for (const cb of this.listeners) cb(this._playbackState);
  }

  private updateState(partial: Partial<PlaybackState>) {
    this._playbackState = { ...this._playbackState, ...partial };
    this.emit();
  }

  /** Transition to a new phase and derive isPlaying/isTransitioning from it. */
  private setPhase(p: Phase, extra?: Partial<PlaybackState>) {
    this.phase = p;
    this.updateState({
      isPlaying: p === 'playing',
      isTransitioning: p === 'buffering',
      ...extra,
    });
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

  /** Subscribe to queue item changes — fired by MusicKit's queueItemsDidChange. */
  onQueueChange(cb: QueueChangeCallback): () => void {
    this.queueChangeListeners.push(cb);
    return () => { this.queueChangeListeners = this.queueChangeListeners.filter(l => l !== cb); };
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

      // First token fetch — abort init if it fails (no token → no playback).
      try {
        await this.fetchDeveloperToken();
      } catch (error) {
        console.error('[AppleMusicProvider] Failed to fetch developer token:', error);
        this._isInitializing = false;
        this.emit();
        return;
      }

      const mk = await window.MusicKit.configure({
        developerToken: this.developerToken!,
        app: APP_CONFIG,
      } as any) as MusicKitInstance;
      this.musicKit = mk;
      this._isAuthorized = mk.isAuthorized;
      this._storefrontId = mk.storefrontId || 'us';

      // Register events BEFORE setting musicUserToken so authorizationStatusDidChange is caught.
      // NOTE: only ever called once — token refresh must NOT re-run this, or
      // every listener would be duplicated.
      this.registerEvents(mk);

      // MusicKit v3 does not accept musicUserToken in configure() options.
      // Direct property assignment is the correct restoration method.
      if (this.config.storedMusicUserToken && !this._isAuthorized) {
        (mk as any).musicUserToken = this.config.storedMusicUserToken;
        this._isAuthorized = mk.isAuthorized;
      }

      // Keep the developer token fresh for marathon sessions. A timer fires
      // ~5 min before expiry; a visibilitychange handler re-checks when the
      // tab returns to the foreground (background tabs throttle setTimeout,
      // so the timer alone fires late — that gap was the MEDIA_LICENSE the
      // user hit after leaving the tab open past the 1-hour token TTL).
      this.scheduleTokenRefresh();
      this.registerVisibilityRefresh();
    } catch (err) {
      console.error('[AppleMusicProvider] Error initializing:', err);
    } finally {
      // Transition from 'init' to 'idle' — events will now be eligible to fire
      // once playback begins. Direct assignment avoids a redundant emit here.
      this.phase = 'idle';
      this._isInitializing = false;
      this.emit();
    }
  }

  // ── Developer token lifecycle ───────────────────────────────────

  /** Fetch a developer token from the backend; store it + its expiry. */
  private async fetchDeveloperToken(): Promise<void> {
    const response = await fetch(`${API_BASE}/apple-music/developer-token`);
    if (!response.ok) throw new Error(`Developer token request failed: ${response.status}`);
    const data = await response.json();
    this.developerToken = data.token;
    // expires_at is unix seconds from the backend; 0 if absent.
    this.tokenExp = typeof data.expires_at === 'number' ? data.expires_at : 0;
  }

  /**
   * (Re)arm the refresh timer to fire ~5 min before the current token
   * expires, clamped below setTimeout's 32-bit overflow point.
   */
  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
    if (!this.tokenExp) return; // unknown expiry — rely on visibility refresh
    const delay = Math.min(
      Math.max((this.tokenExp - Date.now() / 1000 - TOKEN_REFRESH_SAFETY_SECONDS) * 1000, 0),
      MAX_TIMEOUT_MS,
    );
    this.refreshTimer = setTimeout(() => {
      if (!this.destroyed) void this.refreshDeveloperToken();
    }, delay);
  }

  /**
   * Pull a fresh developer token and hand it to the live MusicKit
   * singleton WITHOUT re-running init (which would duplicate event
   * listeners and reset the playback phase). Both a direct property
   * write and the official re-configure are applied so the new token
   * reaches the media-license path regardless of MusicKit version;
   * re-configure keeps the same instance + app config, so the queue and
   * current playback are preserved.
   */
  private async refreshDeveloperToken(): Promise<void> {
    if (this.destroyed) return;
    try {
      await this.fetchDeveloperToken();
      if (this.developerToken) {
        if (this.musicKit) (this.musicKit as any).developerToken = this.developerToken;
        await window.MusicKit?.configure({
          developerToken: this.developerToken,
          app: APP_CONFIG,
        } as any);
      }
    } catch (e) {
      console.error('[AppleMusicProvider] token refresh failed:', e);
    } finally {
      this.scheduleTokenRefresh();
    }
  }

  /**
   * Refresh proactively when the tab returns to the foreground and the
   * token is within the safety window of expiry. Covers background tabs
   * whose refresh timer was throttled while hidden.
   */
  private registerVisibilityRefresh(): void {
    if (this.onVisibility || typeof document === 'undefined') return;
    this.onVisibility = () => {
      if (this.destroyed || document.visibilityState !== 'visible' || !this.tokenExp) return;
      const secsLeft = this.tokenExp - Date.now() / 1000;
      if (secsLeft < TOKEN_REFRESH_SAFETY_SECONDS) void this.refreshDeveloperToken();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /**
   * Set MusicKit queue without starting playback (for restore).
   * Returns true if MusicKit populated the queue, false otherwise —
   * callers can use this to protect saved state from being overwritten
   * (e.g. don't persist an empty queue over valid localStorage data).
   */
  async setQueueWithoutPlaying(songIds: string[], startTime?: number): Promise<boolean> {
    if (!this.musicKit || songIds.length === 0) return false;
    try {
      await this.musicKit.setQueue({ songs: songIds, startPlaying: false } as any);
      // After setQueue, MusicKit items have resolved metadata (durationInMillis).
      const firstItem = this.musicKit.queue?.items?.[0];
      if (firstItem) {
        const track = this.formatMusicKitTrack(firstItem); // merges + updates cache
        // Bind the saved playback position to this exact track id. If
        // the user switches to a different track before resuming (e.g.
        // Play all on a topic), the leftover target won't apply.
        if (startTime && startTime > 0) {
          this.seekTarget = { trackId: track.id, time: startTime };
        }
        this.updateState({
          currentTrack: track,
          playbackTime: { current: startTime || 0, total: track.durationSeconds },
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error('[AppleMusicProvider] setQueueWithoutPlaying error:', e);
      return false;
    }
  }

  private on(mk: MusicKitInstance, event: string, handler: (...args: any[]) => void) {
    mk.addEventListener(event, handler);
    this.eventListeners.push([event, handler]);
  }

  private registerEvents(mk: MusicKitInstance) {
    // Auth changes are always processed regardless of phase.
    this.on(mk, 'authorizationStatusDidChange', () => {
      const nowAuthorized = mk.isAuthorized;
      if (this._isAuthorized && !nowAuthorized) this.handleAuthLost();
      this._isAuthorized = nowAuthorized;
      this.emit();
    });

    // nowPlayingItemDidChange: only process during active playback phases.
    // Gating on idle/init prevents stale events from the restore setQueue() call
    // from clobbering the React queue state (which is the authoritative source).
    this.on(mk, 'nowPlayingItemDidChange', () => {
      if (this.phase === 'init' || this.phase === 'idle') return;
      const item = mk.nowPlayingItem;
      if (item) {
        const next = this.formatMusicKitTrack(item);
        // When the track id actually changes, reset playbackTime in the
        // same React update so the progress bar doesn't carry over the
        // previous track's position. MusicKit fires nowPlayingItemDidChange
        // and the first playbackTimeDidChange for the new track in separate
        // ticks; without this reset, the bar shows stale time/duration
        // (sometimes overflowing the new track's duration).
        const prevId = this._playbackState.currentTrack?.id;
        if (prevId !== next.id) {
          this.updateState({
            currentTrack: next,
            playbackTime: { current: 0, total: next.durationSeconds },
          });
        } else {
          this.updateState({ currentTrack: next });
        }
        for (const cb of this.nowPlayingListeners) cb(item.id);
      }
    });

    // playbackStateDidChange: drives phase transitions after buffering.
    // Ignored during init. During idle/paused/playing, confirms the new state.
    this.on(mk, 'playbackStateDidChange', (e: any) => {
      if (this.phase === 'init') return;
      const state = e.state;
      const playing = state === 'playing' || state === 2;
      const paused = state === 'paused' || state === 3;

      if (playing) {
        this.clearTransitionTimeout();
        const currentTrack = mk.nowPlayingItem
          ? this.formatMusicKitTrack(mk.nowPlayingItem)
          : this._playbackState.currentTrack;
        this.setPhase('playing', { currentTrack });
        // Apply pending restore seek now that playback is truly started.
        // Only honor the target if the nowPlayingItem id matches what
        // it was saved for — otherwise the user has navigated away from
        // the restored track and the saved position is meaningless.
        if (this.seekTarget !== null && currentTrack) {
          if (this.seekTarget.trackId === currentTrack.id) {
            try { this.musicKit?.seekToTime(this.seekTarget.time); } catch {}
          } else {
            // Stale target — drop it so its suppression doesn't affect
            // subsequent playbackTimeDidChange events.
            this.seekTarget = null;
          }
        }
      } else if (paused) {
        this.clearTransitionTimeout();
        this.setPhase('paused');
      }
    });

    // queueItemsDidChange: MusicKit queue is now the single source of truth.
    // Notify listeners so React re-reads the queue. Gate only during init.
    this.on(mk, 'queueItemsDidChange', () => {
      if (this.phase === 'init') return;
      for (const cb of this.queueChangeListeners) cb();
    });

    // playbackTimeDidChange: update progress bar during active playback.
    // Gated on active phases (not init/idle) so no events fire before first play.
    // seekTarget suppresses stale time≈0 events that arrive before seekToTime() lands.
    this.on(mk, 'playbackTimeDidChange', (e: any) => {
      if (this.phase === 'init' || this.phase === 'idle') return;
      if (this.seekTarget !== null) {
        // Only suppress if the target still belongs to the current track.
        const nowId = mk.nowPlayingItem?.id;
        if (nowId && this.seekTarget.trackId !== nowId) {
          this.seekTarget = null; // stale; let events flow normally
        }
      }
      if (this.seekTarget !== null) {
        // seekToTime() can fire events at time≈0 before the seek lands — suppress them.
        if (Math.abs(e.currentPlaybackTime - this.seekTarget.time) > 1) return;
        this.seekTarget = null; // Seek has landed; resume normal updates.
      }
      this.updateState({
        playbackTime: { current: e.currentPlaybackTime, total: e.currentPlaybackDuration },
      });
    });
  }

  formatMusicKitTrack(item: any): UnifiedTrack {
    const attr = item.attributes || item;
    const mkDuration = attr.durationInMillis ? attr.durationInMillis / 1000 : (item.duration || 0);
    const mkTrack: UnifiedTrack = {
      id: item.id || '',
      name: attr.name || attr.title || 'Unknown',
      artist: attr.artistName || 'Unknown',
      album: attr.albumName || '',
      artworkUrl: attr.artwork?.url || item.artworkURL || '',
      durationSeconds: mkDuration,
      provider: 'apple-music' as const,
    };

    // Merge with cached metadata: cache has richer info (from agent/search)
    // but MusicKit has authoritative duration
    const cached = this.metadataCache.get(item.id);
    if (cached) {
      const merged = {
        ...cached,
        durationSeconds: cached.durationSeconds || mkDuration,
        // Prefer MusicKit's template URL ({w}x{h}) over cached fixed-size URL
        artworkUrl: mkTrack.artworkUrl || cached.artworkUrl,
      };
      // Update cache so localStorage saves correct duration
      this.metadataCache.set(item.id, merged);
      return merged;
    }

    return mkTrack;
  }

  /** Cache full track metadata so formatMusicKitTrack can return rich data. */
  cacheTrackMetadata(track: UnifiedTrack): void {
    this.metadataCache.set(track.id, track);
  }

  /** Read MusicKit queue state: all items + current position. */
  getQueueSnapshot(): { items: UnifiedTrack[]; position: number } {
    if (!this.musicKit) return { items: [], position: -1 };
    const q = this.musicKit.queue;
    const position = (q as any).position ?? 0;
    const items = q.items.map((item: any) => this.formatMusicKitTrack(item));
    return { items, position };
  }

  /** Jump to a track by absolute index in MusicKit queue (no queue rebuild). */
  async changeToIndex(index: number): Promise<void> {
    if (!this.musicKit || this.phase === 'buffering') return;
    const prevPhase = this.phase;
    this.setPhase('buffering');
    this.startTransitionTimeout();
    try {
      await this.musicKit.changeToMediaAtIndex(index);
      if ((this.musicKit as any).playbackState !== 2) {
        await this.musicKit.play();
      }
    } catch (e) {
      this.setPhase(prevPhase);
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    }
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

  /**
   * Start a safety-net timer: if playbackStateDidChange never confirms playback
   * within `ms` milliseconds, force-exit the buffering phase to avoid a stuck UI.
   */
  private startTransitionTimeout(ms = 3000) {
    this.clearTransitionTimeout();
    this.transitionTimeout = setTimeout(() => {
      if (this.phase === 'buffering') {
        console.warn('[AppleMusicProvider] Buffering timeout — forcing playing phase');
        this.setPhase('playing');
      }
    }, ms);
  }

  private clearTransitionTimeout() {
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
    if (!this.musicKit || this.phase === 'buffering' || songIds.length === 0) return;
    this.setPhase('buffering');
    this.startTransitionTimeout();
    try {
      await this.musicKit.setQueue({ songs: songIds, startPlaying: false } as any);
      await this.musicKit.changeToMediaAtIndex(startIndex);
      // changeToMediaAtIndex auto-starts playback on some MusicKit versions (playbackState === 2);
      // only call play() if not already playing to avoid the "called without stop/pause" error.
      if ((this.musicKit as any).playbackState !== 2) {
        await this.musicKit.play();
      }
      // Phase transitions to 'playing' via playbackStateDidChange event.
    } catch (e) {
      // Handle "could not be resolved" errors by filtering bad IDs and retrying
      const msg = String((e as any)?.message || e);
      const match = msg.match(/could not be resolved:\s*(.+)/i);
      if (match && !retried) {
        const badIds = new Set(match[1].split(/[,\s]+/).filter(Boolean));
        const filtered = songIds.filter(id => !badIds.has(id));
        // Notify React queue to remove bad tracks
        for (const cb of this.unresolvableListeners) cb(badIds);
        this.setPhase('idle');
        if (filtered.length > 0) {
          await this.playWithQueue(filtered, 0, true);
        }
        return;
      }
      this.setPhase('idle');
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    }
  }

  /** Append a song to the end of MusicKit's native queue (serialized). */
  async addToNativeQueue(songId: string): Promise<void> {
    this.mutationChain = this.mutationChain.then(async () => {
      if (!this.musicKit) return;
      try {
        await (this.musicKit as any).playLater({ songs: [songId] });
      } catch (e) {
        console.error('[AppleMusicProvider] addToNativeQueue error:', e);
        const classified = classifyError(e);
        if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      }
    });
    return this.mutationChain;
  }

  /** Batch add multiple songs to the END of the queue (playLater). */
  async addManyToNativeQueue(songIds: string[]): Promise<void> {
    if (songIds.length === 0) return;
    this.mutationChain = this.mutationChain.then(async () => {
      if (!this.musicKit) return;
      try {
        await (this.musicKit as any).playLater({ songs: songIds });
      } catch (e) {
        console.error('[AppleMusicProvider] addManyToNativeQueue error:', e);
        const classified = classifyError(e);
        if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      }
    });
    return this.mutationChain;
  }

  /** Batch insert songs right after current track (playNext = head of queue). */
  async insertNextInQueue(songIds: string[]): Promise<void> {
    if (songIds.length === 0) return;
    this.mutationChain = this.mutationChain.then(async () => {
      if (!this.musicKit) return;
      try {
        await (this.musicKit as any).playNext({ songs: songIds });
      } catch (e) {
        console.error('[AppleMusicProvider] insertNextInQueue error:', e);
        const classified = classifyError(e);
        if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      }
    });
    return this.mutationChain;
  }

  /** Read MusicKit's native queue from current position onward. */
  getNativeQueue(): UnifiedTrack[] {
    if (!this.musicKit) return [];
    const q = this.musicKit.queue;
    const pos = (q as any).position ?? 0;
    return q.items.slice(pos).map(item => this.formatMusicKitTrack(item));
  }

  /** Set display track without starting playback (for first-track-added UX or restore). */
  setDisplayTrack(track: UnifiedTrack, currentTime = 0): void {
    this.updateState({
      currentTrack: track,
      isPlaying: false,
      playbackTime: { current: currentTime, total: track.durationSeconds },
    });
  }

  /** Remove a track from MusicKit's native queue by relative index. */
  async removeFromQueue(relativeIndex: number): Promise<void> {
    if (!this.musicKit) return;
    try {
      const pos = (this.musicKit.queue as any).position ?? 0;
      await this.musicKit.queue.remove(pos + relativeIndex);
    } catch (e) {
      console.error('[AppleMusicProvider] removeFromQueue error:', e);
    }
  }

  /** Skip to next track in MusicKit native queue. */
  async skipToNext(): Promise<void> {
    if (!this.musicKit || this.phase === 'buffering') return;
    const prevPhase = this.phase;
    this.setPhase('buffering');
    this.startTransitionTimeout();
    try {
      await this.musicKit.skipToNextItem();
    } catch (e) {
      this.setPhase(prevPhase);
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    }
  }

  /** Skip to previous track in MusicKit native queue. */
  async skipToPrev(): Promise<void> {
    if (!this.musicKit || this.phase === 'buffering') return;
    const prevPhase = this.phase;
    this.setPhase('buffering');
    this.startTransitionTimeout();
    try {
      await this.musicKit.skipToPreviousItem();
    } catch (e) {
      this.setPhase(prevPhase);
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    }
  }

  /** Resume or start playback. */
  async play(trackId?: string, startTime?: number): Promise<void> {
    if (!this.musicKit || this.phase === 'buffering' || this.phase === 'playing') return;
    const prevPhase = this.phase;
    this.setPhase('buffering');
    this.startTransitionTimeout();
    try {
      if (trackId) {
        // startTime is passed directly to setQueue — MusicKit handles seek atomically.
        await this.musicKit.setQueue({ song: trackId, startPlaying: true, startTime } as any);
      } else {
        await this.musicKit.play();
        // Restore seek applied by playbackStateDidChange — see togglePlay().
      }
      // Phase transitions to 'playing' via playbackStateDidChange event.
    } catch (e) {
      this.setPhase(prevPhase);
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    }
  }

  async pause(): Promise<void> {
    if (!this.musicKit || this.phase !== 'playing') return;
    this.setPhase('paused'); // Optimistic — confirmed by playbackStateDidChange.
    try {
      await this.musicKit.pause();
    } catch (e) {
      this.setPhase('playing'); // Revert on failure.
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    }
  }

  async togglePlay(): Promise<void> {
    if (!this.musicKit || this.phase === 'buffering') return;
    const prevPhase = this.phase;
    try {
      if (this.phase === 'playing') {
        this.setPhase('paused'); // Optimistic pause.
        await this.musicKit.pause();
      } else {
        this.setPhase('buffering');
        this.startTransitionTimeout();
        await this.musicKit.play();
        // Restore seek is applied by playbackStateDidChange when state
        // flips to 'playing' — that's the earliest moment nowPlayingItem
        // is guaranteed to be attached. Doing seekToTime() right after
        // await play() races: play() can resolve before MusicKit has
        // actually started, leaving seekToTime() a silent no-op.
      }
    } catch (e) {
      this.setPhase(prevPhase); // Revert on failure.
      const classified = classifyError(e);
      if (classified.category === ErrorCategory.AUTH_EXPIRED) this.handleAuthLost();
      else showErrorToast(e, 'playback');
    }
  }

  seekTo(seconds: number): void {
    if (!this.musicKit) return;
    // Keep seekTarget set so playbackTimeDidChange events fired during
    // seekToTime() are suppressed until time converges. Bound to the
    // current track id so a track-swap mid-seek can't apply this.
    const trackId = this._playbackState.currentTrack?.id;
    this.seekTarget = trackId ? { trackId, time: seconds } : null;
    // Update UI immediately (optimistic) so the slider position sticks.
    this.updateState({
      playbackTime: { current: seconds, total: this._playbackState.playbackTime?.total ?? 0 },
    });
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

  getMusicUserToken(): string | null {
    return (this.musicKit as any)?.musicUserToken || null;
  }

  destroy(): void {
    this.destroyed = true;
    this.phase = 'init';
    this.clearTransitionTimeout();
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
    if (this.onVisibility && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.onVisibility = null;
    }
    if (this.musicKit) {
      try { this.musicKit.stop(); } catch (_) { /* ignore */ }
      for (const [event, handler] of this.eventListeners) {
        try { this.musicKit.removeEventListener(event, handler); } catch (_) { /* ignore */ }
      }
    }
    this.eventListeners = [];
    this.listeners = [];
    this.nowPlayingListeners = [];
    this.queueChangeListeners = [];
    this.unresolvableListeners = [];
  }
}
