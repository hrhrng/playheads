/**
 * Adapter hook that wraps Cloudflare Agents SDK's useAgentChat
 * and maps UIMessage format to our app's Message format.
 *
 * Player control tools (play_track, add_to_queue, skip_next,
 * remove_from_playlist) are defined on the SERVER without execute.
 * When the AI calls them, the stream pauses and the onToolCall
 * callback fires here to execute via MusicKit JS on the frontend.
 *
 * @see https://developers.cloudflare.com/agents/api-reference/chat-agents/#client-side-tools
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
 * Dispatch a client-side tool call to the appropriate MusicKit action.
 * Returns the string result that flows back to the AI.
 */
async function executeClientTool(
  toolName: string,
  input: Record<string, unknown>,
  actions: MusicActions
): Promise<string> {
  switch (toolName) {
    case "add_to_queue":
      return actions.addToQueue(input.track_id as string);
    case "play_track": {
      const idx = parseInt(input.index as string);
      if (isNaN(idx)) return "Please provide a valid track number.";
      return actions.playTrack(idx - 1);
    }
    case "skip_next":
      return actions.skipNext();
    case "remove_from_playlist": {
      const idx = parseInt(input.index as string);
      if (isNaN(idx)) return "Please provide a valid track number.";
      return actions.removeTrack(idx - 1);
    }
    default:
      return `Unknown client tool: ${toolName}`;
  }
}

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

  // Ref for stable access to musicActions in onToolCall callback
  const musicActionsRef = useRef(musicActions);
  musicActionsRef.current = musicActions;

  // onToolCall — the official Cloudflare Agents API for client-side tools.
  // Server defines tools WITHOUT execute. When the AI calls them, the
  // stream pauses and this callback fires. We execute via MusicKit JS
  // and call addToolOutput to resume.
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
      const actions = musicActionsRef.current;
      if (!actions) {
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: "Music actions not available. Please try again.",
        });
        return;
      }

      let output: string;
      try {
        output = await executeClientTool(
          toolCall.toolName,
          (toolCall.input ?? {}) as Record<string, unknown>,
          actions
        );
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
    // Client-side tools are defined on the server WITHOUT execute.
    // When the AI calls them, the stream pauses and this callback fires.
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
