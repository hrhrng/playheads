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
  queue?: UnifiedTrack[];
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

  // ── Refs — kept stable across renders ──
  const musicActionsRef = useRef(musicActions);
  musicActionsRef.current = musicActions;
  const queueOpsRef = useRef(queueOps);
  queueOpsRef.current = queueOps;
  // Always reflects the latest queue for onToolCall (get_playlist)
  const queueRef = useRef<UnifiedTrack[]>(queueOps?.queue ?? []);
  useEffect(() => { queueRef.current = queueOps?.queue ?? []; }, [queueOps?.queue]);

  const {
    messages: uiMessages,
    sendMessage: agentSendMessage,
    clearHistory,
    status,
  } = useAgentChat({
    agent,
    body: { session_id: sessionId, user_id: userId, storefront: musicActions?.storefront || 'us' },
    onToolCall: async ({ toolCall, addToolOutput }) => {
      if (toolCall.toolName === 'get_playlist') {
        const tracks = queueRef.current;
        let output: string;
        if (!tracks.length) {
          output = "The playlist is empty.";
        } else {
          const lines = [`Playlist has ${tracks.length} tracks:`];
          tracks.slice(0, 10).forEach((t, i) => {
            lines.push(`  ${i + 1}. ${t.name} - ${t.artist}`);
          });
          if (tracks.length > 10) lines.push(`... and ${tracks.length - 10} more tracks`);
          output = lines.join('\n');
        }
        addToolOutput({ toolCallId: toolCall.toolCallId, output });
      }
    },
  });

  // ── Side-effect: dispatch queue actions from tool results ──
  const processedActionIds = useRef(new Set<string>());
  // On first non-empty render, mark all existing historical messages as
  // already processed — their state effects are already in localStorage.
  const baselineSet = useRef(false);

  useEffect(() => {
    const actions = musicActionsRef.current;
    const ops = queueOpsRef.current;

    if (!baselineSet.current && uiMessages.length > 0) {
      baselineSet.current = true;
      for (const msg of uiMessages) {
        if (msg.role !== "assistant") continue;
        for (const part of msg.parts) {
          const p = part as unknown as { toolCallId?: string };
          if (p.toolCallId) processedActionIds.current.add(p.toolCallId);
        }
      }
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
