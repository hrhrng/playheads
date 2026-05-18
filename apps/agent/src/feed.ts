/**
 * Feed endpoints — TikTok-style endless music feed.
 *
 * Sources:
 *   - editorial: Apple Music charts (top songs by storefront)
 *   - mood:      Hardcoded mood key → catalog search query
 *   - dream:     LLM-generated candidates (delegates to chat-agent — v2)
 *
 * All sources return the same Track[] shape so the frontend stays agnostic.
 */
import { appleMusicGet } from "./apple-music";
import { generateDream } from "./dream";
import type { Env } from "./types";

export interface FeedTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationSeconds: number;
  /** 30s preview MP3 — public CDN, no user auth required. */
  previewUrl?: string;
}

interface AppleSong {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    artwork?: { url?: string; width?: number; height?: number };
    durationInMillis?: number;
    previews?: Array<{ url?: string }>;
  };
}

function parseFeedTrack(song: AppleSong): FeedTrack {
  const a = song.attributes || {};
  const artworkTemplate = a.artwork?.url || "";
  // Apple's artwork URL is a template like "https://.../{w}x{h}bb.jpg" — pick 1000px
  const artworkUrl = artworkTemplate.replace("{w}", "1000").replace("{h}", "1000");
  return {
    id: song.id,
    name: a.name || "Unknown",
    artist: a.artistName || "Unknown Artist",
    album: a.albumName || "",
    artworkUrl,
    durationSeconds: a.durationInMillis ? Math.round(a.durationInMillis / 1000) : 0,
    previewUrl: a.previews?.[0]?.url,
  };
}

const MOOD_QUERIES: Record<string, string> = {
  focus: "lofi instrumental",
  sad: "melancholic indie",
  high_energy: "high energy electronic",
  chill: "chill vibes",
  surprise: "rare tracks",
};

async function feedEditorial(env: Env, params: URLSearchParams): Promise<FeedTrack[]> {
  const storefront = params.get("storefront") || "us";
  const n = Math.min(parseInt(params.get("n") || "10"), 25);
  const res = await appleMusicGet(`v1/catalog/${storefront}/charts`, env, {
    types: "songs",
    limit: n,
  });
  const results = (res.results as Record<string, unknown>) || {};
  const songsCharts = (results.songs as Array<Record<string, unknown>>) || [];
  const data = (songsCharts[0]?.data as AppleSong[]) || [];
  return data.map(parseFeedTrack);
}

async function feedMood(env: Env, params: URLSearchParams): Promise<FeedTrack[]> {
  const moodKey = params.get("moodKey") || "chill";
  const term = MOOD_QUERIES[moodKey] || MOOD_QUERIES.chill;
  const storefront = params.get("storefront") || "us";
  const n = Math.min(parseInt(params.get("n") || "10"), 25);
  const res = await appleMusicGet(`v1/catalog/${storefront}/search`, env, {
    term,
    types: "songs",
    limit: n,
  });
  const results = (res.results as Record<string, unknown>) || {};
  const songs = (results.songs as Record<string, unknown>) || {};
  const data = (songs.data as AppleSong[]) || [];
  return data.map(parseFeedTrack);
}

export async function handleFeed(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/feed/, "");

  try {
    // GET /feed/next?source=editorial|mood&n=10&moodKey=focus&storefront=us
    if (path === "/next" && request.method === "GET") {
      const source = url.searchParams.get("source") || "editorial";
      let tracks: FeedTrack[];
      switch (source) {
        case "editorial":
          tracks = await feedEditorial(env, url.searchParams);
          break;
        case "mood":
          tracks = await feedMood(env, url.searchParams);
          break;
        case "dream": {
          const prompt = url.searchParams.get("prompt");
          if (!prompt) {
            return Response.json({ error: "prompt required for dream source" }, { status: 400 });
          }
          const n = Math.min(parseInt(url.searchParams.get("n") || "10"), 25);
          const storefront = url.searchParams.get("storefront") || "us";
          tracks = await generateDream({ prompt, n, storefront }, env);
          break;
        }
        default:
          return Response.json({ error: `unknown source: ${source}` }, { status: 400 });
      }
      return Response.json({ tracks, source });
    }

    // POST /feed/signal { trackId, action: 'play'|'skip'|'like', source? }
    // v1: log and ack. Future: write to D1 for dream context.
    if (path === "/signal" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      console.log("[feed/signal]", JSON.stringify(body));
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    console.error("[feed] error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
