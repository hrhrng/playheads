import Foundation

@Observable
final class ChatViewModel {
    private let chatService: ChatService
    private let playerViewModel: PlayerViewModel

    var messages: [ChatMessage] = []
    var input = ""
    var isStreaming: Bool { chatService.isStreaming }

    private var sessionId: String?
    private var userId: String?

    init(chatService: ChatService, playerViewModel: PlayerViewModel) {
        self.chatService = chatService
        self.playerViewModel = playerViewModel
        setupCallbacks()
    }

    private func setupCallbacks() {
        chatService.onMessageUpdate = { [weak self] message in
            Task { @MainActor [weak self] in
                self?.handleMessageUpdate(message)
            }
        }

        chatService.onStreamComplete = { [weak self] in
            Task { @MainActor [weak self] in
                self?.handleStreamComplete()
            }
        }

        chatService.onAction = { [weak self] action in
            Task { @MainActor [weak self] in
                self?.handleAction(action)
            }
        }
    }

    // MARK: - Connection

    func connect(sessionId: String, userId: String) {
        self.sessionId = sessionId
        self.userId = userId
        chatService.connect(sessionId: sessionId, userId: userId)
    }

    func disconnect() {
        chatService.disconnect()
    }

    // MARK: - Send

    func sendMessage() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let sessionId, let userId else { return }

        let userMessage = ChatMessage(role: .user, text: text)
        messages.append(userMessage)
        input = ""

        chatService.sendMessage(
            text: text,
            sessionId: sessionId,
            userId: userId,
            storefront: playerViewModel.musicService.storefrontId
        )
    }

    // MARK: - Message Handling

    @MainActor
    private func handleMessageUpdate(_ message: ChatMessage) {
        // Update the last agent message or append new one
        if let lastIndex = messages.indices.last,
           messages[lastIndex].role == .agent,
           messages[lastIndex].id == message.id {
            messages[lastIndex] = message
        } else {
            // Remove any existing streaming placeholder
            if let lastIndex = messages.indices.last,
               messages[lastIndex].role == .agent,
               messages[lastIndex].textContent.isEmpty {
                messages[lastIndex] = message
            } else {
                messages.append(message)
            }
        }
    }

    @MainActor
    private func handleStreamComplete() {
        // Stream is done, no additional action needed
    }

    // MARK: - Action Dispatch

    @MainActor
    private func handleAction(_ action: [String: Any]) {
        guard let type = action["type"] as? String,
              let data = action["data"] as? [String: Any] else { return }

        Task {
            switch type {
            case "add_to_queue":
                if let trackId = data["track_id"] as? String {
                    await playerViewModel.addToQueue(trackId: trackId)
                }
            case "play_track":
                if let index = data["index"] as? Int {
                    await playerViewModel.playAtIndex(index - 1) // 1-indexed from server
                }
            case "skip_next":
                await playerViewModel.skipNext()
            case "remove_track":
                if let index = data["index"] as? Int {
                    await playerViewModel.removeFromQueue(at: index - 1) // 1-indexed from server
                }
            default:
                break
            }
        }
    }

    // MARK: - New Conversation

    func startNewConversation(sessionId: String, userId: String) {
        disconnect()
        messages = []
        connect(sessionId: sessionId, userId: userId)
    }

    func loadHistory(_ history: [ChatMessage]) {
        messages = history
    }
}
