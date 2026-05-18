/**
 * Adapter hook that wraps Cloudflare Agents SDK's useAgentChat
 * and maps UIMessage format to our app's Message format.
 *
 * Player control tools (play_track, add_to_queue, skip_next,
 * remove_from_playlist) execute on the SERVER and return JSON results
 * containing an `_action` field. This hook watches for new tool results
 * and dispatches queue operations as a side effect.
 */
import { useMemo, useCallback, useRef } from "react";
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
  addTracks: (tracks: UnifiedTrack[]) => void;
  /** Insert tracks at head of queue and start playing the first one. */
  playTracks: (tracks: UnifiedTrack[]) => Promise<void>;
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
  /** Raw UIMessages from AI SDK — needed by json-render's useJsonRenderMessage */
  rawMessages: UIMessage[];
  sendMessage: (text: string, files?: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }>) => void;
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

  // ── Refs for dispatching music actions from onData callback ──
  const musicActionsRef = useRef(musicActions);
  musicActionsRef.current = musicActions;
  const queueOpsRef = useRef(queueOps);
  queueOpsRef.current = queueOps;
  const processedActionIds = useRef(new Set<string>());

  const {
    messages: uiMessages,
    sendMessage: agentSendMessage,
    clearHistory,
    status,
  } = useAgentChat({
    agent,
    body: { session_id: sessionId, user_id: userId, storefront: musicActions?.storefront || 'us' },
    onData(part: { type: string; data: unknown }) {
      if (part.type !== "data-music-action") return;

      const payload = part.data as MusicAction & { id?: string };
      // Dedupe: onData fires on stream resume/reconnect too
      if (payload.id && processedActionIds.current.has(payload.id)) return;
      if (payload.id) processedActionIds.current.add(payload.id);

      console.log('[ActionDispatch] Dispatching:', payload.type, payload.data);

      const ops = queueOpsRef.current;

      // Update global queue immediately
      if (payload.type === "add_to_queue" && payload.data?.track_id && ops) {
        ops.addTrack({
          id: payload.data.track_id as string,
          name: (payload.data.name as string) || "Unknown",
          artist: (payload.data.artist as string) || "Unknown Artist",
          album: (payload.data.album as string) || "",
          artworkUrl: (payload.data.artwork_url as string) || "",
          durationSeconds: (payload.data.duration as number) || 0,
          provider: 'apple-music',
        });
      } else if (payload.type === "remove_track" && payload.data?.index != null && ops) {
        ops.removeTrack(payload.data.index as number);
      }

      // Dispatch playback actions
      if (ops) {
        switch (payload.type) {
          case "play_track":
            ops.playAtIndex(payload.data.index as number).catch((e) =>
              console.error("[Agent] play_track error:", e)
            );
            break;
          case "skip_next":
            ops.skipNext().catch((e) =>
              console.error("[Agent] skip_next error:", e)
            );
            break;
        }
      }
    },
  });

  const messages = useMemo(
    () => mapUIMessagesToMessages(uiMessages),
    [uiMessages]
  );

  const sendMessage = useCallback(
    (text: string, files?: Array<{ type: 'file'; mediaType: string; url: string; filename?: string }>) => {
      if (files && files.length > 0) {
        agentSendMessage({ text, files });
      } else {
        agentSendMessage({ text });
      }
      onMessageSent?.();
    },
    [agentSendMessage, onMessageSent]
  );

  const isLoading = status === "submitted" || status === "streaming";

  return {
    messages,
    rawMessages: uiMessages,
    sendMessage,
    isLoading,
    clearHistory,
  };
}
