import Foundation

struct UnifiedTrack: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let artist: String
    let album: String
    let artworkUrl: String
    let durationSeconds: Double
    let provider: MusicProviderType

    enum CodingKeys: String, CodingKey {
        case id, name, artist, album
        case artworkUrl = "artwork_url"
        case durationSeconds = "duration"
        case provider
    }

    var artworkURL: URL? {
        // Apple Music artwork URLs use {w}x{h} placeholders
        let sized = artworkUrl
            .replacingOccurrences(of: "{w}", with: "600")
            .replacingOccurrences(of: "{h}", with: "600")
        return URL(string: sized)
    }

    var formattedDuration: String {
        let minutes = Int(durationSeconds) / 60
        let seconds = Int(durationSeconds) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

enum MusicProviderType: String, Codable {
    case appleMusic = "apple-music"
    case spotify
}

struct QueueState: Codable {
    var queue: [UnifiedTrack]
    var currentIndex: Int

    static let empty = QueueState(queue: [], currentIndex: -1)
}
