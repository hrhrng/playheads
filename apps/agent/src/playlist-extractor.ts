/**
 * Playlist extractor — parses music platform URLs and fetches playlist data.
 *
 * Supported platforms:
 * - Apple Music (official API via appleMusicGet)
 * - Spotify (Client Credentials flow)
 * - NetEase Cloud Music / 网易云音乐 (unofficial API)
 * - QQ Music / QQ音乐 (semi-public API)
 * - 汽水音乐 / Resso (web scraping, best-effort)
 */
import { appleMusicGet, parseTrackFromSong } from "./apple-music";
import type { Env } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlaylistTrack {
  name: string;
  artist: string;
  album?: string;
}

export interface PlaylistInfo {
  name: string;
  platform: "apple_music" | "spotify" | "netease" | "qqmusic" | "resso";
  description?: string;
  artwork_url?: string;
  track_count: number;
  tracks: PlaylistTrack[];
}

// ---------------------------------------------------------------------------
// URL Parsing
// ---------------------------------------------------------------------------

interface ParsedUrl {
  platform: PlaylistInfo["platform"];
  id: string;
  storefront?: string;
}

function parsePlaylistUrl(url: string): ParsedUrl {
  const trimmed = url.trim();

  // Apple Music: music.apple.com/{storefront}/playlist/{name}/{pl.xxx}
  if (/music\.apple\.com/i.test(trimmed)) {
    const idMatch = trimmed.match(/(pl\.[A-Za-z0-9-]+)/);
    if (!idMatch) throw new Error("Could not extract Apple Music playlist ID from URL");
    // Extract storefront from path: /us/playlist/... → "us"
    const sfMatch = trimmed.match(/music\.apple\.com\/([a-z]{2})\//i);
    return { platform: "apple_music", id: idMatch[1], storefront: sfMatch?.[1] || "us" };
  }

  // Spotify: open.spotify.com/playlist/{id}
  if (/open\.spotify\.com\/playlist\//i.test(trimmed)) {
    const idMatch = trimmed.match(/\/playlist\/([A-Za-z0-9]+)/);
    if (!idMatch) throw new Error("Could not extract Spotify playlist ID from URL");
    return { platform: "spotify", id: idMatch[1] };
  }

  // NetEase: music.163.com/#/playlist?id=xxx  or  music.163.com/playlist?id=xxx
  if (/music\.163\.com/i.test(trimmed)) {
    // Handle both hash-based and query-based URLs
    let idStr: string | null = null;
    const queryMatch = trimmed.match(/[?&]id=(\d+)/);
    if (queryMatch) {
      idStr = queryMatch[1];
    } else {
      // Try fragment: #/playlist?id=xxx
      const fragMatch = trimmed.match(/#.*[?&]id=(\d+)/);
      if (fragMatch) idStr = fragMatch[1];
    }
    if (!idStr) throw new Error("Could not extract NetEase playlist ID from URL");
    return { platform: "netease", id: idStr };
  }

  // QQ Music: y.qq.com/n/ryqq/playlist/{tid}
  if (/y\.qq\.com/i.test(trimmed)) {
    const idMatch = trimmed.match(/\/playlist\/(\d+)/);
    if (!idMatch) {
      // Try query param: id=xxx
      const qMatch = trimmed.match(/[?&]id=(\d+)/);
      if (!qMatch) throw new Error("Could not extract QQ Music playlist ID from URL");
      return { platform: "qqmusic", id: qMatch[1] };
    }
    return { platform: "qqmusic", id: idMatch[1] };
  }

  // 汽水音乐 / Resso: qishui.douyin.com
  if (/qishui\.douyin\.com/i.test(trimmed)) {
    return { platform: "resso", id: trimmed }; // Pass full URL — need to follow redirects
  }

  throw new Error(
    "Unsupported URL. Supported platforms: Apple Music, Spotify, 网易云音乐, QQ音乐, 汽水音乐"
  );
}

// ---------------------------------------------------------------------------
// Apple Music
// ---------------------------------------------------------------------------

async function extractAppleMusic(
  playlistId: string,
  env: Env,
  storefront = "us"
): Promise<PlaylistInfo> {
  const result = await appleMusicGet(
    `v1/catalog/${storefront}/playlists/${playlistId}`,
    env,
    { include: "tracks" }
  );

  const data = (result.data as Array<Record<string, unknown>>)?.[0];
  if (!data) throw new Error("Apple Music playlist not found");

  const attrs = (data.attributes || {}) as Record<string, unknown>;
  const relationships = (data.relationships || {}) as Record<string, unknown>;
  const tracksRel = (relationships.tracks || {}) as Record<string, unknown>;
  const trackData = (tracksRel.data || []) as Array<Record<string, unknown>>;

  const tracks: PlaylistTrack[] = trackData.map((song) => {
    const t = parseTrackFromSong(song);
    return { name: t.name, artist: t.artist, album: t.album };
  });

  const artwork = (attrs.artwork || {}) as Record<string, unknown>;
  const artworkUrl = artwork.url
    ? String(artwork.url).replace("{w}", "500").replace("{h}", "500")
    : undefined;

  const descObj = (attrs.description || {}) as Record<string, unknown>;

  return {
    name: (attrs.name as string) || "Unknown Playlist",
    platform: "apple_music",
    description: (descObj.short as string) || (descObj.standard as string) || undefined,
    artwork_url: artworkUrl,
    track_count: tracks.length,
    tracks,
  };
}

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

/** Cache Spotify client-credentials token in module scope. */
let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(env: Env): Promise<string> {
  const now = Date.now();
  if (spotifyTokenCache && now < spotifyTokenCache.expiresAt - 60_000) {
    return spotifyTokenCache.token;
  }

  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required");
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) {
    throw new Error(`Spotify auth failed: ${resp.status} ${await resp.text()}`);
  }

  const body = (await resp.json()) as { access_token: string; expires_in: number };
  spotifyTokenCache = {
    token: body.access_token,
    expiresAt: now + body.expires_in * 1000,
  };
  return body.access_token;
}

async function extractSpotify(playlistId: string, env: Env): Promise<PlaylistInfo> {
  const token = await getSpotifyToken(env);

  const resp = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) {
    throw new Error(`Spotify API error: ${resp.status} ${await resp.text()}`);
  }

  const pl = (await resp.json()) as {
    name: string;
    description?: string;
    images?: Array<{ url: string }>;
    tracks: {
      total: number;
      items: Array<{
        track: {
          name: string;
          artists: Array<{ name: string }>;
          album?: { name: string };
        } | null;
      }>;
      next: string | null;
    };
  };

  const tracks: PlaylistTrack[] = [];

  // First page
  for (const item of pl.tracks.items) {
    if (!item.track) continue; // Skip local files
    tracks.push({
      name: item.track.name,
      artist: item.track.artists.map((a) => a.name).join(", "),
      album: item.track.album?.name,
    });
  }

  // Paginate remaining tracks
  let nextUrl = pl.tracks.next;
  while (nextUrl) {
    const pageResp = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pageResp.ok) break;
    const page = (await pageResp.json()) as typeof pl.tracks;
    for (const item of page.items) {
      if (!item.track) continue;
      tracks.push({
        name: item.track.name,
        artist: item.track.artists.map((a) => a.name).join(", "),
        album: item.track.album?.name,
      });
    }
    nextUrl = page.next;
  }

  return {
    name: pl.name,
    platform: "spotify",
    description: pl.description || undefined,
    artwork_url: pl.images?.[0]?.url,
    track_count: tracks.length,
    tracks,
  };
}

// ---------------------------------------------------------------------------
// NetEase Cloud Music / 网易云音乐
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function extractNetease(playlistId: string): Promise<PlaylistInfo> {
  const resp = await fetch("https://music.163.com/api/v6/playlist/detail", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://music.163.com/",
      "User-Agent": BROWSER_UA,
    },
    body: `id=${playlistId}&s=8`,
  });

  if (!resp.ok) {
    throw new Error(`NetEase API error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    code: number;
    playlist?: {
      name: string;
      description?: string;
      coverImgUrl?: string;
      tracks?: Array<{
        name: string;
        ar?: Array<{ name: string }>;
        al?: { name?: string; picUrl?: string };
        dt?: number;
      }>;
      trackIds?: Array<{ id: number }>;
    };
  };

  if (data.code !== 200 || !data.playlist) {
    throw new Error("NetEase: playlist not found or access denied (may be IP-blocked)");
  }

  const pl = data.playlist;
  const rawTracks = pl.tracks || [];

  const tracks: PlaylistTrack[] = rawTracks.map((t) => ({
    name: t.name,
    artist: t.ar?.map((a) => a.name).join(", ") || "Unknown",
    album: t.al?.name,
  }));

  // If tracks array is empty but trackIds exists, the full track list wasn't returned
  const trackCount =
    tracks.length > 0 ? tracks.length : (pl.trackIds?.length || 0);

  return {
    name: pl.name,
    platform: "netease",
    description: pl.description || undefined,
    artwork_url: pl.coverImgUrl,
    track_count: trackCount,
    tracks,
  };
}

// ---------------------------------------------------------------------------
// QQ Music / QQ音乐
// ---------------------------------------------------------------------------

async function extractQQMusic(playlistId: string): Promise<PlaylistInfo> {
  const apiUrl = new URL(
    "https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg"
  );
  apiUrl.searchParams.set("type", "1");
  apiUrl.searchParams.set("json", "1");
  apiUrl.searchParams.set("utf8", "1");
  apiUrl.searchParams.set("onlysong", "0");
  apiUrl.searchParams.set("disstid", playlistId);
  apiUrl.searchParams.set("g_tk", "5381");
  apiUrl.searchParams.set("loginUin", "0");
  apiUrl.searchParams.set("hostUin", "0");
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("inCharset", "utf8");
  apiUrl.searchParams.set("outCharset", "utf-8");
  apiUrl.searchParams.set("notice", "0");
  apiUrl.searchParams.set("platform", "yqq.json");
  apiUrl.searchParams.set("needNewCode", "0");

  const resp = await fetch(apiUrl.toString(), {
    headers: {
      Referer: "https://y.qq.com/",
      "User-Agent": BROWSER_UA,
    },
  });

  if (!resp.ok) {
    throw new Error(`QQ Music API error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    cdlist?: Array<{
      dissname?: string;
      desc?: string;
      logo?: string;
      songlist?: Array<{
        songname?: string;
        singer?: Array<{ name: string }>;
        albumname?: string;
        albumpic_url?: string;
        interval?: number;
      }>;
    }>;
  };

  const cd = data.cdlist?.[0];
  if (!cd) {
    throw new Error("QQ Music: playlist not found");
  }

  const tracks: PlaylistTrack[] = (cd.songlist || []).map((s) => ({
    name: s.songname || "Unknown",
    artist: s.singer?.map((a) => a.name).join(", ") || "Unknown",
    album: s.albumname,
  }));

  return {
    name: cd.dissname || "Unknown Playlist",
    platform: "qqmusic",
    description: cd.desc || undefined,
    artwork_url: cd.logo || undefined,
    track_count: tracks.length,
    tracks,
  };
}

// ---------------------------------------------------------------------------
// 汽水音乐 / Resso (best-effort web scraping)
// ---------------------------------------------------------------------------

async function extractResso(url: string): Promise<PlaylistInfo> {
  // Follow redirects from short URL to final page
  const resp = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`汽水音乐: HTTP ${resp.status} when fetching ${url}`);
  }

  const html = await resp.text();

  // Try __NEXT_DATA__ embedded JSON (Next.js hydration)
  const nextDataMatch = html.match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/
  );
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
      const pageProps = (
        (nextData.props as Record<string, unknown>)?.pageProps as Record<string, unknown>
      ) || {};

      // Look for playlist data in common keys
      const playlistData =
        (pageProps.playlist as Record<string, unknown>) ||
        (pageProps.data as Record<string, unknown>) ||
        (pageProps.playlistDetail as Record<string, unknown>);

      if (playlistData) {
        const name = (playlistData.name as string) || (playlistData.title as string) || "汽水音乐歌单";
        const rawTracks = (playlistData.tracks as Array<Record<string, unknown>>) ||
          (playlistData.songList as Array<Record<string, unknown>>) || [];

        const tracks: PlaylistTrack[] = rawTracks.map((t) => ({
          name: (t.name as string) || (t.title as string) || "Unknown",
          artist: (t.artist as string) || (t.authorName as string) ||
            ((t.artists as Array<Record<string, unknown>>)?.[0]?.name as string) || "Unknown",
          album: t.album as string | undefined,
        }));

        return {
          name,
          platform: "resso",
          artwork_url: (playlistData.cover as string) || (playlistData.coverUrl as string) || undefined,
          track_count: tracks.length,
          tracks,
        };
      }
    } catch {
      // JSON parse failed — fall through
    }
  }

  // Try JSON-LD
  const jsonLdMatch = html.match(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]) as Record<string, unknown>;
      if (ld["@type"] === "MusicPlaylist" || ld.name) {
        return {
          name: (ld.name as string) || "汽水音乐歌单",
          platform: "resso",
          description: ld.description as string | undefined,
          track_count: (ld.numTracks as number) || 0,
          tracks: [],
        };
      }
    } catch {
      // fall through
    }
  }

  throw new Error(
    "汽水音乐: could not extract playlist data from page. The platform does not have a public API."
  );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function extractPlaylistFromUrl(
  url: string,
  env: Env
): Promise<PlaylistInfo> {
  const parsed = parsePlaylistUrl(url);

  switch (parsed.platform) {
    case "apple_music":
      return extractAppleMusic(parsed.id, env, parsed.storefront);
    case "spotify":
      return extractSpotify(parsed.id, env);
    case "netease":
      return extractNetease(parsed.id);
    case "qqmusic":
      return extractQQMusic(parsed.id);
    case "resso":
      return extractResso(parsed.id);
  }
}
