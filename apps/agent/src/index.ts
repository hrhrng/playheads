/**
 * Worker entrypoint for the Playheads Agent.
 *
 * Routes requests to:
 * - MusicChatAgent Durable Object (via routeAgentRequest for WebSocket/HTTP)
 * - Apple Music API endpoints (stateless, no DO needed)
 * - Health check
 */
import { routeAgentRequest } from "agents";
import { handleAppleMusic } from "./apple-music";
import type { Env } from "./types";

// Must export the Durable Object class for Wrangler
export { MusicChatAgent } from "./chat-agent";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // -----------------------------------------------------------------------
    // Playlist extraction (stateless — parses URL, fetches from platform API)
    // -----------------------------------------------------------------------
    if (url.pathname === "/playlist/extract" && request.method === "POST") {
      try {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return Response.json({ error: "url is required" }, { status: 400 });
        }
        const { extractPlaylistFromUrl } = await import("./playlist-extractor");
        const playlist = await extractPlaylistFromUrl(body.url, env);
        return Response.json(playlist);
      } catch (e) {
        console.error("[playlist/extract] error:", e);
        return Response.json(
          { error: e instanceof Error ? e.message : String(e) },
          { status: 422 }
        );
      }
    }

    // -----------------------------------------------------------------------
    // Apple Music API endpoints (stateless, no DO needed)
    // -----------------------------------------------------------------------
    if (url.pathname.startsWith("/apple-music/")) {
      return handleAppleMusic(request, env);
    }

    // -----------------------------------------------------------------------
    // Health check
    // -----------------------------------------------------------------------
    if (url.pathname === "/health") {
      return Response.json({
        status: "healthy",
        type: "agents-sdk",
        version: "1.0.0",
      });
    }

    // -----------------------------------------------------------------------
    // Agent WebSocket/HTTP routing
    //
    // routeAgentRequest handles:
    // - WebSocket upgrade for useAgentChat connections
    // - HTTP requests routed to the correct Durable Object instance
    // -----------------------------------------------------------------------
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    return new Response("Not found", { status: 404 });
  },
};
