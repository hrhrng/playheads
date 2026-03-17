/**
 * Worker entrypoint for the Playheads Agent.
 *
 * Routes requests to:
 * - MusicChatAgent Durable Object (via routeAgentRequest for WebSocket/HTTP)
 * - SSE compatibility endpoint (Phase 1: backward compat with existing frontend)
 * - Apple Music API endpoints (stateless, no DO needed)
 * - Health check
 */
import { routeAgentRequest, getAgentByName } from "agents";
import { handleAppleMusic } from "./apple-music";
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
    // SSE compatibility endpoint (Phase 1: existing frontend support)
    //
    // The existing frontend sends POST /chat with JSON body and expects
    // Server-Sent Events in the old format (text, thinking, tool_start,
    // tool_end, action, done). This bridge translates between the old
    // SSE protocol and the AIChatAgent's Vercel AI SDK format.
    // -----------------------------------------------------------------------
    if (url.pathname === "/chat" && request.method === "POST") {
      return handleSSECompat(request, env);
    }

    // -----------------------------------------------------------------------
    // Agent WebSocket/HTTP routing (Phase 2: full AIChatAgent features)
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

// ---------------------------------------------------------------------------
// SSE Compatibility Bridge
//
// Translates the old POST /chat SSE protocol to AIChatAgent interaction.
// This allows the existing frontend (chatStore.ts) to work without changes.
// ---------------------------------------------------------------------------

async function handleSSECompat(
  request: Request,
  env: Env
): Promise<Response> {
  const body = (await request.json()) as {
    message: string;
    session_id: string;
    user_id: string;
  };

  if (!body.message || !body.session_id || !body.user_id) {
    return Response.json(
      { error: "message, session_id, and user_id are required" },
      { status: 400 }
    );
  }

  // Get the agent DO instance keyed by session_id
  const agent = await getAgentByName(
    env.MUSIC_AGENT,
    body.session_id
  );

  // Send the message to the agent via its onRequest handler
  // We construct a request that the AIChatAgent can process,
  // then transform the Vercel AI SDK stream to our SSE format.
  const agentRequest = new Request("http://agent/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "CF_AGENT_USE_CHAT_REQUEST",
      messages: [
        {
          role: "user",
          content: body.message,
        },
      ],
      body: {
        session_id: body.session_id,
        user_id: body.user_id,
      },
    }),
  });

  // Forward to the DO's fetch handler
  const agentResponse = await agent.fetch(agentRequest);

  if (!agentResponse.ok || !agentResponse.body) {
    return Response.json(
      { error: "Agent request failed" },
      { status: agentResponse.status }
    );
  }

  // Transform the Vercel AI SDK data stream to our legacy SSE format
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  function emitSSE(event: string, data: unknown) {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(chunk));
  }

  // Process the AI SDK stream in the background
  (async () => {
    try {
      const reader = agentResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          // Parse Vercel AI SDK data stream format
          // Format: TYPE:DATA where TYPE is a single character or digit
          // See: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
          try {
            if (line.startsWith("0:")) {
              // Text delta
              const text = JSON.parse(line.slice(2));
              emitSSE("text", { content: text });
            } else if (line.startsWith("g:")) {
              // Reasoning/thinking delta
              const data = JSON.parse(line.slice(2));
              if (data.text) {
                emitSSE("thinking", { content: data.text });
              }
            } else if (line.startsWith("9:")) {
              // Tool call begin
              const data = JSON.parse(line.slice(2));
              emitSSE("tool_start", {
                id: data.toolCallId,
                tool_name: data.toolName,
                args: data.args || {},
              });
            } else if (line.startsWith("a:")) {
              // Tool result
              const data = JSON.parse(line.slice(2));
              emitSSE("tool_end", {
                id: data.toolCallId,
                tool_name: data.toolName || "unknown",
                result: typeof data.result === "string"
                  ? data.result
                  : JSON.stringify(data.result),
                status: "success",
              });
            } else if (line.startsWith("8:")) {
              // Data part (could be music action)
              const parts = JSON.parse(line.slice(2));
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  if (part.type === "music-action" && part.data) {
                    emitSSE("action", part.data);
                  }
                }
              }
            } else if (line.startsWith("d:")) {
              // Finish message
              emitSSE("done", {
                session_id: body.session_id,
                actions: [],
                state: {
                  current_track: null,
                  playlist: [],
                  is_playing: false,
                  playback_position: 0,
                },
              });
            } else if (line.startsWith("e:")) {
              // Error
              const data = JSON.parse(line.slice(2));
              emitSSE("text", {
                content: `Error: ${data.message || "Something went wrong"}`,
              });
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    } catch (e) {
      console.error("SSE bridge error:", e);
      emitSSE("text", { content: "Sorry, I had a little hiccup. Try again?" });
      emitSSE("done", {
        session_id: body.session_id,
        actions: [],
        state: {
          current_track: null,
          playlist: [],
          is_playing: false,
          playback_position: 0,
        },
      });
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
