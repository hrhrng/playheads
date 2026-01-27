/**
 * Spotify Web Playback SDK hook
 * @module hooks/useSpotifyPlayer
 */

import { useState, useEffect } from 'react';

interface SpotifyPlayer {
  connect: () => boolean;
  disconnect: () => boolean;
  addListener: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
  getCurrentState: () => Promise<SpotifyPlaybackState | null>;
  setName: (name: string) => void;
  setVolume: (volume: number) => void;
  resume: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
  activateElement: () => Promise<void>;
}

interface SpotifyPlaybackState {
  context: {
    uri: string;
    metadata: Record<string, unknown>;
  } | null;
  disallows: {
    pausing: boolean;
    peeking_next: boolean;
    peeking_prev: boolean;
    resuming: boolean;
    seeking: boolean;
    skipping_next: boolean;
    skipping_prev: boolean;
    toggling_play_context: boolean;
    toggling_play_device: boolean;
    toggling_play_shuffle: boolean;
    toggling_repeat_context: boolean;
    toggling_repeat_track: boolean;
  };
  duration: number;
  paused: boolean;
  position: number;
  repeat_mode: number;
  restrict_disallows: {
    pausing: boolean;
    peeking_next: boolean;
    peeking_prev: boolean;
    resuming: boolean;
    seeking: boolean;
    skipping_next: boolean;
    skipping_prev: boolean;
    toggling_play_context: boolean;
    toggling_play_device: boolean;
    toggling_play_shuffle: boolean;
    toggling_repeat_context: boolean;
    toggling_repeat_track: boolean;
  };
  shuffle: boolean;
  timestamp: number;
  track: {
    album: {
      images: Array<{
        height: number;
        url: string;
        width: number;
      }>;
      name: string;
      uri: string;
    };
    artists: Array<{
      name: string;
      uri: string;
    }>;
    duration: number;
    is_local: boolean;
    linked_from: {
      external_urls: {
        spotify: string;
      };
      href: string;
      id: string;
      type: string;
      uri: string;
    } | null;
    name: string;
    uri: string;
  } | null;
  uid: string;
}

interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
}

declare global {
  interface Window {
    Spotify: {
      Player: new (options: SpotifyPlayerOptions) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface UseSpotifyPlayerReturn {
  player: SpotifyPlayer | undefined;
  isPaused: boolean;
  isActive: boolean;
  currentTrack: SpotifyPlaybackState['track'] | null;
}

/**
 * Spotify Web Playback SDK hook
 * Initializes and manages Spotify player instance
 *
 * @param token - Spotify access token
 * @returns Spotify player state and methods
 */
export default function useSpotifyPlayer(token: string | null): UseSpotifyPlayerReturn {
  const [player, setPlayer] = useState<SpotifyPlayer | undefined>(undefined);
  const [isPaused, setPaused] = useState<boolean>(false);
  const [isActive, setActive] = useState<boolean>(false);
  const [currentTrack, setTrack] = useState<SpotifyPlaybackState['track'] | null>(null);

  useEffect(() => {
    if (!token) return;

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const spotifyPlayer = new window.Spotify.Player({
        name: 'Music Agent Player',
        getOAuthToken: cb => { cb(token); },
        volume: 0.5
      });

      spotifyPlayer.addListener('ready', (...args: unknown[]) => {
        const { device_id } = args[0] as { device_id: string };
        console.log('Ready with Device ID', device_id);
      });

      spotifyPlayer.addListener('not_ready', (...args: unknown[]) => {
        const { device_id } = args[0] as { device_id: string };
        console.log('Device ID has gone offline', device_id);
      });

      spotifyPlayer.addListener('player_state_changed', (...args: unknown[]) => {
        const state = args[0] as SpotifyPlaybackState | null;
        if (!state) {
          return;
        }

        setTrack(state.track);
        setPaused(state.paused);

        spotifyPlayer.getCurrentState().then(state => {
          (!state) ? setActive(false) : setActive(true);
        });
      });

      spotifyPlayer.connect();
      setPlayer(spotifyPlayer);
    };

    return () => {
      // Cleanup if needed
    };
  }, [token]);

  return { player, isPaused, isActive, currentTrack };
}
