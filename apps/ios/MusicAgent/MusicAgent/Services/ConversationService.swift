import Foundation

struct ConversationService {
    static func list(userId: String, limit: Int = 20, cursor: String? = nil) async throws -> ConversationListResponse {
        var query = ["user_id": userId, "limit": String(limit)]
        if let cursor { query["cursor"] = cursor }
        return try await APIClient.shared.get("/api/conversations", query: query)
    }

    static func create(userId: String) async throws -> CreateConversationResponse {
        struct Body: Encodable { let user_id: String }
        return try await APIClient.shared.post("/api/conversations/create", body: Body(user_id: userId))
    }

    static func delete(id: String, userId: String) async throws {
        try await APIClient.shared.delete("/api/conversations/\(id)", query: ["user_id": userId])
    }

    static func update(id: String, userId: String, title: String? = nil, isPinned: Bool? = nil, isArchived: Bool? = nil) async throws {
        struct Body: Encodable {
            let title: String?
            let is_pinned: Bool?
            let is_archived: Bool?
        }
        let _: AnyCodable = try await APIClient.shared.patch(
            "/api/conversations/\(id)",
            body: Body(title: title, is_pinned: isPinned, is_archived: isArchived)
        )
    }

    static func getTitle(id: String, userId: String) async throws -> String? {
        struct TitleResponse: Codable { let title: String? }
        let response: TitleResponse = try await APIClient.shared.get(
            "/api/conversations/\(id)/title",
            query: ["user_id": userId]
        )
        return response.title
    }
}
