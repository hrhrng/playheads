import Foundation

enum MessageRole: String {
    case user
    case agent
}

struct ChatMessage: Identifiable, Equatable {
    let id: UUID
    let role: MessageRole
    var text: String
    let createdAt: Date

    init(role: MessageRole, text: String) {
        self.id = UUID()
        self.role = role
        self.text = text
        self.createdAt = Date()
    }
}

/// Owns the chat history for the open session. SwiftUI sends user messages in;
/// the store appends and (for now) fakes an agent reply so the RN list has both
/// sides to render while the real `/api/chat` wiring is next.
@MainActor
final class ConversationStore: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []

    func sendUser(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        messages.append(ChatMessage(role: .user, text: trimmed))
        scheduleMockReply()
    }

    private func scheduleMockReply() {
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            await MainActor.run {
                self?.messages.append(ChatMessage(
                    role: .agent,
                    text: "Listening… this track sits in a late-70s AOR pocket—warm analog guitars, a wide stereo image, and a vocal mixed just above the bed."
                ))
            }
        }
    }
}
