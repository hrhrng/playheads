/**
 * Adapter hook that wraps Cloudflare Agents SDK's useAgentChat
 * and maps UIMessage format to our app's Message format.
 *
 * This allows existing rendering components (TranscriptOverlay, MessageList)
 * to work without changes while using the new WebSocket-based agent protocol.
 */
import { useRef, useMemo, useCallback, useEffect } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import type { Message, MessagePart, AgentAction } from "../types/chat";

interface UseAgentChatAdapterParams {
  sessionId: string;
  userId: string;
  onAgentActions?: (actions: AgentAction[]) => Promise<void> | void;
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
 *
 * UIMessage format:
 *   role: 'user' | 'assistant'
 *   parts: [{ type: 'text', text }, { type: 'reasoning', text }, { type: 'tool-invocation', ... }]
 *
 * Our format:
 *   role: 'user' | 'agent'
 *   parts: [{ type: 'text', content }, { type: 'thinking', content }, { type: 'tool_call', ... }]
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
            };
            parts.push({
              type: "tool_call",
              id: toolPart.toolCallId,
              tool_name: toolPart.toolName || part.type.replace(/^tool-/, ""),
              args: (toolPart.input ?? {}) as Record<string, unknown>,
              result: toolPart.state === "output-available" ? toolPart.output : undefined,
              status: toolPart.state === "output-available" ? "success" : "pending",
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
 * Music action tool names that trigger MusicKit commands on the frontend.
 */
const ACTION_TOOLS = new Set([
  "add_to_queue",
  "play_track",
  "skip_next",
  "remove_from_playlist",
]);

/**
 * Extract MusicKit actions from tool invocation results.
 * Tools return { message, action } objects where action contains MusicKit command data.
 */
function extractActionsFromMessages(uiMessages: UIMessage[]): AgentAction[] {
  const actions: AgentAction[] = [];
  for (const msg of uiMessages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (part.type !== "dynamic-tool" && !part.type.startsWith("tool-")) continue;
      const toolPart = part as unknown as {
        toolCallId: string;
        toolName?: string;
        state: string;
        output?: unknown;
      };
      if (toolPart.state !== "output-available") continue;
      const toolName = toolPart.toolName || part.type.replace(/^tool-/, "");
      if (!ACTION_TOOLS.has(toolName)) continue;

      const result = toolPart.output;
      if (result && typeof result === "object" && "action" in result) {
        const actionData = (result as { action: Record<string, unknown> }).action;
        if (actionData && typeof actionData.type === "string") {
          actions.push({
            type: actionData.type as AgentAction["type"],
            data: actionData,
          });
        }
      }
    }
  }
  return actions;
}

export function useAgentChatAdapter({
  sessionId,
  userId,
  onAgentActions,
  onMessageSent,
}: UseAgentChatAdapterParams): UseAgentChatAdapterReturn {
  // Track which actions we've already dispatched to avoid duplicates
  const processedActionsRef = useRef(new Set<string>());

  // Connect to the MusicChatAgent DO keyed by sessionId
  const agent = useAgent({
    agent: "MusicChatAgent",
    name: sessionId,
  });

  const {
    messages: uiMessages,
    sendMessage: agentSendMessage,
    clearHistory,
    status,
  } = useAgentChat({
    agent,
    body: { session_id: sessionId, user_id: userId },
  });

  // Map UIMessage[] → Message[]
  const messages = useMemo(
    () => mapUIMessagesToMessages(uiMessages),
    [uiMessages]
  );

  // Process music actions from tool results
  useEffect(() => {
    if (!onAgentActions) return;

    const allActions = extractActionsFromMessages(uiMessages);
    const newActions: AgentAction[] = [];

    for (const action of allActions) {
      // Create a stable key for deduplication
      const key = JSON.stringify(action);
      if (!processedActionsRef.current.has(key)) {
        processedActionsRef.current.add(key);
        newActions.push(action);
      }
    }

    if (newActions.length > 0) {
      onAgentActions(newActions);
    }
  }, [uiMessages, onAgentActions]);

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
