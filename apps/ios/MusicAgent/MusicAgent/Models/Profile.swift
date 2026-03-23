import Foundation

struct UserProfile: Codable {
    let id: String
    var displayName: String?
    var avatarUrl: String?
    var appleMusicToken: String?
    var queue: String?       // JSON-encoded queue
    var queueIndex: Int?
    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case avatarUrl = "avatar_url"
        case appleMusicToken = "apple_music_token"
        case queue
        case queueIndex = "queue_index"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct AuthSession: Codable {
    let user: AuthUser
    let session: SessionInfo

    struct AuthUser: Codable {
        let id: String
        let name: String?
        let email: String
        let emailVerified: Bool?
        let image: String?
        let waitlistApproved: Bool?

        enum CodingKeys: String, CodingKey {
            case id, name, email
            case emailVerified = "emailVerified"
            case image
            case waitlistApproved = "waitlistApproved"
        }
    }

    struct SessionInfo: Codable {
        let id: String
        let token: String
        let expiresAt: String

        enum CodingKeys: String, CodingKey {
            case id, token
            case expiresAt = "expiresAt"
        }
    }
}

struct WaitlistResponse: Codable {
    let status: String
    let message: String?
}
