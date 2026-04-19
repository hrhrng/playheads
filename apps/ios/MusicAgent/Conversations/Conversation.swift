import Foundation

/// Mirror of the row shape the gateway returns from
/// `GET /api/conversations` (see `apps/gateway/src/d1-handlers.ts`). Snake_case
/// JSON → camelCase Swift via explicit CodingKeys.
struct Conversation: Identifiable, Equatable, Decodable {
    let id: String
    var title: String?
    var messageCount: Int
    var lastMessagePreview: String?
    var lastMessageAt: String?
    var isPinned: Bool
    var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case messageCount = "message_count"
        case lastMessagePreview = "last_message_preview"
        case lastMessageAt = "last_message_at"
        case isPinned = "is_pinned"
        case updatedAt = "updated_at"
    }
}

struct ConversationListResponse: Decodable {
    let conversations: [Conversation]
    let has_more: Bool
    let next_cursor: String?
}

/// POST /api/session/create returns `{ session_id }`. The separate D1-row
/// creation endpoint (`POST /api/conversations/create`) returns
/// `{ conversation_id }` instead — web uses `/session/create` so we do too.
struct CreateSessionResponse: Decodable {
    let session_id: String
}

struct ConversationTitleResponse: Decodable {
    let title: String?
}
