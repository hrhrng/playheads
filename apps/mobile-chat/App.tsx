import React, { memo, useEffect, useRef } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";

// Props come from SwiftUI via `appProperties` on the RN root view.
// RN owns only the message list — composer / send / network all stay native.
export type Message = {
  id: string;
  role: "user" | "agent";
  text: string;
};

export type Props = {
  messages?: Message[];
};

// Palette derived from SwiftUI Theme.swift — pageInk (#D8CFBF). Later versions
// will accept these as props from native so they track the mood palette.
const INK = "rgba(216,207,191,1)";
const INK_92 = "rgba(216,207,191,0.92)";
const INK_45 = "rgba(216,207,191,0.45)";
const RULE = "rgba(216,207,191,0.22)";
const CHIP = "rgba(216,207,191,0.10)";
const CHIP_EDGE = "rgba(216,207,191,0.18)";
const SERIF = Platform.select({ ios: "New York", default: "serif" });

type Row = { message: Message; marginTop: number };

function buildRows(messages: Message[]): Row[] {
  return messages.map((m, i) => {
    const prev = i > 0 ? messages[i - 1] : undefined;
    const marginTop = !prev
      ? 0
      : prev.role === m.role
        ? 12
        : m.role === "agent"
          ? 20
          : 16;
    return { message: m, marginTop };
  });
}

export default function App({ messages = [] }: Props) {
  const listRef = useRef<FlatList<Row>>(null);
  const rows = React.useMemo(() => buildRows(messages), [messages]);

  useEffect(() => {
    if (rows.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [rows.length]);

  const renderItem: ListRenderItem<Row> = ({ item }) =>
    item.message.role === "user" ? (
      <UserBubble text={item.message.text} marginTop={item.marginTop} />
    ) : (
      <AgentBlock text={item.message.text} marginTop={item.marginTop} />
    );

  return (
    <FlatList
      ref={listRef}
      style={styles.feed}
      contentContainerStyle={styles.feedInner}
      data={rows}
      keyExtractor={(r) => r.message.id}
      renderItem={renderItem}
      removeClippedSubviews
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={7}
      ListEmptyComponent={
        <Text style={styles.placeholder}>Ask anything about this song.</Text>
      }
    />
  );
}

const UserBubble = memo(function UserBubble({
  text,
  marginTop,
}: {
  text: string;
  marginTop: number;
}) {
  return (
    <View
      style={[styles.userRow, { marginTop }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`You: ${text}`}
    >
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  );
});

const AgentBlock = memo(function AgentBlock({
  text,
  marginTop,
}: {
  text: string;
  marginTop: number;
}) {
  return (
    <View
      style={[styles.agentRow, { marginTop }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Agent: ${text}`}
    >
      <View style={styles.agentRule} />
      <Text style={styles.agentText}>{text}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  feed: { flex: 1, backgroundColor: "transparent" },
  feedInner: { paddingHorizontal: 18, paddingVertical: 14 },
  placeholder: {
    color: INK_45,
    fontSize: 13,
    fontStyle: "italic",
    fontFamily: SERIF,
    textAlign: "center",
    marginTop: 80,
  },
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  userBubble: {
    maxWidth: "76%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: CHIP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHIP_EDGE,
  },
  userText: {
    color: INK_92,
    fontSize: 15,
    fontFamily: SERIF,
    lineHeight: 21,
  },
  agentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingRight: 8,
  },
  agentRule: {
    width: 2,
    alignSelf: "stretch",
    backgroundColor: RULE,
    borderRadius: 1,
  },
  agentText: {
    flex: 1,
    marginLeft: 14,
    color: INK,
    fontSize: 16,
    lineHeight: 23,
    fontFamily: SERIF,
  },
});
