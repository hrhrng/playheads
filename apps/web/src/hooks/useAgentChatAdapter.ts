/**
 * Adapter hook that wraps Cloudflare Agents SDK's useAgentChat
 * and maps UIMessage format to our app's Message format.
 *
 * Player control tools (play_track, add_to_queue, skip_next,
 * remove_from_playlist) are registered as client tools so they
 * execute directly against MusicKit JS on the frontend via
 * the onToolCall callback.
 */
import { useMemo, useCallback, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import type { Message, MessagePart } from "../types/chat";

/**
 * Music action callbacks provided by useAppleMusic.
 * Each returns a string result that is sent back to the AI.
 */
export interface MusicActions {
  playTrack: (index: number) => Promise<string>;
  addToQueue: (trackId: string) => Promise<string>;
  skipNext: () => Promise<string>;
  removeTrack: (index: number) => Promise<string>;
}

interface UseAgentChatAdapterParams {
  sessionId: string;
  userId: string;
  musicActions?: MusicActions;
  onMessageSent?: () => void;
}

interface UseAgentChatAdapterReturn {
  messages: Message[];
  sendMessage: (text: string) => void;
  isLoading: boolean;
  clearHistory: () => void;
}

/**
 * Map Vercel AI SDK UIMessage[] to our app's Message[] format.
 */
function mapUIMessagesToMessages(uiMessages: UIMessage[]): Message[] {
  return uiMessages.map((msg) => {
    const role = msg.role === "assistant" ? "agent" : (msg.role as "user");

    const parts: MessagePart[] = [];
    for (const part of msg.parts) {
      switch (part.type) {
        case "text":
          if (part.text) {
            parts.push({ type: "text", content: part.text });
          }
          break;
        case "reasoning":
          if (part.text) {
            parts.push({ type: "thinking", content: part.text });
          }
          break;
        default:
          // Handle tool invocation parts (type is "tool-<name>" or "dynamic-tool")
          if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
            const toolPart = part as unknown as {
              toolCallId: string;
              toolName?: string;
              state: string;
              input?: unknown;
              output?: unknown;
              errorText?: string;
            };
            const hasOutput = toolPart.state === "output-available" || toolPart.output !== undefined;
            const hasError = toolPart.state === "output-error";
            parts.push({
              type: "tool_call",
              id: toolPart.toolCallId,
              tool_name: toolPart.toolName || part.type.replace(/^tool-/, ""),
              args: (toolPart.input ?? {}) as Record<string, unknown>,
              result: hasError
                ? toolPart.errorText ?? "Tool execution failed"
                : hasOutput
                  ? toolPart.output
                  : undefined,
              status: hasError ? "error" : hasOutput ? "success" : "pending",
            });
          }
          break;
      }
    }

    // If no parts were created (e.g., empty message), add empty text
    if (parts.length === 0) {
      return { role, content: "" } as Message;
    }

    return { role, parts } as Message;
  });
}

/**
 * Build client tool definitions for player control.
 * The `execute` functions are called from the onToolCall callback.
 * The schemas (description + parameters) are automatically sent to the
 * server by useAgentChat's prepareBody so createToolsFromClientSchemas
 * can register stubs on the server side.
 */
function buildClientTools(actions: MusicActions) {
  return {
    play_track: {
      description:
        "Play a specific track from the playlist by its position number (1-indexed).",
      parameters: {
        type: "object" as const,
        properties: {
          index: {
            type: "string" as const,
            description: "Track position number starting from 1",
          },
        },
        required: ["index"] as const,
      },
      execute: async (input: { index: string }) => {
        const idx = parseInt(input.index);
        if (isNaN(idx)) return "Please provide a valid track number.";
        return await actions.playTrack(idx - 1);
      },
    },
    add_to_queue: {
      description:
        "Add a track to the queue by its Apple Music ID (from search_music results).",
      parameters: {
        type: "object" as const,
        properties: {
          track_id: {
            type: "string" as const,
            description:
              'Apple Music song ID (e.g. "12345" from search results)',
          },
        },
        required: ["track_id"] as const,
      },
      execute: async (input: { track_id: string }) => {
        return await actions.addToQueue(input.track_id);
      },
    },
    skip_next: {
      description: "Skip to the next track in the playlist.",
      parameters: { type: "object" as const, properties: {} },
      execute: async () => {
        return await actions.skipNext();
      },
    },
    remove_from_playlist: {
      description:
        "Remove a track from the playlist by its position number (1-indexed).",
      parameters: {
        type: "object" as const,
        properties: {
          index: {
            type: "string" as const,
            description: "Track position number starting from 1",
          },
        },
        required: ["index"] as const,
      },
      execute: async (input: { index: string }) => {
        const idx = parseInt(input.index);
        if (isNaN(idx)) return "Please provide a valid track number.";
        return await actions.removeTrack(idx - 1);
      },
    },
  };
}

type ClientToolMap = ReturnType<typeof buildClientTools>;

export function useAgentChatAdapter({
  sessionId,
  userId,
  musicActions,
  onMessageSent,
}: UseAgentChatAdapterParams): UseAgentChatAdapterReturn {
  // Connect to the MusicChatAgent DO keyed by sessionId
  const agent = useAgent({
    agent: "MusicChatAgent",
    name: sessionId,
  });

  // Build client tools from musicActions (stable reference via useMemo)
  const clientTools = useMemo(
    () => (musicActions ? buildClientTools(musicActions) : undefined),
    [musicActions]
  );

  // Ref for stable access to client tools in onToolCall callback
  const clientToolsRef = useRef(clientTools);
  clientToolsRef.current = clientTools;

  // onToolCall callback — the official Cloudflare Agents API for client-side tools.
  // When the AI calls a tool that has no `execute` on the server (created via
  // createToolsFromClientSchemas), the stream pauses and this callback fires.
  // We execute the tool on the frontend and call addToolOutput to resume.
  const handleToolCall = useCallback(
    async ({
      toolCall,
      addToolOutput,
    }: {
      toolCall: { toolCallId: string; toolName: string; input: unknown };
      addToolOutput: (opts: {
        toolCallId: string;
        output: unknown;
        state?: "output-available" | "output-error";
        errorText?: string;
      }) => void;
    }) => {
      const tools = clientToolsRef.current;
      if (!tools) return;

      const tool = tools[toolCall.toolName as keyof ClientToolMap];
      if (!tool) return;

      let output: unknown;
      try {
        output = await tool.execute(toolCall.input as never);
      } catch (error) {
        output = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }

      addToolOutput({
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
    []
  );

  const {
    messages: uiMessages,
    sendMessage: agentSendMessage,
    clearHistory,
    status,
  } = useAgentChat({
    agent,
    body: { session_id: sessionId, user_id: userId },
    // Pass tools so their schemas are sent to the server via prepareBody.
    // The `execute` functions are not used by the library — we handle
    // execution in onToolCall below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: clientTools as any,
    // Official API: stream pauses on client tools, this callback fires,
    // we execute and call addToolOutput to resume.
    onToolCall: handleToolCall,
  });

  // Map UIMessage[] → Message[]
  const messages = useMemo(
    () => mapUIMessagesToMessages(uiMessages),
    [uiMessages]
  );

  // Wrap sendMessage to match our interface
  const sendMessage = useCallback(
    (text: string) => {
      agentSendMessage({ text });
      onMessageSent?.();
    },
    [agentSendMessage, onMessageSent]
  );

  const isLoading = status === "submitted" || status === "streaming";

  return {
    messages,
    sendMessage,
    isLoading,
    clearHistory,
  };
}
