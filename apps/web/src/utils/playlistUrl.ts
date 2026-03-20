/**
 * Lightweight music platform URL detection for UI chip display.
 * All actual parsing and data fetching is handled by the backend.
 */

const PLATFORM_PATTERNS: Array<{
  regex: RegExp;
  platform: string;
  displayName: string;
}> = [
  { regex: /music\.apple\.com/i, platform: "apple_music", displayName: "Apple Music" },
  { regex: /open\.spotify\.com\/playlist/i, platform: "spotify", displayName: "Spotify" },
  { regex: /music\.163\.com/i, platform: "netease", displayName: "网易云音乐" },
  { regex: /y\.qq\.com/i, platform: "qqmusic", displayName: "QQ音乐" },
  { regex: /qishui\.douyin\.com/i, platform: "resso", displayName: "汽水音乐" },
];

export interface DetectedPlaylistUrl {
  /** The full URL extracted from text */
  url: string;
  /** Platform identifier */
  platform: string;
  /** Human-readable platform name */
  displayName: string;
}

/**
 * Detect a music platform playlist URL in free text.
 * Returns the first match found, or null.
 */
export function detectPlaylistUrl(text: string): DetectedPlaylistUrl | null {
  // Extract first URL-like string from text
  const urlMatch = text.match(/https?:\/\/\S+/);
  if (!urlMatch) return null;

  const url = urlMatch[0];
  for (const { regex, platform, displayName } of PLATFORM_PATTERNS) {
    if (regex.test(url)) {
      return { url, platform, displayName };
    }
  }

  return null;
}

/** Color/style map for platform dots. */
export const PLATFORM_COLORS: Record<string, string> = {
  apple_music: "bg-gradient-to-br from-pink-500 to-red-500",
  spotify: "bg-[#1DB954]",
  netease: "bg-red-500",
  qqmusic: "bg-[#31c27c]",
  resso: "bg-purple-500",
};
