import type { LyricLine } from '../types/lyrics';

const LRC_LINE_RE = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)/;

/**
 * Parse an LRC-format string into an array of timestamped lyric lines.
 * Lines are sorted by time ascending. Empty-text lines are kept as
 * instrumental gaps.
 */
export function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const raw of lrc.split('\n')) {
    const m = raw.match(LRC_LINE_RE);
    if (!m) continue;

    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    // Handle both 2-digit (centiseconds) and 3-digit (milliseconds) fractions
    const frac = m[3].length === 2
      ? parseInt(m[3], 10) / 100
      : parseInt(m[3], 10) / 1000;

    lines.push({
      time: mins * 60 + secs + frac,
      text: m[4].trim(),
    });
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}
