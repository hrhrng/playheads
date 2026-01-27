/**
 * Apple Music hook types
 */

/**
 * Track information from Apple Music
 */
export interface Track {
  id: string;
  attributes?: TrackAttributes;
}

export interface TrackAttributes {
  name: string;
  title?: string;
  artistName: string;
  albumName: string;
  durationInMillis: number;
  artwork?: Artwork;
  playParams?: PlayParams;
}

export interface Artwork {
  url: string;
  width?: number;
  height?: number;
}

export interface PlayParams {
  id: string;
  kind?: string;
}

/**
 * Formatted track for backend sync
 */
export interface FormattedTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  artwork_url: string;
  duration: number;
}

/**
 * Playback time state
 */
export interface PlaybackTime {
  current: number;
  total: number;
}

/**
 * Agent action types for Apple Music
 */
export type AppleMusicAction =
  | `ACTION:PLAY_INDEX:${number}`
  | `ACTION:SEARCH_AND_ADD:${string}`
  | `ACTION:REMOVE_INDEX:${number}`;

/**
 * Music API search types
 */
export type MusicSearchType = 'songs' | 'albums' | 'artists' | 'playlists';

/**
 * Search result item
 */
export interface SearchResultItem {
  id: string;
  attributes?: TrackAttributes;
}

/**
 * Search response
 */
export interface SearchResponse {
  data: SearchResultItem[];
  results?: {
    songs?: {
      data: SearchResultItem[];
    };
  };
}
