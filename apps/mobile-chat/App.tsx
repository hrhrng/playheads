import React, { useEffect, useRef } from "react";
import { NativeModules } from "react-native";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { buildSpecFromParts, getTextFromParts } from "@json-render/react";

/// Headless RN host. Runs useAgentChat + @json-render/react extraction, then
/// pushes simplified messages into native via ChatBridge. SwiftUI owns all
/// visible rendering — this component returns null.
///
/// Native → JS goes through `props.pendingUserMessage.nonce` so the same text
/// sent twice still triggers a new sendMessage call.

const { ChatBridge } = NativeModules as {
  ChatBridge?: {
    updateMessages: (messages: SimplifiedMessage[]) => void;
    dispatchMusicAction: (payload: Record<string, unknown>) => void;
  };
};

export type Props = {
  baseUrl?: string;
  sessionId?: string;
  userId?: string;
  storefront?: string;
  /** Component types this client can render. Agent uses it to filter the
   *  json-render catalog so the model never emits an unknown component. */
  genuiWhitelist?: string[];
  pendingUserMessage?: { text: string; nonce: string };
};

type SimplifiedMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  reasoning?: string;
  spec?: unknown;
  status?: string;
};

type RawPart = { type: string; text?: string; data?: unknown };

// Catches errors thrown by the Suspense `use(promise)` path below — without
// a boundary, a rejected initial-messages fetch would unwind to the RN root
// and crash the whole bundle.
class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children as React.ReactElement;
  }
}

function AppInner({
  baseUrl = "https://playheads.ai",
  sessionId = "default",
  userId = "anon",
  storefront = "us",
  genuiWhitelist,
  pendingUserMessage,
}: Props) {
  const host = React.useMemo(() => {
    try {
      return new URL(baseUrl).host;
    } catch {
      return "playheads.ai";
    }
  }, [baseUrl]);

  const agent = useAgent({
    agent: "MusicChatAgent",
    name: sessionId,
    host,
  });

  const { messages, sendMessage, status } = useAgentChat({
    agent,
    body: {
      session_id: sessionId,
      user_id: userId,
      storefront,
      // Forwarded from native. Backend narrows the json-render catalog to this
      // set so the model only emits components this client can render.
      ...(genuiWhitelist && genuiWhitelist.length > 0
        ? { genui_whitelist: genuiWhitelist }
        : {}),
    },
    onData(part: { type: string; data: unknown }) {
      if (part.type !== "data-music-action") return;
      ChatBridge?.dispatchMusicAction(part.data as Record<string, unknown>);
    },
  });

  // Emit simplified messages to Swift whenever the agent state changes.
  useEffect(() => {
    if (!ChatBridge) return;
    const simplified: SimplifiedMessage[] = messages.map((m: any) => {
      const parts = (m.parts ?? []) as RawPart[];
      const text = getTextFromParts(parts as any);
      const spec = buildSpecFromParts(parts as any);
      const reasoning = parts
        .filter((p) => p.type === "reasoning")
        .map((p) => (p.text ?? "").trim())
        .filter(Boolean)
        .join("\n\n");
      return {
        id: String(m.id ?? Math.random().toString(36).slice(2)),
        role: m.role === "assistant" ? "agent" : (m.role as "user"),
        text,
        reasoning: reasoning || undefined,
        spec: spec ?? undefined,
        status,
      };
    });
    ChatBridge.updateMessages(simplified);
  }, [messages, status]);

  // Native → JS send command. Watch the nonce so SwiftUI can trigger the same
  // text twice (reopen / retry) without de-duping on text alone.
  const lastNonce = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!pendingUserMessage?.nonce) return;
    if (pendingUserMessage.nonce === lastNonce.current) return;
    lastNonce.current = pendingUserMessage.nonce;
    sendMessage({ text: pendingUserMessage.text });
  }, [pendingUserMessage?.nonce, pendingUserMessage?.text, sendMessage]);

  return null;
}

export default function App(props: Props) {
  // useAgentChat (via @cloudflare/ai-chat) calls React 19's `use(promise)` to
  // suspend on the initial /get-messages fetch. Without a Suspense boundary
  // here, that suspension propagates up and kills the whole RN root tree —
  // useEffect never runs, sendMessage is never called, and the user message
  // stays bottled in the bridge forever. The error boundary catches a
  // rejected initial fetch so a network blip doesn't take down the bundle.
  return (
    <ChatErrorBoundary>
      <React.Suspense fallback={null}>
        <AppInner {...props} />
      </React.Suspense>
    </ChatErrorBoundary>
  );
}
