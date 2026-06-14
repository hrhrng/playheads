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
import { handleFeed } from "./feed";
import { handleDream } from "./dream";
import { handleLyrics } from "./lyrics";
import type { Env } from "./types";

// Must export the Durable Object class for Wrangler
export { MusicChatAgent } from "./chat-agent";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // -----------------------------------------------------------------------
    // Apple Music API endpoints (stateless, no DO needed)
    // -----------------------------------------------------------------------
    if (url.pathname.startsWith("/apple-music/")) {
      return handleAppleMusic(request, env);
    }

    // -----------------------------------------------------------------------
    // Feed endpoints — TikTok-style cold start (editorial / mood / dream)
    // -----------------------------------------------------------------------
    if (url.pathname.startsWith("/feed/")) {
      return handleFeed(request, env);
    }

    // -----------------------------------------------------------------------
    // Dream endpoint — LLM-generated music recommendations
    // -----------------------------------------------------------------------
    if (url.pathname === "/dream") {
      return handleDream(request, env);
    }

    // -----------------------------------------------------------------------
    // Lyrics API proxy (stateless, no DO needed)
    // -----------------------------------------------------------------------
    if (url.pathname === "/lyrics") {
      return handleLyrics(request, env);
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
