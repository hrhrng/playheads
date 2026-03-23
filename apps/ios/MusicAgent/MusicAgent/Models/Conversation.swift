import Foundation

struct Conversation: Identifiable, Codable, Equatable {
    let id: String
    let userId: String
    var title: String?
    var messageCount: Int
    var lastMessagePreview: String?
    var lastMessageAt: Date?
    var isPinned: Bool
    var isArchived: Bool
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case title
        case messageCount = "message_count"
        case lastMessagePreview = "last_message_preview"
        case lastMessageAt = "last_message_at"
        case isPinned = "is_pinned"
        case isArchived = "is_archived"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct ConversationListResponse: Codable {
    let conversations: [Conversation]
    let hasMore: Bool
    let nextCursor: String?

    enum CodingKeys: String, CodingKey {
        case conversations
        case hasMore = "has_more"
        case nextCursor = "next_cursor"
    }
}

struct CreateConversationResponse: Codable {
    let conversationId: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case conversationId = "conversation_id"
        case createdAt = "created_at"
    }
}
