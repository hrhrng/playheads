import Foundation

@Observable
final class PlayerViewModel {
    let musicService: MusicService

    private(set) var queue: [UnifiedTrack] = []
    private(set) var currentIndex: Int = -1

    private var userId: String?
    private var syncTask: Task<Void, Never>?

    var nowPlaying: UnifiedTrack? {
        guard !queue.isEmpty, currentIndex >= 0, currentIndex < queue.count else { return nil }
        return queue[currentIndex]
    }

    var upNext: [UnifiedTrack] {
        guard currentIndex + 1 < queue.count else { return [] }
        return Array(queue[(currentIndex + 1)...])
    }

    var isPlaying: Bool { musicService.isPlaying }
    var isAuthorized: Bool { musicService.isAuthorized }

    init(musicService: MusicService) {
        self.musicService = musicService
    }

    // MARK: - Setup

    func setup(userId: String) async {
        self.userId = userId
        await musicService.initialize()
        await loadQueue()
    }

    private func loadQueue() async {
        guard let userId else { return }
        do {
            let state = try await QueueService.fetch(userId: userId)
            self.queue = state.queue
            self.currentIndex = state.currentIndex
        } catch {
            // Try local fallback
            loadLocalQueue()
        }
    }

    // MARK: - Queue Operations

    func addToQueue(trackId: String) async {
        guard let track = try? await musicService.addToQueue(trackId: trackId) else { return }
        queue.append(track)
        if currentIndex < 0 { currentIndex = 0 }
        await syncQueue()
    }

    func addTrack(_ track: UnifiedTrack) async {
        queue.append(track)
        if currentIndex < 0 { currentIndex = 0 }
        await syncQueue()
    }

    func playAtIndex(_ index: Int) async {
        guard index >= 0, index < queue.count else { return }
        currentIndex = index
        do {
            try await musicService.playQueue(tracks: Array(queue[index...]), startIndex: 0)
            await syncQueue()
        } catch {
            print("[PlayerVM] Error playing at index: \(error)")
        }
    }

    func skipNext() async {
        guard currentIndex + 1 < queue.count else { return }
        currentIndex += 1
        do {
            try await musicService.skipToNext()
            await syncQueue()
        } catch {
            print("[PlayerVM] Error skipping: \(error)")
        }
    }

    func skipPrevious() async {
        guard currentIndex > 0 else { return }
        currentIndex -= 1
        do {
            try await musicService.skipToPrevious()
            await syncQueue()
        } catch {
            print("[PlayerVM] Error skipping back: \(error)")
        }
    }

    func removeFromQueue(at index: Int) async {
        guard index >= 0, index < queue.count else { return }
        queue.remove(at: index)
        if index < currentIndex {
            currentIndex -= 1
        } else if index == currentIndex {
            // Removed now-playing
            if currentIndex >= queue.count {
                currentIndex = max(0, queue.count - 1)
            }
            if !queue.isEmpty {
                await playAtIndex(currentIndex)
            }
        }
        if queue.isEmpty { currentIndex = -1 }
        await syncQueue()
    }

    func togglePlay() async {
        do {
            try await musicService.togglePlay()
        } catch {
            print("[PlayerVM] Toggle play error: \(error)")
        }
    }

    func seekTo(_ time: TimeInterval) {
        musicService.seekTo(time)
    }

    // MARK: - Sync

    private func syncQueue() async {
        saveLocalQueue()
        guard let userId else { return }

        // Debounce sync
        syncTask?.cancel()
        syncTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            try? await QueueService.sync(userId: userId, queue: queue, currentIndex: currentIndex)
        }
    }

    // MARK: - Local Persistence

    private func saveLocalQueue() {
        if let data = try? JSONEncoder().encode(QueueState(queue: queue, currentIndex: currentIndex)) {
            UserDefaults.standard.set(data, forKey: "playheads_queue")
        }
    }

    private func loadLocalQueue() {
        guard let data = UserDefaults.standard.data(forKey: "playheads_queue"),
              let state = try? JSONDecoder().decode(QueueState.self, from: data) else { return }
        queue = state.queue
        currentIndex = state.currentIndex
    }
}
