import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// Hosted by SwiftUI via `ChatHostRepresentable`. Props passed from native go
// through `RCTRootView`'s `initialProperties` — typed here as a loose bag so
// we can evolve the contract without native changes.
export type Props = {
  trackId?: string;
  songName?: string;
  artist?: string;
};

type Message =
  | { role: "user"; text: string }
  | { role: "agent"; text: string };

const AGENT_BASE = "https://playheads.ai/api";

export default function App(props: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setPending(true);
    try {
      // TODO: swap for the real agent-sdk streaming endpoint once wired.
      // For now we just round-trip a stub so the plumbing can be exercised.
      const res = await fetch(`${AGENT_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          track: {
            id: props.trackId,
            name: props.songName,
            artist: props.artist,
          },
        }),
      });
      const body = res.ok ? await res.text() : `Error ${res.status}`;
      setMessages((prev) => [...prev, { role: "agent", text: body }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Network error: ${String(e)}` },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {props.songName ?? "Playheads"}
        </Text>
        {props.artist ? (
          <Text style={styles.headerSub}>{props.artist}</Text>
        ) : null}
      </View>

      <ScrollView style={styles.feed} contentContainerStyle={styles.feedInner}>
        {messages.length === 0 ? (
          <Text style={styles.placeholder}>
            Ask the vibe anything. GenUI cards land here.
          </Text>
        ) : null}
        {messages.map((m, i) => (
          <View
            key={i}
            style={[
              styles.bubble,
              m.role === "user" ? styles.bubbleUser : styles.bubbleAgent,
            ]}
          >
            <Text style={styles.bubbleText}>{m.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Start a vibe…"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
          returnKeyType="send"
          editable={!pending}
        />
        <Pressable
          style={({ pressed }) => [
            styles.send,
            pressed && styles.sendPressed,
            pending && styles.sendDisabled,
          ]}
          onPress={send}
          disabled={pending}
        >
          <Text style={styles.sendText}>{pending ? "…" : "↑"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerTitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 18,
    fontWeight: "600",
  },
  headerSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    marginTop: 2,
  },
  feed: { flex: 1 },
  feedInner: { padding: 16, gap: 10 },
  placeholder: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
    textAlign: "center",
    marginTop: 80,
  },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  bubbleAgent: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  bubbleText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 14.5,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  input: {
    flex: 1,
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  sendPressed: { opacity: 0.6 },
  sendDisabled: { opacity: 0.4 },
  sendText: {
    color: "#111",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
});
