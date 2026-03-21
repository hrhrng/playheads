/** A single timestamped lyric line */
export interface LyricLine {
  time: number;   // seconds (e.g. 63.45)
  text: string;   // lyric text for this line
}

/** Lyrics fetch state */
export type LyricsStatus = 'idle' | 'loading' | 'synced' | 'plain' | 'not-found' | 'error';

/** Full lyrics state returned by useLyrics */
export interface LyricsState {
  status: LyricsStatus;
  lines: LyricLine[];        // parsed synced lines (empty if plain-only)
  plainText: string | null;   // fallback plain lyrics
  currentIndex: number;       // index of the currently active line (-1 if none)
}
