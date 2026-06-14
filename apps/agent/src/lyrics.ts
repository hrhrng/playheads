/**
 * Lyrics proxy handler.
 *
 * Proxies lyrics requests through the agent worker so the browser does not
 * need to hit third-party or private Apple Music endpoints directly.
 */

import type { Env } from "./types";

const LRCLIB_BASE = "https://lrclib.net/api";
const LRCLIB_TIMEOUT_MS = 10000;
const APPLE_MUSIC_AMP_BASE = "https://amp-api.music.apple.com";
const APPLE_MUSIC_WEB_BASE = "https://music.apple.com";
const APPLE_TIMEOUT_MS = 8000;
const APPLE_WEB_TOKEN_TIMEOUT_MS = 5000;

type LyricsSourceMode = "apple-first" | "lrclib-first" | "off";

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

interface AppleLyricsContext {
  trackId: string;
  storefront: string;
  userToken: string;
}

let appleWebTokenCache: { token: string; exp: number } | null = null;

/**
 * GET /api/lyrics?track_id=...&storefront=...&user_id=...
 *             &artist_name=...&track_name=...&album_name=...&duration=...
 */
export async function handleLyrics(
  request: Request,
  env?: Env
): Promise<Response> {
  const url = new URL(request.url);

  const artistName = url.searchParams.get("artist_name") || "";
  const trackName = url.searchParams.get("track_name") || "";
  const duration = url.searchParams.get("duration") || "";
  const trackId = url.searchParams.get("track_id") || "";
  const storefront = url.searchParams.get("storefront") || "us";
  const userId = url.searchParams.get("user_id") || "";

  if (!trackName && !trackId) {
    return Response.json(
      { error: "track_name or track_id is required" },
      { status: 400 }
    );
  }

  const label = trackName || trackId;
  console.log(`[lyrics] Fetching lyrics for: ${artistName} - ${label}`);

  const sourceMode = getLyricsSourceMode(env);
  const appleContext = await getAppleLyricsContext(
    request,
    env,
    trackId,
    storefront,
    userId
  );

  if (sourceMode === "apple-first") {
    const apple = await fetchFromAppleMusic(appleContext, env);
    if (apple) {
      console.log(`[lyrics] Found lyrics from ${apple.source}`);
      return Response.json(apple);
    }
  }

  const lrclib = await fetchFromLrclib(artistName, trackName, duration);
  if (lrclib) {
    console.log(`[lyrics] Found lyrics from ${lrclib.source}`);
    return Response.json(lrclib);
  }

  if (sourceMode === "lrclib-first") {
    const apple = await fetchFromAppleMusic(appleContext, env);
    if (apple) {
      console.log(`[lyrics] Found lyrics from ${apple.source}`);
      return Response.json(apple);
    }
  }

  console.log(`[lyrics] No lyrics found for: ${artistName} - ${label}`);
  return Response.json(
    { syncedLyrics: null, plainLyrics: null, source: "none" },
    { status: 404 }
  );
}

function getLyricsSourceMode(env?: Env): LyricsSourceMode {
  const raw = (env?.APPLE_LYRICS_SOURCE || "apple-first").toLowerCase();
  if (raw === "lrclib-first") return "lrclib-first";
  if (raw === "off" || raw === "lrclib-only") return "off";
  return "apple-first";
}

async function getAppleLyricsContext(
  request: Request,
  env: Env | undefined,
  trackId: string,
  storefront: string,
  userId: string
): Promise<AppleLyricsContext | null> {
  if (!trackId) return null;

  const headerToken =
    request.headers.get("Media-User-Token") ||
    request.headers.get("Music-User-Token");
  if (headerToken) {
    return { trackId, storefront, userToken: headerToken };
  }

  if (!env?.DB || !userId) return null;

  try {
    const row = await env.DB.prepare(
      'SELECT "appleMusicToken" FROM "profile" WHERE "id" = ?'
    )
      .bind(userId)
      .first<{ appleMusicToken?: string | null }>();

    if (!row?.appleMusicToken) return null;
    return { trackId, storefront, userToken: row.appleMusicToken };
  } catch (err) {
    console.error(`[lyrics] Apple Music token lookup error: ${String(err)}`);
    return null;
  }
}

async function fetchFromAppleMusic(
  context: AppleLyricsContext | null,
  env?: Env
): Promise<LyricsResult | null> {
  if (!context) return null;

  const bearer = await getAppleMusicWebToken(env);
  if (!bearer) return null;

  const direct = await fetchAppleLyricsEndpoint(context, bearer);
  if (direct) return direct;

  return fetchAppleCatalogRelationships(context, bearer);
}

async function fetchAppleLyricsEndpoint(
  context: AppleLyricsContext,
  bearer: string
): Promise<LyricsResult | null> {
  const url = `${APPLE_MUSIC_AMP_BASE}/v1/catalog/${encodeURIComponent(
    context.storefront
  )}/songs/${encodeURIComponent(context.trackId)}/syllable-lyrics`;

  try {
    const res = await fetch(url, {
      headers: applePrivateHeaders(bearer, context.userToken),
      signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(
        `[lyrics] Apple syllable-lyrics returned ${res.status} for ${context.trackId}`
      );
      return null;
    }

    const data = await res.json();
    const ttml = findTtml(data);
    if (!ttml) return null;
    return lyricsResultFromTtml(ttml, "apple-music");
  } catch (err) {
    console.error(`[lyrics] Apple syllable-lyrics error: ${String(err)}`);
    return null;
  }
}

async function fetchAppleCatalogRelationships(
  context: AppleLyricsContext,
  bearer: string
): Promise<LyricsResult | null> {
  const params = new URLSearchParams();
  params.set("include[songs]", "albums,lyrics,syllable-lyrics");

  const url = `${APPLE_MUSIC_AMP_BASE}/v1/catalog/${encodeURIComponent(
    context.storefront
  )}/songs/${encodeURIComponent(context.trackId)}?${params}`;

  try {
    const res = await fetch(url, {
      headers: applePrivateHeaders(bearer, context.userToken),
      signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(
        `[lyrics] Apple catalog lyrics returned ${res.status} for ${context.trackId}`
      );
      return null;
    }

    const data = await res.json();
    const ttml = findTtml(data);
    if (!ttml) return null;
    return lyricsResultFromTtml(ttml, "apple-music-catalog");
  } catch (err) {
    console.error(`[lyrics] Apple catalog lyrics error: ${String(err)}`);
    return null;
  }
}

function applePrivateHeaders(
  bearer: string,
  userToken: string
): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${bearer}`,
    "media-user-token": userToken,
    origin: "https://music.apple.com",
    referer: "https://music.apple.com/",
  };
}

async function getAppleMusicWebToken(env?: Env): Promise<string | null> {
  const configured = env?.APPLE_MUSIC_WEB_TOKEN?.trim();
  if (configured) return configured;

  const now = Math.floor(Date.now() / 1000);
  if (appleWebTokenCache && now < appleWebTokenCache.exp - 60) {
    return appleWebTokenCache.token;
  }

  try {
    const browse = await fetch(`${APPLE_MUSIC_WEB_BASE}/us/browse`, {
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(APPLE_WEB_TOKEN_TIMEOUT_MS),
    });
    if (!browse.ok) return null;

    const html = await browse.text();
    const assetPath =
      html.match(/\/assets\/index[^"']+\.js/)?.[0] ||
      html.match(/assets\/index[^"']+\.js/)?.[0];
    if (!assetPath) return null;

    const assetUrl = new URL(assetPath, APPLE_MUSIC_WEB_BASE).toString();
    const asset = await fetch(assetUrl, {
      headers: { accept: "application/javascript,text/javascript,*/*" },
      signal: AbortSignal.timeout(APPLE_WEB_TOKEN_TIMEOUT_MS),
    });
    if (!asset.ok) return null;

    const js = await asset.text();
    const candidates =
      js.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g) || [];

    const selected = candidates
      .map((token) => ({ token, exp: jwtExp(token) }))
      .filter((candidate) => candidate.exp > now + 60)
      .sort((a, b) => b.exp - a.exp)[0];

    if (!selected) return null;

    appleWebTokenCache = selected;
    return selected.token;
  } catch (err) {
    console.error(`[lyrics] Apple web token error: ${String(err)}`);
    return null;
  }
}

function jwtExp(token: string): number {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp : 0;
  } catch {
    return 0;
  }
}

function findTtml(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) return null;
  if (typeof value === "string") {
    return value.includes("<tt") && value.includes("</tt>") ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTtml(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.ttml === "string") return record.ttml;
    for (const item of Object.values(record)) {
      const found = findTtml(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function lyricsResultFromTtml(
  ttml: string,
  source: string
): LyricsResult | null {
  const lines = parseTtmlLines(ttml);
  if (lines.length === 0) return null;

  const syncedLines = lines.filter((line) => Number.isFinite(line.time));
  const plainLyrics = lines.map((line) => line.text).join("\n");

  return {
    syncedLyrics:
      syncedLines.length > 0
        ? syncedLines
            .map((line) => `${formatLrcTimestamp(line.time)}${line.text}`)
            .join("\n")
        : null,
    plainLyrics,
    source,
  };
}

function parseTtmlLines(ttml: string): Array<{ time: number; text: string }> {
  const lines: Array<{ time: number; text: string }> = [];
  const paragraphPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(ttml))) {
    const [, attrs, inner] = match;
    const text = xmlText(inner);
    if (!text) continue;

    const firstSpanAttrs = inner.match(/<span\b([^>]*)>/i)?.[1] || "";
    const begin = getXmlAttr(attrs, "begin") || getXmlAttr(firstSpanAttrs, "begin");
    const time = begin ? parseTtmlTime(begin) : Number.NaN;
    lines.push({ time, text });
  }

  if (lines.length > 0) return lines;

  const fallback = xmlText(ttml);
  return fallback ? [{ time: Number.NaN, text: fallback }] : [];
}

function getXmlAttr(attrs: string, name: string): string | null {
  return (
    attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, "i"))?.[1] ||
    attrs.match(new RegExp(`\\b${name}\\s*=\\s*'([^']+)'`, "i"))?.[1] ||
    null
  );
}

function parseTtmlTime(value: string): number {
  const trimmed = value.trim();
  const secondsMatch = trimmed.match(/^(\d+(?:\.\d+)?)s$/);
  if (secondsMatch) return Number(secondsMatch[1]);

  const parts = trimmed.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return Number.NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return Number.NaN;
}

function formatLrcTimestamp(seconds: number): string {
  const totalCentiseconds = Math.round(seconds * 100);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const wholeSeconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `[${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(
    2,
    "0"
  )}.${String(centiseconds).padStart(2, "0")}]`;
}

function xmlText(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim()
  );
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    );
}

async function fetchFromLrclib(
  artistName: string,
  trackName: string,
  duration: string
): Promise<LyricsResult | null> {
  if (!trackName) return null;

  // LRCLIB exact matching is sensitive to album metadata. Apple Music album
  // names often differ from LRCLIB, so start with artist + track only.
  const direct = await fetchFromLrclibGet(artistName, trackName);
  if (direct) return direct;

  return fetchFromLrclibSearch(artistName, trackName, duration);
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

  return (
    records
      .filter((record) => record.syncedLyrics || record.plainLyrics)
      .sort(
        (a, b) =>
          scoreRecord(b, wantedArtist, wantedTrack, wantedDuration) -
          scoreRecord(a, wantedArtist, wantedTrack, wantedDuration)
      )[0] ?? null
  );
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
