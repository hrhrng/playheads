/**
 * Adapter hook that wraps Cloudflare Agents SDK's useAgentChat
 * and maps UIMessage format to our app's Message format.
 *
 * Player control tools (play_track, add_to_queue, skip_next,
 * remove_from_playlist) execute on the SERVER and return JSON results
 * containing an `_action` field. This hook watches for new tool results
 * and dispatches queue operations as a side effect.
 */
import { useMemo, useCallback, useRef, useEffect } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import type { Message, MessagePart } from "../types/chat";
import type { UnifiedTrack } from "../providers/types";

/**
 * Music action callbacks — dispatched when agent tool results contain _action.
 */
export interface MusicActions {
  playTrack: (index: number) => Promise<void>;
  addToQueue: (trackId: string) => Promise<void>;
  skipNext: () => Promise<void>;
  removeTrack: (index: number) => Promise<void>;
  storefront?: string;
}

/**
 * Queue operations for adding/removing tracks globally.
 */
export interface QueueOperations {
  addTrack: (track: UnifiedTrack) => void;
  removeTrack: (index: number) => void;
  playAtIndex: (index: number) => Promise<void>;
  skipNext: () => Promise<void>;
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
  queueOps?: QueueOperations;
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
 */
function extractAction(output: unknown): MusicAction | null {
  if (typeof output !== "string") return null;
  try {
    const parsed = JSON.parse(output);
    if (parsed && parsed._action && typeof parsed._action.type === "string") {
      return parsed._action as MusicAction;
    }
  } catch {
    // Not JSON or no _action field
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
  queueOps,
  onMessageSent,
}: UseAgentChatAdapterParams): UseAgentChatAdapterReturn {
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
    body: { session_id: sessionId, user_id: userId, storefront: musicActions?.storefront || 'us' },
  });

  // ── Side-effect: dispatch queue actions from tool results ──
  const musicActionsRef = useRef(musicActions);
  musicActionsRef.current = musicActions;
  const queueOpsRef = useRef(queueOps);
  queueOpsRef.current = queueOps;
  const processedActionIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    // On first render, mark all existing tool call IDs as processed
    // so chat history replay doesn't re-dispatch old actions.
    if (processedActionIds.current === null) {
      const existing = new Set<string>();
      for (const msg of uiMessages) {
        if (msg.role !== "assistant") continue;
        for (const part of msg.parts) {
          if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") continue;
          const toolPart = part as unknown as { toolCallId: string };
          if (toolPart.toolCallId) existing.add(toolPart.toolCallId);
        }
      }
      processedActionIds.current = existing;
      console.log('[ActionDispatch] Skipped', existing.size, 'historical actions on mount');
      return;
    }

    const actions = musicActionsRef.current;
    const ops = queueOpsRef.current;

    for (const msg of uiMessages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") continue;
        const toolPart = part as unknown as {
          toolCallId: string;
          state: string;
          output?: unknown;
        };

        if (toolPart.state !== "output-available") continue;
        if (processedActionIds.current.has(toolPart.toolCallId)) continue;

        const action = extractAction(toolPart.output);
        if (!action) continue;

        processedActionIds.current.add(toolPart.toolCallId);
        console.log('[ActionDispatch] Dispatching:', action.type, action.data);

        // Update global queue immediately
        if (action.type === "add_to_queue" && action.data?.track_id && ops) {
          ops.addTrack({
            id: action.data.track_id as string,
            name: (action.data.name as string) || "Unknown",
            artist: (action.data.artist as string) || "Unknown Artist",
            album: (action.data.album as string) || "",
            artworkUrl: (action.data.artwork_url as string) || "",
            durationSeconds: (action.data.duration as number) || 0,
            provider: 'apple-music',
          });
        } else if (action.type === "remove_track" && action.data?.index != null && ops) {
          ops.removeTrack(action.data.index as number);
        }

        // Dispatch playback actions
        if (actions) {
          switch (action.type) {
            case "add_to_queue":
              // Track already added to queue above — no MusicKit action needed
              break;
            case "play_track":
              if (ops) {
                ops.playAtIndex(action.data.index as number).catch((e) =>
                  console.error("[Agent] play_track error:", e)
                );
              }
              break;
            case "skip_next":
              if (ops) {
                ops.skipNext().catch((e) =>
                  console.error("[Agent] skip_next error:", e)
                );
              }
              break;
            case "remove_track":
              // Already handled above
              break;
          }
        }
      }
    }
  }, [uiMessages]);

  const messages = useMemo(
    () => mapUIMessagesToMessages(uiMessages),
    [uiMessages]
  );

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
