/**
 * Apple Music API client with ES256 JWT developer token generation.
 * Ported from apps/backend/apple_music.py
 */
import * as jose from "jose";
import type { Env, TrackInfo } from "./types";

const APPLE_MUSIC_API_BASE = "https://api.music.apple.com";
const APPLE_MUSIC_TOKEN_MAX_TTL = 60 * 60 * 24 * 180; // 6 months

// Module-level token cache (Workers are single-threaded, safe)
let tokenCache: { token: string; exp: number } | null = null;

// ---------------------------------------------------------------------------
// Developer Token Generation
// ---------------------------------------------------------------------------

async function generateDeveloperToken(
  env: Env
): Promise<{ token: string; exp: number }> {
  const privateKey = await jose.importPKCS8(
    env.APPLE_MUSIC_PRIVATE_KEY.replace(/\\n/g, "\n"),
    "ES256"
  );
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(
    Math.max(parseInt(env.APPLE_MUSIC_TOKEN_TTL_SECONDS || "3600"), 60),
    APPLE_MUSIC_TOKEN_MAX_TTL
  );
  const exp = now + ttl;

  const token = await new jose.SignJWT({ iss: env.APPLE_MUSIC_TEAM_ID })
    .setProtectedHeader({ alg: "ES256", kid: env.APPLE_MUSIC_KEY_ID })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  return { token, exp };
}

export async function getDeveloperToken(
  env: Env
): Promise<{ token: string; exp: number }> {
  const now = Math.floor(Date.now() / 1000);

  if (tokenCache && now < tokenCache.exp - 60) {
    return tokenCache;
  }

  const result = await generateDeveloperToken(env);
  tokenCache = result;
  return result;
}

// ---------------------------------------------------------------------------
// Apple Music API Client
// ---------------------------------------------------------------------------

function buildHeaders(
  devToken: string,
  userToken?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${devToken}`,
  };
  if (userToken) {
    headers["Music-User-Token"] = userToken;
  }
  return headers;
}

export async function appleMusicGet(
  path: string,
  env: Env,
  params?: Record<string, string | number>,
  userToken?: string
): Promise<Record<string, unknown>> {
  const { token } = await getDeveloperToken(env);
  const url = new URL(`/${path.replace(/^\//, "")}`, APPLE_MUSIC_API_BASE);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: buildHeaders(token, userToken),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppleMusicError(response.status, text);
  }

  return (await response.json()) as Record<string, unknown>;
}

class AppleMusicError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(`Apple Music API error ${status}: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Parse track from Apple Music API response
// ---------------------------------------------------------------------------

export function parseTrackFromSong(song: Record<string, unknown>): TrackInfo {
  const attrs = (song.attributes || {}) as Record<string, unknown>;
  const artwork = (attrs.artwork || {}) as Record<string, unknown>;
  return {
    id: song.id as string,
    name: (attrs.name as string) || "Unknown",
    artist: (attrs.artistName as string) || "Unknown Artist",
    album: attrs.albumName as string | undefined,
    artwork_url: artwork.url as string | undefined,
    duration: attrs.durationInMillis
      ? (attrs.durationInMillis as number) / 1000
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Route Handler for Apple Music endpoints
// ---------------------------------------------------------------------------

export async function handleAppleMusic(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/apple-music/, "");

  try {
    // GET /apple-music/developer-token
    if (path === "/developer-token") {
      const { token, exp } = await getDeveloperToken(env);
      return Response.json({ token, expires_at: exp });
    }

    // GET /apple-music/catalog/search?term=...&types=...&storefront=...&limit=...&offset=...
    if (path === "/catalog/search") {
      const term = url.searchParams.get("term");
      if (!term) {
        return Response.json({ error: "term required" }, { status: 400 });
      }
      const storefront = url.searchParams.get("storefront") || "us";
      const result = await appleMusicGet(
        `v1/catalog/${storefront}/search`,
        env,
        {
          term,
          types: url.searchParams.get("types") || "songs",
          limit: parseInt(url.searchParams.get("limit") || "10"),
          offset: parseInt(url.searchParams.get("offset") || "0"),
        }
      );
      return Response.json(result);
    }

    // GET /apple-music/catalog/songs/:id
    const songsMatch = path.match(/^\/catalog\/songs\/(.+)$/);
    if (songsMatch) {
      const storefront = url.searchParams.get("storefront") || "us";
      const result = await appleMusicGet(
        `v1/catalog/${storefront}/songs/${songsMatch[1]}`,
        env
      );
      return Response.json(result);
    }

    // GET /apple-music/catalog/albums/:id
    const albumsMatch = path.match(/^\/catalog\/albums\/(.+)$/);
    if (albumsMatch) {
      const storefront = url.searchParams.get("storefront") || "us";
      const result = await appleMusicGet(
        `v1/catalog/${storefront}/albums/${albumsMatch[1]}`,
        env
      );
      return Response.json(result);
    }

    // GET /apple-music/catalog/playlists/:id
    const playlistsMatch = path.match(/^\/catalog\/playlists\/(.+)$/);
    if (playlistsMatch) {
      const storefront = url.searchParams.get("storefront") || "us";
      const result = await appleMusicGet(
        `v1/catalog/${storefront}/playlists/${playlistsMatch[1]}`,
        env
      );
      return Response.json(result);
    }

    // GET /apple-music/me/storefront
    if (path === "/me/storefront") {
      const userToken = request.headers.get("Music-User-Token");
      if (!userToken) {
        return Response.json(
          { error: "Music-User-Token header is required" },
          { status: 400 }
        );
      }
      const result = await appleMusicGet(
        "v1/me/storefront",
        env,
        undefined,
        userToken
      );
      return Response.json(result);
    }

    // GET /apple-music/validate-token?user_id=...
    if (path === "/validate-token") {
      const userId = url.searchParams.get("user_id");
      if (!userId) {
        return Response.json({ error: "user_id required" }, { status: 400 });
      }

      const { results } = await env.DB.prepare(
        'SELECT "appleMusicToken" FROM "profile" WHERE "id" = ?'
      )
        .bind(userId)
        .all();

      if (
        !results.length ||
        !(results[0] as Record<string, unknown>).appleMusicToken
      ) {
        return Response.json({ valid: false, reason: "no_token" });
      }

      const userToken = (results[0] as Record<string, unknown>)
        .appleMusicToken as string;
      try {
        await appleMusicGet("v1/me/storefront", env, undefined, userToken);
        return Response.json({ valid: true });
      } catch (e) {
        if (e instanceof AppleMusicError && (e.status === 401 || e.status === 403)) {
          await env.DB.prepare(
            'UPDATE "profile" SET "appleMusicToken" = NULL WHERE "id" = ?'
          )
            .bind(userId)
            .run();
          return Response.json({ valid: false, reason: "token_expired" });
        }
        throw e;
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof AppleMusicError) {
      return Response.json(
        { error: e.detail, status: e.status },
        { status: e.status }
      );
    }
    console.error("Apple Music error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
