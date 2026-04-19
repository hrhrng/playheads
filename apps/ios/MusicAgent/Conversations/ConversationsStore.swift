import Foundation
import SwiftUI

/// Mirror of `apps/web/src/hooks/useConversations.ts` — owns the list of
/// conversations for the current user, plus the currently-active session id.
///
/// Operations (create / delete / pin / rename) follow the web pattern of
/// optimistic update with rollback on failure, then a full refetch when the
/// list could be out of order (title resolution, pin flip, fresh create).
@MainActor
final class ConversationsStore: ObservableObject {
    static let shared = ConversationsStore()

    @Published private(set) var conversations: [Conversation] = []
    @Published private(set) var hasMore: Bool = false
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var isLoadingMore: Bool = false
    @Published var lastError: String?

    /// Currently-selected conversation. Flows into `ChatHostRepresentable`'s
    /// `sessionId` prop — changing it makes the RN `useAgent` hook reconnect
    /// to a different Durable Object (history auto-replays from DO SQLite).
    @Published var activeSessionId: String?

    private var nextCursor: String?
    private let pageSize = 20
    private let activeKeyPrefix = "playheads.chat.activeSessionId"
    private var titlePollTask: Task<Void, Never>?

    private init() {}

    // MARK: - Persistence of active session per user

    private func activeKey(for userId: String) -> String {
        "\(activeKeyPrefix).\(userId)"
    }

    func loadActiveSession(userId: String) {
        activeSessionId = UserDefaults.standard.string(forKey: activeKey(for: userId))
    }

    func persistActiveSession(userId: String) {
        if let id = activeSessionId {
            UserDefaults.standard.set(id, forKey: activeKey(for: userId))
        } else {
            UserDefaults.standard.removeObject(forKey: activeKey(for: userId))
        }
    }

    // MARK: - Fetch

    func refresh(userId: String) async {
        guard !userId.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let res: ConversationListResponse = try await APIClient.shared.get(
                "/api/conversations",
                query: ["user_id": userId, "limit": String(pageSize)]
            )
            conversations = res.conversations
            hasMore = res.has_more
            nextCursor = res.next_cursor
        } catch {
            lastError = "Failed to load conversations: \(error)"
        }
    }

    func loadMore(userId: String) async {
        guard !userId.isEmpty, hasMore, !isLoadingMore, let cursor = nextCursor else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let res: ConversationListResponse = try await APIClient.shared.get(
                "/api/conversations",
                query: ["user_id": userId, "limit": String(pageSize), "cursor": cursor]
            )
            conversations.append(contentsOf: res.conversations)
            hasMore = res.has_more
            nextCursor = res.next_cursor
        } catch {
            lastError = "Failed to paginate: \(error)"
        }
    }

    // MARK: - Create

    /// POST /api/session/create → server-generated UUID + D1 row. Mirrors
    /// `useChat.ts`'s onSessionCreated flow: client never invents sessionIds.
    struct CreateSessionBody: Encodable { let user_id: String }

    @discardableResult
    func create(userId: String) async -> String? {
        do {
            let res: CreateSessionResponse = try await APIClient.shared.post(
                "/api/session/create",
                body: CreateSessionBody(user_id: userId)
            )
            // Optimistic prepend so the new row is visible instantly; refetch
            // afterwards to pick up the canonical ordering + any server fields.
            // Server serializes updatedAt as a stringified ms timestamp — match
            // that shape so the row sorter treats it consistently.
            let nowMs = String(Int64(Date().timeIntervalSince1970 * 1000))
            let placeholder = Conversation(
                id: res.session_id,
                title: nil,
                messageCount: 0,
                lastMessagePreview: nil,
                lastMessageAt: nil,
                isPinned: false,
                updatedAt: nowMs
            )
            conversations.insert(placeholder, at: 0)
            Task { await refresh(userId: userId) }
            return res.session_id
        } catch {
            lastError = "Failed to create session: \(error)"
            return nil
        }
    }

    // MARK: - Mutations (optimistic + rollback)

    func delete(id: String, userId: String) async {
        let backup = conversations
        conversations.removeAll { $0.id == id }
        if activeSessionId == id { activeSessionId = nil }

        do {
            _ = try await APIClient.shared.deleteVoid(
                "/api/conversations/\(id)",
                query: ["user_id": userId]
            )
        } catch {
            conversations = backup
            lastError = "Failed to delete: \(error)"
        }
    }

    struct PinBody: Encodable { let is_pinned: Bool }

    func setPinned(id: String, userId: String, isPinned: Bool) async {
        let backup = conversations
        if let idx = conversations.firstIndex(where: { $0.id == id }) {
            conversations[idx].isPinned = isPinned
        }
        resort()
        do {
            _ = try await APIClient.shared.patchVoid(
                "/api/conversations/\(id)",
                query: ["user_id": userId],
                body: PinBody(is_pinned: isPinned)
            )
        } catch {
            conversations = backup
            lastError = "Pin failed: \(error)"
        }
    }

    struct RenameBody: Encodable { let title: String }

    func rename(id: String, userId: String, title: String) async {
        let backup = conversations
        if let idx = conversations.firstIndex(where: { $0.id == id }) {
            conversations[idx].title = title
        }
        do {
            _ = try await APIClient.shared.patchVoid(
                "/api/conversations/\(id)",
                query: ["user_id": userId],
                body: RenameBody(title: title)
            )
        } catch {
            conversations = backup
            lastError = "Rename failed: \(error)"
        }
    }

    // Keeps (isPinned desc, updatedAt desc) after optimistic pin flips.
    private func resort() {
        conversations.sort { a, b in
            if a.isPinned != b.isPinned { return a.isPinned && !b.isPinned }
            return a.updatedAt > b.updatedAt
        }
    }

    // MARK: - Title polling for the active untitled conversation

    /// Titles are generated async server-side after the first assistant
    /// response. Poll every 3s × ≤20 until a title appears, matching web.
    func startTitlePollingIfNeeded(userId: String) {
        titlePollTask?.cancel()
        guard let id = activeSessionId,
              let conv = conversations.first(where: { $0.id == id }),
              conv.title == nil || conv.title?.isEmpty == true,
              !userId.isEmpty else { return }

        titlePollTask = Task { [weak self] in
            for _ in 0..<20 {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if Task.isCancelled { return }
                do {
                    let res: ConversationTitleResponse = try await APIClient.shared.get(
                        "/api/conversations/\(id)/title",
                        query: ["user_id": userId]
                    )
                    if let title = res.title, !title.isEmpty {
                        await MainActor.run {
                            guard let self else { return }
                            if let idx = self.conversations.firstIndex(where: { $0.id == id }) {
                                self.conversations[idx].title = title
                            }
                        }
                        return
                    }
                } catch {
                    // Transient — keep trying.
                }
            }
        }
    }

    func stopTitlePolling() {
        titlePollTask?.cancel()
        titlePollTask = nil
    }
}
