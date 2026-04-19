import SwiftUI

// Native SwiftUI views for rendering messages, parts, and the spec tree.
// RN is headless — everything visible is built here.

struct ChatMessagesView: View {
    @ObservedObject var store: ConversationStore
    let track: MoodTrack?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if store.messages.isEmpty {
                        EmptyChatHint(track: track)
                    }
                    ForEach(Array(store.messages.enumerated()), id: \.element.id) { idx, msg in
                        let prev = idx > 0 ? store.messages[idx - 1] : nil
                        let topPad: CGFloat = prev == nil
                            ? 0
                            : (prev!.role == msg.role ? 12 : (msg.role == .agent ? 20 : 16))

                        Group {
                            switch msg.role {
                            case .user:
                                UserBubbleView(text: msg.text, track: track)
                            case .agent:
                                AgentMessageView(message: msg, track: track)
                            case .system:
                                AgentMessageView(message: msg, track: track)
                            }
                        }
                        .padding(.top, topPad)
                        .id(msg.id)
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .bottom)),
                            removal: .opacity
                        ))
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                // Only animate insertions / removals / reorders. Text streaming
                // mutates existing messages without changing the id list, so
                // it won't trigger a re-layout animation here.
                .animation(.spring(response: 0.45, dampingFraction: 0.88), value: store.messages.map(\.id))
            }
            .environment(\.moodTrack, track)
            .onChange(of: store.messages.count) { _, _ in
                withAnimation(.spring(response: 0.45, dampingFraction: 0.88)) {
                    if let last = store.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }
}

struct EmptyChatHint: View {
    let track: MoodTrack?
    var body: some View {
        Text("Ask anything about this song.")
            .font(.system(size: 13))
            .italic()
            .foregroundStyle(track?.ink3 ?? .white.opacity(0.45))
            .frame(maxWidth: .infinity)
            .padding(.top, 80)
    }
}

struct UserBubbleView: View {
    let text: String
    let track: MoodTrack?

    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Text(text)
                .font(.display(size: 15))
                .foregroundStyle(track?.ink ?? .white)
                .lineSpacing(3)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    Capsule().fill(track?.chipBg ?? Color.white.opacity(0.08))
                )
                .overlay(
                    Capsule().strokeBorder(track?.ruleColor ?? Color.white.opacity(0.12), lineWidth: 0.5)
                )
                .frame(maxWidth: .infinity * 0.76, alignment: .trailing)
        }
    }
}

/// Agent reply container. Stacks reasoning, text (block with left rule), and
/// any spec-rendered GenUI composition — each rendered natively.
struct AgentMessageView: View {
    let message: ChatMessage
    let track: MoodTrack?

    var body: some View {
        // Thinking should feel alive while it's all we've got. Once actual
        // text / spec arrives, collapse so the answer isn't pushed off-screen
        // — the user can still expand to re-read.
        let streamingReasoning = !(message.text.isEmpty == false || message.spec != nil)
        VStack(alignment: .leading, spacing: 14) {
            if let r = message.reasoning, !r.isEmpty {
                ReasoningBlock(text: r, track: track, autoExpand: streamingReasoning)
            }
            if !message.text.isEmpty {
                AgentBlock(text: message.text, track: track)
            }
            if let spec = message.spec {
                SpecRenderer(spec: spec)
                    .environment(\.moodTrack, track)
            }
            if message.text.isEmpty && message.reasoning == nil && message.spec == nil {
                StreamingDots(track: track)
            }
        }
    }
}

/// Prose block: no bubble, 2pt left rule + serif body text. Matches mood feed
/// editorial aesthetic.
struct AgentBlock: View {
    let text: String
    let track: MoodTrack?

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Rectangle()
                .fill(track?.ruleColor ?? Color.white.opacity(0.18))
                .frame(width: 2)
            Text(text)
                .font(.display(size: 16))
                .foregroundStyle(track?.ink ?? .white)
                .lineSpacing(4)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.trailing, 8)
    }
}

struct ReasoningBlock: View {
    let text: String
    let track: MoodTrack?
    /// True while the message has only reasoning (no text / spec yet) —
    /// drives auto-expand so streaming is visible. Once false, we auto-collapse
    /// unless the user manually overrode.
    let autoExpand: Bool
    @State private var manualOverride: Bool? = nil

    private var expanded: Bool { manualOverride ?? autoExpand }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.easeOut(duration: 0.22)) {
                    manualOverride = !expanded
                }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Thinking")
                        .font(.system(size: 11, weight: .medium))
                    if autoExpand {
                        // Small pulsing dot signals active thinking while
                        // streaming, in case the reasoning is short enough
                        // that the chars-flowing-in isn't obvious.
                        ThinkingPulse(track: track)
                            .padding(.leading, 1)
                    }
                }
                .foregroundStyle(track?.ink3 ?? .white.opacity(0.45))
            }
            .buttonStyle(.plain)

            if expanded {
                Text(text)
                    .font(.system(size: 13))
                    .italic()
                    .foregroundStyle(track?.ink3 ?? .white.opacity(0.55))
                    .lineSpacing(3)
                    .padding(.leading, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.easeOut(duration: 0.22), value: expanded)
    }
}

/// Single pulsing dot next to the "Thinking" label while reasoning is streaming.
/// More intentional than making the user infer "yes, those chars are appearing".
private struct ThinkingPulse: View {
    let track: MoodTrack?

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: false)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let eased = 0.35 + 0.65 * (sin(t * 2.0 * .pi / 1.1) + 1) / 2
            Circle()
                .fill(track?.ink3 ?? Color.white.opacity(0.45))
                .frame(width: 5, height: 5)
                .opacity(eased)
                .scaleEffect(0.85 + 0.15 * eased)
        }
    }
}

/// Three-dot streaming indicator. Visible while an agent message has no
/// text / spec / reasoning yet. Time-driven sine wave so opacity is continuous
/// (the old discrete phase-swap flickered).
struct StreamingDots: View {
    let track: MoodTrack?

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: false)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { i in
                    // 1.6Hz wave, 0.45-rad stagger per dot → gentle train.
                    let phase = t * 1.6 * .pi - Double(i) * 0.9
                    let eased = 0.32 + 0.68 * (sin(phase) + 1) / 2
                    Circle()
                        .fill(track?.ink3 ?? Color.white.opacity(0.45))
                        .frame(width: 6, height: 6)
                        .opacity(eased)
                        .scaleEffect(0.85 + 0.15 * eased)
                }
            }
        }
        .padding(.leading, 16)
        .padding(.vertical, 4)
    }
}
