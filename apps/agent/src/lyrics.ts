/**
 * Lyrics proxy handler.
 *
 * Proxies lyrics requests through the agent worker so the browser
 * doesn't need to hit third-party APIs directly (avoids CORS / GFW issues).
 *
 * Current source: LRCLIB (https://lrclib.net)
 * Easy to add fallback sources here later.
 */

const LRCLIB_BASE = "https://lrclib.net/api";

interface LyricsResult {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  source: string;
}

/**
 * GET /api/lyrics?artist_name=...&track_name=...&album_name=...&duration=...
 */
export async function handleLyrics(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const artistName = url.searchParams.get("artist_name") || "";
  const trackName = url.searchParams.get("track_name") || "";
  const albumName = url.searchParams.get("album_name") || "";
  const duration = url.searchParams.get("duration") || "";

  if (!trackName) {
    return Response.json(
      { error: "track_name is required" },
      { status: 400 }
    );
  }

  console.log(
    "[lyrics] Fetching lyrics for: %s - %s",
    artistName,
    trackName
  );

  // Try LRCLIB first (exact match)
  const result = await fetchFromLrclib(artistName, trackName, albumName, duration);

  if (result) {
    console.log("[lyrics] Found lyrics from %s", result.source);
    return Response.json(result);
  }

  // If exact match failed and we have album/duration, retry without them
  if (albumName || duration) {
    const fallback = await fetchFromLrclib(artistName, trackName, "", "");
    if (fallback) {
      console.log("[lyrics] Found lyrics from %s (relaxed match)", fallback.source);
      return Response.json(fallback);
    }
  }

  console.log("[lyrics] No lyrics found for: %s - %s", artistName, trackName);
  return Response.json(
    { syncedLyrics: null, plainLyrics: null, source: "none" },
    { status: 404 }
  );
}

async function fetchFromLrclib(
  artistName: string,
  trackName: string,
  albumName: string,
  duration: string
): Promise<LyricsResult | null> {
  const params = new URLSearchParams();
  params.set("artist_name", artistName);
  params.set("track_name", trackName);
  if (albumName) params.set("album_name", albumName);
  if (duration) params.set("duration", duration);

  try {
    const res = await fetch(`${LRCLIB_BASE}/get?${params}`, {
      headers: { "User-Agent": "Playheads/1.0" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      syncedLyrics?: string | null;
      plainLyrics?: string | null;
    };

    if (!data.syncedLyrics && !data.plainLyrics) return null;

    return {
      syncedLyrics: data.syncedLyrics ?? null,
      plainLyrics: data.plainLyrics ?? null,
      source: "lrclib",
    };
  } catch (err) {
    console.error("[lyrics] LRCLIB error: %s", String(err));
    return null;
  }
}
