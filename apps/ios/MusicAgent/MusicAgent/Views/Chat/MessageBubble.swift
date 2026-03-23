import SwiftUI

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 60) }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 8) {
                ForEach(message.parts) { part in
                    partView(part)
                }
            }

            if message.role == .agent { Spacer(minLength: 60) }
        }
    }

    @ViewBuilder
    private func partView(_ part: MessagePart) -> some View {
        switch part {
        case .text(let textPart):
            if message.role == .user {
                Text(textPart.content)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        LinearGradient(
                            colors: [Color.honey900, Color.honey900.opacity(0.85)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .shadow(color: .honey900.opacity(0.15), radius: 8, x: 0, y: 4)
            } else {
                Text(textPart.content)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .foregroundColor(.honey900)
                    .liquidGlass(cornerRadius: 20, opacity: 0.5)
            }

        case .thinking(let thinkingPart):
            DisclosureGroup {
                Text(thinkingPart.content)
                    .font(.caption)
                    .foregroundColor(.honey900.opacity(0.6))
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "brain")
                    Text("Thinking...")
                }
                .font(.caption)
                .foregroundColor(.honey900.opacity(0.4))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .liquidGlass(cornerRadius: 12, opacity: 0.25)

        case .toolCall(let toolPart):
            HStack(spacing: 8) {
                statusIcon(toolPart.status)

                VStack(alignment: .leading, spacing: 2) {
                    Text(toolDisplayName(toolPart.toolName))
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.honey900)

                    Text(toolStatusText(toolPart.status))
                        .font(.caption2)
                        .foregroundColor(.honey900.opacity(0.5))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .liquidGlass(cornerRadius: 12, opacity: 0.25)
        }
    }

    @ViewBuilder
    private func statusIcon(_ status: ToolCallStatus) -> some View {
        switch status {
        case .pending, .running:
            ProgressView()
                .scaleEffect(0.7)
        case .completed:
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
                .font(.caption)
        case .failed:
            Image(systemName: "xmark.circle.fill")
                .foregroundColor(.red)
                .font(.caption)
        }
    }

    private func toolDisplayName(_ name: String) -> String {
        switch name {
        case "search_music": return "Searching music"
        case "add_to_queue": return "Adding to queue"
        case "play_track": return "Playing track"
        case "skip_next": return "Skipping"
        case "remove_from_playlist": return "Removing track"
        case "get_now_playing": return "Checking now playing"
        case "get_playlist": return "Checking playlist"
        case "web_search": return "Searching the web"
        default: return name.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private func toolStatusText(_ status: ToolCallStatus) -> String {
        switch status {
        case .pending: return "Waiting..."
        case .running: return "Running..."
        case .completed: return "Done"
        case .failed: return "Failed"
        }
    }
}
