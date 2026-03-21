/**
 * TTML (Timed Text Markup Language) parser for Apple Music lyrics.
 *
 * Parses the TTML XML returned by the Apple Music lyrics API
 * into a flat array of timed lyric lines.
 *
 * @module utils/ttmlParser
 */

export interface LyricLine {
  /** Start time in seconds */
  time: number;
  /** End time in seconds (if available) */
  endTime?: number;
  /** Lyric text */
  text: string;
}

/**
 * Parse a TTML timestamp string (e.g. "00:01:23.456") to seconds.
 */
function parseTimestamp(ts: string): number {
  // Handle formats: "HH:MM:SS.mmm", "MM:SS.mmm", "SS.mmm"
  const parts = ts.split(':');
  let seconds = 0;

  if (parts.length === 3) {
    seconds += parseFloat(parts[0]) * 3600;
    seconds += parseFloat(parts[1]) * 60;
    seconds += parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds += parseFloat(parts[0]) * 60;
    seconds += parseFloat(parts[1]);
  } else {
    seconds = parseFloat(parts[0]);
  }

  return isNaN(seconds) ? 0 : seconds;
}

/**
 * Parse TTML XML string into LyricLine array.
 *
 * Apple Music returns lyrics in TTML format with <p> elements
 * containing begin/end attributes and lyric text.
 */
export function parseTTML(ttmlString: string): LyricLine[] {
  const lines: LyricLine[] = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(ttmlString, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.warn('[ttmlParser] Failed to parse TTML XML');
      return [];
    }

    // Apple Music TTML uses <p> elements within <div> elements in <body>
    // Each <p> has begin and optionally end attributes
    const paragraphs = doc.querySelectorAll('p[begin]');

    paragraphs.forEach((p) => {
      const begin = p.getAttribute('begin');
      const end = p.getAttribute('end');
      // Get text content, stripping any nested span elements
      const text = (p.textContent || '').trim();

      if (begin && text) {
        lines.push({
          time: parseTimestamp(begin),
          endTime: end ? parseTimestamp(end) : undefined,
          text,
        });
      }
    });

    // Sort by time (should already be sorted, but just in case)
    lines.sort((a, b) => a.time - b.time);
  } catch (err) {
    console.warn('[ttmlParser] Error parsing TTML:', err);
  }

  return lines;
}

/**
 * Find the index of the current lyric line given playback time.
 * Uses binary search for efficiency.
 *
 * Returns -1 if no line is active (before the first lyric).
 */
export function findCurrentLineIndex(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0) return -1;

  let low = 0;
  let high = lyrics.length - 1;

  // If before first line
  if (currentTime < lyrics[0].time) return -1;

  // Binary search for the last line whose start time <= currentTime
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lyrics[mid].time <= currentTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return high;
}
