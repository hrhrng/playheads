import Foundation
import MusicKit

/// Wraps the native MusicKit framework for Apple Music playback.
@Observable
final class MusicService {
    private(set) var isAuthorized = false
    private(set) var isInitializing = true
    private(set) var isPlaying = false
    private(set) var currentTrack: UnifiedTrack?
    private(set) var playbackTime: (current: TimeInterval, total: TimeInterval) = (0, 0)
    private(set) var storefrontId = "us"

    private let player = ApplicationMusicPlayer.shared
    private var playbackObserver: Any?

    init() {}

    // MARK: - Authorization

    func initialize() async {
        isInitializing = true
        defer { isInitializing = false }

        let status = await MusicAuthorization.request()
        isAuthorized = status == .authorized

        if isAuthorized {
            await detectStorefront()
            startObservingPlayback()
        }
    }

    private func detectStorefront() async {
        do {
            let storefront = try await MusicDataRequest(urlRequest: URLRequest(
                url: URL(string: "https://api.music.apple.com/v1/me/storefront")!
            )).response()
            // Parse storefront from response
            if let json = try? JSONSerialization.jsonObject(with: storefront.data) as? [String: Any],
               let data = (json["data"] as? [[String: Any]])?.first,
               let id = data["id"] as? String {
                storefrontId = id
            }
        } catch {
            storefrontId = AppConfig.defaultStorefront
        }
    }

    // MARK: - Playback Observation

    private func startObservingPlayback() {
        // Observe player state changes
        Task { @MainActor [weak self] in
            for await state in ApplicationMusicPlayer.shared.state.objectWillChange.values {
                guard let self else { break }
                _ = state
                let playerState = ApplicationMusicPlayer.shared.state
                self.isPlaying = playerState.playbackStatus == .playing
            }
        }
    }

    // MARK: - Search

    func search(query: String, limit: Int = 10) async throws -> [UnifiedTrack] {
        var request = MusicCatalogSearchRequest(term: query, types: [Song.self])
        request.limit = limit

        let response = try await request.response()

        return response.songs.map { song in
            UnifiedTrack(
                id: song.id.rawValue,
                name: song.title,
                artist: song.artistName,
                album: song.albumTitle ?? "",
                artworkUrl: song.artwork?.url(width: 600, height: 600)?.absoluteString ?? "",
                durationSeconds: (song.duration ?? 0),
                provider: .appleMusic
            )
        }
    }

    // MARK: - Playback Control

    func play(trackId: String) async throws {
        let request = MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(trackId))
        let response = try await request.response()

        guard let song = response.items.first else { return }

        player.queue = [song]
        try await player.play()

        currentTrack = UnifiedTrack(
            id: song.id.rawValue,
            name: song.title,
            artist: song.artistName,
            album: song.albumTitle ?? "",
            artworkUrl: song.artwork?.url(width: 600, height: 600)?.absoluteString ?? "",
            durationSeconds: (song.duration ?? 0),
            provider: .appleMusic
        )
    }

    func playQueue(tracks: [UnifiedTrack], startIndex: Int = 0) async throws {
        let trackIds = tracks.map { MusicItemID($0.id) }
        let request = MusicCatalogResourceRequest<Song>(matching: \.id, memberOf: trackIds)
        let response = try await request.response()

        let songs = response.items
        guard !songs.isEmpty else { return }

        player.queue = ApplicationMusicPlayer.Queue(for: songs, startingAt: songs[safe: startIndex])
        try await player.play()

        if let playing = songs[safe: startIndex] {
            currentTrack = UnifiedTrack(
                id: playing.id.rawValue,
                name: playing.title,
                artist: playing.artistName,
                album: playing.albumTitle ?? "",
                artworkUrl: playing.artwork?.url(width: 600, height: 600)?.absoluteString ?? "",
                durationSeconds: (playing.duration ?? 0),
                provider: .appleMusic
            )
        }
    }

    func pause() {
        player.pause()
    }

    func resume() async throws {
        try await player.play()
    }

    func togglePlay() async throws {
        if isPlaying {
            pause()
        } else {
            try await resume()
        }
    }

    func skipToNext() async throws {
        try await player.skipToNextEntry()
    }

    func skipToPrevious() async throws {
        try await player.skipToPreviousEntry()
    }

    func seekTo(_ time: TimeInterval) {
        player.playbackTime = time
    }

    // MARK: - Queue Management

    func addToQueue(trackId: String) async throws -> UnifiedTrack? {
        let request = MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(trackId))
        let response = try await request.response()

        guard let song = response.items.first else { return nil }

        try await player.queue.insert(song, position: .tail)

        return UnifiedTrack(
            id: song.id.rawValue,
            name: song.title,
            artist: song.artistName,
            album: song.albumTitle ?? "",
            artworkUrl: song.artwork?.url(width: 600, height: 600)?.absoluteString ?? "",
            durationSeconds: (song.duration ?? 0),
            provider: .appleMusic
        )
    }

    // MARK: - Developer Token

    func fetchDeveloperToken() async throws -> String {
        struct TokenResponse: Codable {
            let token: String
            let expiresAt: String?
            enum CodingKeys: String, CodingKey {
                case token
                case expiresAt = "expires_at"
            }
        }
        let response: TokenResponse = try await APIClient.shared.get("/api/apple-music/developer-token")
        return response.token
    }

    // MARK: - Token Validation

    func validateToken(userId: String) async -> Bool {
        struct ValidateResponse: Codable { let valid: Bool }
        do {
            let response: ValidateResponse = try await APIClient.shared.get(
                "/api/apple-music/validate-token",
                query: ["user_id": userId]
            )
            return response.valid
        } catch {
            return false
        }
    }

    func clearToken(userId: String) async {
        struct Body: Encodable { let user_id: String }
        try? await APIClient.shared.postVoid("/api/apple-music/clear-token", body: Body(user_id: userId))
    }
}

// MARK: - Collection Safe Subscript

extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
