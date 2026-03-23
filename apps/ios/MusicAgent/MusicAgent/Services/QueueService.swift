import Foundation

struct QueueService {
    static func fetch(userId: String) async throws -> QueueState {
        try await APIClient.shared.get("/api/queue", query: ["user_id": userId])
    }

    static func sync(userId: String, queue: [UnifiedTrack], currentIndex: Int) async throws {
        struct Body: Encodable {
            let user_id: String
            let queue: [UnifiedTrack]
            let currentIndex: Int
        }
        try await APIClient.shared.postVoid(
            "/api/queue/sync",
            body: Body(user_id: userId, queue: queue, currentIndex: currentIndex)
        )
    }
}
