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
const LRCLIB_TIMEOUT_MS = 10000;

interface LyricsResult {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  source: string;
}

interface LrclibRecord {
  name?: string;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
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

  console.log(`[lyrics] Fetching lyrics for: ${artistName} - ${trackName}`);

  // LRCLIB exact matching is sensitive to album metadata. Apple Music album
  // names often differ from LRCLIB, so start with artist + track only.
  const result = await fetchFromLrclibGet(artistName, trackName);

  if (result) {
    console.log(`[lyrics] Found lyrics from ${result.source}`);
    return Response.json(result);
  }

  const fallback = await fetchFromLrclibSearch(artistName, trackName, duration);
  if (fallback) {
    console.log(`[lyrics] Found lyrics from ${fallback.source}`);
    return Response.json(fallback);
  }

  console.log(`[lyrics] No lyrics found for: ${artistName} - ${trackName}`);
  return Response.json(
    { syncedLyrics: null, plainLyrics: null, source: "none" },
    { status: 404 }
  );
}

async function fetchFromLrclibGet(
  artistName: string,
  trackName: string
): Promise<LyricsResult | null> {
  const params = new URLSearchParams();
  params.set("artist_name", artistName);
  params.set("track_name", trackName);

  try {
    const res = await fetch(`${LRCLIB_BASE}/get?${params}`, {
      headers: { "User-Agent": "Playheads/1.0" },
      signal: AbortSignal.timeout(LRCLIB_TIMEOUT_MS),
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
    console.error(`[lyrics] LRCLIB get error: ${String(err)}`);
    return null;
  }
}

async function fetchFromLrclibSearch(
  artistName: string,
  trackName: string,
  duration: string
): Promise<LyricsResult | null> {
  const params = new URLSearchParams();
  params.set("artist_name", artistName);
  params.set("track_name", trackName);

  try {
    const res = await fetch(`${LRCLIB_BASE}/search?${params}`, {
      headers: { "User-Agent": "Playheads/1.0" },
      signal: AbortSignal.timeout(LRCLIB_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const records = (await res.json()) as LrclibRecord[];
    if (!Array.isArray(records) || records.length === 0) return null;

    const best = pickBestSearchResult(records, artistName, trackName, duration);
    if (!best || (!best.syncedLyrics && !best.plainLyrics)) return null;

    return {
      syncedLyrics: best.syncedLyrics ?? null,
      plainLyrics: best.plainLyrics ?? null,
      source: "lrclib-search",
    };
  } catch (err) {
    console.error(`[lyrics] LRCLIB search error: ${String(err)}`);
    return null;
  }
}

function pickBestSearchResult(
  records: LrclibRecord[],
  artistName: string,
  trackName: string,
  duration: string
): LrclibRecord | null {
  const wantedArtist = normalize(artistName);
  const wantedTrack = normalize(trackName);
  const wantedDuration = Number(duration);

  return records
    .filter((record) => record.syncedLyrics || record.plainLyrics)
    .sort((a, b) => scoreRecord(b, wantedArtist, wantedTrack, wantedDuration) - scoreRecord(a, wantedArtist, wantedTrack, wantedDuration))[0] ?? null;
}

function scoreRecord(
  record: LrclibRecord,
  wantedArtist: string,
  wantedTrack: string,
  wantedDuration: number
): number {
  let score = 0;
  const recordArtist = normalize(record.artistName ?? "");
  const recordTrack = normalize(record.trackName ?? record.name ?? "");

  if (recordTrack === wantedTrack) score += 50;
  else if (recordTrack.includes(wantedTrack) || wantedTrack.includes(recordTrack)) score += 20;

  if (recordArtist === wantedArtist) score += 30;
  else if (recordArtist.includes(wantedArtist) || wantedArtist.includes(recordArtist)) score += 10;

  if (record.syncedLyrics) score += 5;

  if (Number.isFinite(wantedDuration) && wantedDuration > 0 && typeof record.duration === "number") {
    score += Math.max(0, 10 - Math.abs(record.duration - wantedDuration));
  }

  return score;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
