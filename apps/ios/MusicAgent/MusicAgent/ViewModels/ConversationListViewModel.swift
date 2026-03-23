import Foundation

@Observable
final class ConversationListViewModel {
    private(set) var conversations: [Conversation] = []
    private(set) var isLoading = false
    private(set) var hasMore = false
    private var nextCursor: String?
    private var userId: String?

    var pinnedConversations: [Conversation] {
        conversations.filter(\.isPinned)
    }

    var unpinnedConversations: [Conversation] {
        conversations.filter { !$0.isPinned }
    }

    func setup(userId: String) {
        self.userId = userId
    }

    // MARK: - Fetch

    func loadConversations() async {
        guard let userId, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await ConversationService.list(userId: userId)
            conversations = response.conversations
            hasMore = response.hasMore
            nextCursor = response.nextCursor
        } catch {
            print("[ConversationList] Load error: \(error)")
        }
    }

    func loadMore() async {
        guard let userId, hasMore, let cursor = nextCursor, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await ConversationService.list(userId: userId, cursor: cursor)
            conversations.append(contentsOf: response.conversations)
            hasMore = response.hasMore
            nextCursor = response.nextCursor
        } catch {
            print("[ConversationList] Load more error: \(error)")
        }
    }

    // MARK: - CRUD

    func createConversation() async -> String? {
        guard let userId else { return nil }
        do {
            let response = try await ConversationService.create(userId: userId)
            await loadConversations() // Refresh list
            return response.conversationId
        } catch {
            print("[ConversationList] Create error: \(error)")
            return nil
        }
    }

    func deleteConversation(_ id: String) async {
        guard let userId else { return }
        do {
            try await ConversationService.delete(id: id, userId: userId)
            conversations.removeAll { $0.id == id }
        } catch {
            print("[ConversationList] Delete error: \(error)")
        }
    }

    func togglePin(_ conversation: Conversation) async {
        guard let userId else { return }
        let newPinned = !conversation.isPinned
        do {
            try await ConversationService.update(id: conversation.id, userId: userId, isPinned: newPinned)
            if let index = conversations.firstIndex(where: { $0.id == conversation.id }) {
                conversations[index].isPinned = newPinned
            }
        } catch {
            print("[ConversationList] Pin error: \(error)")
        }
    }

    func rename(_ conversation: Conversation, to title: String) async {
        guard let userId else { return }
        do {
            try await ConversationService.update(id: conversation.id, userId: userId, title: title)
            if let index = conversations.firstIndex(where: { $0.id == conversation.id }) {
                conversations[index].title = title
            }
        } catch {
            print("[ConversationList] Rename error: \(error)")
        }
    }
}
