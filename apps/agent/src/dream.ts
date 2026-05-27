/**
 * Dream — LLM-generated music recommendations.
 *
 * Takes a user prompt (mood, situation, intent) plus optional recent signals
 * (skips/likes from current session). Asks an LLM for N song candidates as
 * { artist, title, why }, then resolves each via Apple Music catalog search
 * into a playable FeedTrack with preview URL.
 *
 * Uses caller "chat" for now — split to its own caller config when traffic
 * volume warrants a cheaper model.
 */
import { generateText } from "ai";
import { resolveLLM } from "./resolve-llm";
import { appleMusicGet } from "./apple-music";
import type { FeedTrack } from "./feed";
import type { Env } from "./types";

interface DreamSignal {
  trackId: string;
  action: "play" | "skip" | "like" | "finish";
}

interface DreamRequest {
  prompt: string;
  recentSignals?: DreamSignal[];
  storefront?: string;
  n?: number;
}

interface DreamCandidate {
  artist: string;
  title: string;
  why?: string;
}

const SYSTEM_PROMPT = `You are a music curator with deep, eclectic taste — equal parts crate-digger and DJ. Given a user's mood, situation, or intent, you suggest songs that match the vibe.

Output a JSON array of song candidates. NO prose, NO markdown — ONLY a valid JSON array.

Each item: { "artist": "<artist name>", "title": "<exact song title>", "why": "<one-sentence reason>" }

Rules:
- Mix well-known and lesser-known tracks. Favor specificity over hits.
- Use exact artist names and song titles so they can be looked up.
- Avoid mainstream defaults unless the user explicitly wants them.
- 8-12 candidates per response unless the user asked for a different count.
- "why" is a one-sentence taste note (it will be shown to the user).`;

function buildUserPrompt(req: DreamRequest): string {
  const lines: string[] = [];
  lines.push(`User: ${req.prompt}`);
  if (req.recentSignals && req.recentSignals.length > 0) {
    const liked = req.recentSignals.filter((s) => s.action === "like").map((s) => s.trackId);
    const skipped = req.recentSignals.filter((s) => s.action === "skip").map((s) => s.trackId);
    if (liked.length) lines.push(`Recently liked track IDs: ${liked.join(", ")}`);
    if (skipped.length) lines.push(`Recently skipped track IDs: ${skipped.join(", ")} — avoid that direction`);
  }
  lines.push(`Return ${req.n || 10} candidates.`);
  return lines.join("\n");
}

function parseCandidates(text: string): DreamCandidate[] {
  // LLM may wrap in ```json fences — strip them.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.artist === "string" && typeof c.title === "string")
      .map((c) => ({ artist: c.artist, title: c.title, why: c.why }));
  } catch {
    return [];
  }
}

interface AppleSongResult {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    artwork?: { url?: string };
    durationInMillis?: number;
    previews?: Array<{ url?: string }>;
  };
}

async function resolveCandidate(
  candidate: DreamCandidate,
  storefront: string,
  env: Env,
): Promise<FeedTrack | null> {
  const term = `${candidate.artist} ${candidate.title}`;
  try {
    const res = await appleMusicGet(`v1/catalog/${storefront}/search`, env, {
      term,
      types: "songs",
      limit: 1,
    });
    const results = (res.results as Record<string, unknown>) || {};
    const songs = (results.songs as Record<string, unknown>) || {};
    const data = (songs.data as AppleSongResult[]) || [];
    const song = data[0];
    if (!song) return null;
    const a = song.attributes || {};
    const artworkTemplate = a.artwork?.url || "";
    const artworkUrl = artworkTemplate.replace("{w}", "1000").replace("{h}", "1000");
    return {
      id: song.id,
      name: a.name || candidate.title,
      artist: a.artistName || candidate.artist,
      album: a.albumName || "",
      artworkUrl,
      durationSeconds: a.durationInMillis ? Math.round(a.durationInMillis / 1000) : 0,
      previewUrl: a.previews?.[0]?.url,
    };
  } catch (e) {
    console.warn("[dream] catalog search failed for", term, e);
    return null;
  }
}

export async function generateDream(req: DreamRequest, env: Env): Promise<FeedTrack[]> {
  const { model } = await resolveLLM(env, "chat");

  const { text } = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(req),
    temperature: 0.9,
    maxOutputTokens: 1200,
  });

  console.log("[dream] LLM raw output:", text.slice(0, 500));

  const candidates = parseCandidates(text);
  if (candidates.length === 0) {
    console.warn("[dream] no candidates parsed from LLM output");
    return [];
  }

  const storefront = req.storefront || "us";
  // Resolve in parallel — Apple's catalog search is fast and they don't rate-limit at this scale.
  const resolved = await Promise.all(candidates.map((c) => resolveCandidate(c, storefront, env)));
  return resolved.filter((t): t is FeedTrack => t !== null && !!t.previewUrl);
}

export async function handleDream(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }
  try {
    const body = (await request.json()) as DreamRequest;
    if (!body.prompt || typeof body.prompt !== "string") {
      return Response.json({ error: "prompt required" }, { status: 400 });
    }
    const tracks = await generateDream(body, env);
    return Response.json({ tracks, source: "dream" });
  } catch (e) {
    console.error("[dream] error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
