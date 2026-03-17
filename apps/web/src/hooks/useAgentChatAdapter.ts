/**
 * Adapter hook that wraps Cloudflare Agents SDK's useAgentChat
 * and maps UIMessage format to our app's Message format.
 *
 * Player control tools (play_track, add_to_queue, skip_next,
 * remove_from_playlist) execute on the SERVER and return JSON results
 * containing an `_action` field. This hook watches for new tool results
 * and dispatches MusicKit JS operations as a side effect — matching
 * the old SSE action dispatch pattern.
 */
import { useMemo, useCallback, useRef, useEffect } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import type { Message, MessagePart } from "../types/chat";
import { useChatStore } from "../store/chatStore";

/**
 * Music action callbacks provided by useAppleMusic.
 * Each is fire-and-forget (old executeAgentActions pattern).
 */
export interface MusicActions {
  playTrack: (index: number) => Promise<void>;
  addToQueue: (trackId: string) => Promise<void>;
  skipNext: () => Promise<void>;
  removeTrack: (index: number) => Promise<void>;
}

/** Action payload embedded in server tool results. */
interface MusicAction {
  type: "add_to_queue" | "play_track" | "skip_next" | "remove_track";
  data: Record<string, unknown>;
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
 * Try to extract a `_action` payload from a tool result string.
 * Server player-control tools return JSON like:
 *   { "message": "Added ...", "_action": { "type": "add_to_queue", "data": {...} } }
 */
function extractAction(output: unknown): MusicAction | null {
  if (typeof output !== "string") return null;
  try {
    const parsed = JSON.parse(output);
    if (parsed && parsed._action && typeof parsed._action.type === "string") {
      return parsed._action as MusicAction;
    }
  } catch {
    // Not JSON or no _action field — that's fine (e.g. search_music results)
  }
  return null;
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

            // Parse display message from JSON tool output
            let displayResult: unknown = undefined;
            if (hasOutput && !hasError && typeof toolPart.output === "string") {
              try {
                const parsed = JSON.parse(toolPart.output);
                if (parsed?.message) displayResult = parsed.message;
                else displayResult = toolPart.output;
              } catch {
                displayResult = toolPart.output;
              }
            } else if (hasError) {
              displayResult = toolPart.errorText ?? "Tool execution failed";
            } else if (hasOutput) {
              displayResult = toolPart.output;
            }

            parts.push({
              type: "tool_call",
              id: toolPart.toolCallId,
              tool_name: toolPart.toolName || part.type.replace(/^tool-/, ""),
              args: (toolPart.input ?? {}) as Record<string, unknown>,
              result: displayResult,
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

  const {
    messages: uiMessages,
    sendMessage: agentSendMessage,
    clearHistory,
    status,
  } = useAgentChat({
    agent,
    body: { session_id: sessionId, user_id: userId },
  });

  // ── Side-effect: dispatch MusicKit actions from tool results ──
  // Mirrors the old SSE action handler: when we see a completed tool result
  // containing `_action`, execute the corresponding MusicKit operation.
  const musicActionsRef = useRef(musicActions);
  musicActionsRef.current = musicActions;
  const processedActionIds = useRef(new Set<string>());

  useEffect(() => {
    const actions = musicActionsRef.current;
    if (!actions) {
      console.log('[ActionDispatch] No musicActions available');
      return;
    }

    for (const msg of uiMessages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") continue;
        const toolPart = part as unknown as {
          toolCallId: string;
          state: string;
          output?: unknown;
        };

        console.log('[ActionDispatch] Tool part:', {
          toolCallId: toolPart.toolCallId,
          type: part.type,
          state: toolPart.state,
          outputType: typeof toolPart.output,
          outputPreview: typeof toolPart.output === 'string' ? toolPart.output.slice(0, 200) : toolPart.output,
        });

        // Only process completed tool calls, and only once
        if (toolPart.state !== "output-available") continue;
        if (processedActionIds.current.has(toolPart.toolCallId)) continue;

        const action = extractAction(toolPart.output);
        console.log('[ActionDispatch] Extracted action:', action);
        if (!action) continue;

        // Mark as processed before dispatching (prevent double-execution)
        processedActionIds.current.add(toolPart.toolCallId);
        console.log('[ActionDispatch] Dispatching:', action.type, action.data);

        // Update viewedPlaylist immediately (like old SSE handler)
        if (action.type === "add_to_queue" && action.data?.track_id) {
          useChatStore.getState().addToViewedPlaylist({
            id: action.data.track_id as string,
            name: (action.data.name as string) || "Unknown",
            artist: (action.data.artist as string) || "Unknown Artist",
            album: (action.data.album as string) || "",
            artwork_url: (action.data.artwork_url as string) || "",
            duration: (action.data.duration as number) || 0,
          });
        } else if (action.type === "remove_track" && action.data?.index != null) {
          useChatStore.getState().removeFromViewedPlaylist(action.data.index as number);
        }

        // Dispatch MusicKit action (fire-and-forget, like old executeAgentActions)
        switch (action.type) {
          case "add_to_queue":
            actions.addToQueue(action.data.track_id as string).catch((e) =>
              console.error("[Agent] add_to_queue error:", e)
            );
            break;
          case "play_track":
            actions.playTrack(action.data.index as number).catch((e) =>
              console.error("[Agent] play_track error:", e)
            );
            break;
          case "skip_next":
            actions.skipNext().catch((e) =>
              console.error("[Agent] skip_next error:", e)
            );
            break;
          case "remove_track":
            actions.removeTrack(action.data.index as number).catch((e) =>
              console.error("[Agent] remove_track error:", e)
            );
            break;
        }
      }
    }
  }, [uiMessages]);

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
