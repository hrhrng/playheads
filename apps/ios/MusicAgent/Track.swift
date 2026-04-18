import Foundation
import MusicKit
import SwiftUI
import Combine
import AVFoundation
import UIKit
import CoreGraphics

// MARK: - Feed seed
// Each seed pairs an Apple Music catalog ID with a mood palette + session metadata.
// Replace the `trackId` values with real catalog IDs from music.apple.com (the number
// at the end of the URL — `/album/…/<albumId>?i=<songId>`; use `<songId>`).

struct FeedSeed: Identifiable, Hashable {
    var id: String { trackId }
    let trackId: String
    let mood: MoodPalette
    let sessionTitle: String
    let chatHint: String
    let lyrics: [String]
    let currentLyricIndex: Int
    let fallbackSong: String
    let fallbackArtist: String
    let fallbackAlbumEn: String
    let fallbackAlbumCn: String
    let fallbackAlbumSub: String
}

enum FeedSeeds {
    static let all: [FeedSeed] = [
        FeedSeed(
            trackId: "1445876267",
            mood: .amber,
            sessionTitle: "Rainy Sunday",
            chatHint: "Start a vibe…",
            lyrics: [
                "我聽見稻穗 跟風在笑",
                "對這個世界 如果你有太多的抱怨",
                "跌倒了 就不敢繼續往前走"
            ],
            currentLyricIndex: 1,
            fallbackSong: "Rice Field",
            fallbackArtist: "Jay Chou · 周杰倫",
            fallbackAlbumEn: "Jay",
            fallbackAlbumCn: "魔杰座",
            fallbackAlbumSub: "2008 · JVR"
        ),
        FeedSeed(
            trackId: "1443109064",
            mood: .blue,
            sessionTitle: "Late Night",
            chatHint: "Something for the rain…",
            lyrics: [
                "窗外的雨 沒有停過",
                "我還在等 那班最後的船",
                "城市的燈 倒影在水面"
            ],
            currentLyricIndex: 1,
            fallbackSong: "Harbour Lights",
            fallbackArtist: "Faye Wong · 王菲",
            fallbackAlbumEn: "Blue",
            fallbackAlbumCn: "藍色雨",
            fallbackAlbumSub: "1998 · WMG"
        ),
        FeedSeed(
            trackId: "1580717170",
            mood: .forest,
            sessionTitle: "Morning Walk",
            chatHint: "Something greener…",
            lyrics: [
                "走進森林 聽見風在說話",
                "每一片葉 都記得昨天的雨",
                "我把心事 放在石頭上"
            ],
            currentLyricIndex: 1,
            fallbackSong: "Soft Stone",
            fallbackArtist: "Crystal Tea · 山茶",
            fallbackAlbumEn: "Moss",
            fallbackAlbumCn: "苔",
            fallbackAlbumSub: "2021 · Indie"
        ),
        FeedSeed(
            trackId: "1736617356",
            mood: .neon,
            sessionTitle: "Friday Dance Floor",
            chatHint: "Louder, pinker…",
            lyrics: [
                "深夜的城 顏色在跳舞",
                "粉紅靜電 和青霓虹碰撞",
                "我把舊的夢 浸在汽水裡"
            ],
            currentLyricIndex: 1,
            fallbackSong: "Soda Lights",
            fallbackArtist: "Neon Pop · 霓虹流",
            fallbackAlbumEn: "Neon",
            fallbackAlbumCn: "霓虹",
            fallbackAlbumSub: "2024 · Club"
        )
    ]
}

// MARK: - View model for the mood feed

@MainActor
final class MoodFeedViewModel: ObservableObject {
    @Published private(set) var tracks: [MoodTrack] = FeedSeeds.all.map { MoodTrack(seed: $0, song: nil) }
    @Published private(set) var authStatus: MusicAuthorization.Status = .notDetermined
    @Published private(set) var loadError: String?

    func load() async {
        authStatus = await MusicAuthorization.request()
        guard authStatus == .authorized else {
            loadError = "Apple Music access not granted — using mock data."
            return
        }
        do {
            let ids = FeedSeeds.all.map { MusicItemID($0.trackId) }
            var request = MusicCatalogResourceRequest<Song>(matching: \.id, memberOf: ids)
            request.properties = [.artists, .albums, .artistURL]
            let response = try await request.response()
            let byId: [String: Song] = Dictionary(
                response.items.map { ($0.id.rawValue, $0) },
                uniquingKeysWith: { a, _ in a }
            )
            tracks = FeedSeeds.all.map { seed in
                MoodTrack(seed: seed, song: byId[seed.trackId])
            }
            loadError = nil
        } catch {
            loadError = "MusicKit fetch failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - Art palette (derived from Apple Music artwork)

struct ArtPalette: Hashable {
    let background: Color?
    let primary: Color?
    let secondary: Color?
    let tertiary: Color?
    let quaternary: Color?
}

// MARK: - Dominant color cluster (extracted from the cover image itself)

struct ClusterColor: Hashable {
    let color: Color
    let weight: Double      // 0..1 share of pixels
}

enum PaletteClustering {
    /// Histogram bucket: quantize to 16 levels per channel (4 bits), pick top N.
    static func clusters(from cgImage: CGImage, sampleSize: Int = 96, maxClusters: Int = 5) -> [ClusterColor] {
        let width = sampleSize
        let height = sampleSize
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        var pixels = [UInt8](repeating: 0, count: width * height * bytesPerPixel)

        guard let ctx = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return [] }
        ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        let quant: UInt8 = 16
        var buckets: [UInt32: Int] = [:]
        let totalPixels = width * height
        for i in stride(from: 0, to: pixels.count, by: bytesPerPixel) {
            let a = pixels[i + 3]
            if a < 200 { continue }
            let r = (pixels[i]     / quant) * quant
            let g = (pixels[i + 1] / quant) * quant
            let b = (pixels[i + 2] / quant) * quant
            let key = (UInt32(r) << 16) | (UInt32(g) << 8) | UInt32(b)
            buckets[key, default: 0] += 1
        }
        let total = Double(totalPixels)
        let top = buckets.sorted { $0.value > $1.value }.prefix(maxClusters)
        return top.map { (key, count) in
            let r = Double((key >> 16) & 0xff) / 255.0
            let g = Double((key >> 8) & 0xff) / 255.0
            let b = Double(key & 0xff) / 255.0
            return ClusterColor(color: Color(red: r, green: g, blue: b), weight: Double(count) / total)
        }
    }
}

@MainActor
final class PaletteStore: ObservableObject {
    static let shared = PaletteStore()
    @Published private(set) var clusters: [String: [ClusterColor]] = [:]

    func load(trackId: String, url: URL) async {
        if clusters[trackId] != nil { return }
        let extracted = await Self.extract(from: url)
        guard let extracted else { return }
        clusters[trackId] = extracted
    }

    private static func extract(from url: URL) async -> [ClusterColor]? {
        await Task.detached(priority: .userInitiated) {
            guard let (data, _) = try? await URLSession.shared.data(from: url),
                  let ui = UIImage(data: data),
                  let cg = ui.cgImage else { return nil as [ClusterColor]? }
            return PaletteClustering.clusters(from: cg)
        }.value
    }
}

// MARK: - Display model

struct MoodTrack: Identifiable, Hashable {
    let seed: FeedSeed
    let song: Song?

    var id: String { seed.trackId }

    var trackId: String { seed.trackId }
    var mood: MoodPalette { seed.mood }
    var sessionTitle: String { seed.sessionTitle }
    var chatHint: String { seed.chatHint }
    var lyrics: [String] { seed.lyrics }
    var currentLyricIndex: Int { seed.currentLyricIndex }

    var songName: String { song?.title ?? seed.fallbackSong }
    var artist: String { song?.artistName ?? seed.fallbackArtist }
    var albumEn: String { song?.albumTitle ?? seed.fallbackAlbumEn }
    var albumCn: String { seed.fallbackAlbumCn }
    var albumSub: String {
        if let year = song?.releaseDate.map({ Calendar.current.component(.year, from: $0) }),
           let label = song?.albumTitle {
            return "\(year) · \(label.prefix(12))"
        }
        return seed.fallbackAlbumSub
    }

    var currentTime: String { "0:24" }
    var totalTime: String {
        guard let dur = song?.duration else { return "3:43" }
        let m = Int(dur) / 60
        let s = Int(dur) % 60
        return String(format: "%d:%02d", m, s)
    }
    var progress: Double { 0.12 }

    var artworkURL: URL? {
        song?.artwork?.url(width: 600, height: 600)
    }

    var artPalette: ArtPalette? {
        guard let art = song?.artwork else { return nil }
        return ArtPalette(
            background: art.backgroundColor.map { Color(cgColor: $0) },
            primary: art.primaryTextColor.map { Color(cgColor: $0) },
            secondary: art.secondaryTextColor.map { Color(cgColor: $0) },
            tertiary: art.tertiaryTextColor.map { Color(cgColor: $0) },
            quaternary: art.quaternaryTextColor.map { Color(cgColor: $0) }
        )
    }

    var ink: Color { Color.pageInk }
    var ink2: Color { Color.pageInk.opacity(0.72) }
    var ink3: Color { Color.pageInk.opacity(0.5) }
    var ink4: Color { Color.pageInk.opacity(0.28) }
    var ruleColor: Color { Color.pageInk.opacity(0.18) }
    var chipBg: Color { Color.pageInk.opacity(0.08) }
    var coverBtnBase: Color { Color.pageBg }

    func hash(into hasher: inout Hasher) {
        hasher.combine(seed.trackId)
        hasher.combine(song?.id)
    }
    static func == (lhs: MoodTrack, rhs: MoodTrack) -> Bool {
        lhs.seed.trackId == rhs.seed.trackId && lhs.song?.id == rhs.song?.id
    }
}

// MARK: - Playback controller

@MainActor
final class PlaybackController: ObservableObject {
    static let shared = PlaybackController()

    private let player = AVPlayer()
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var statusObserver: NSKeyValueObservation?

    let trackEnded = PassthroughSubject<Void, Never>()

    @Published private(set) var isPlaying: Bool = false
    @Published private(set) var currentTime: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var currentSongId: String?
    @Published private(set) var lastError: String?
    @Published private(set) var isSeeking: Bool = false

    private init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)

        let interval = CMTime(seconds: 0.3, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] t in
            Task { @MainActor in
                guard let self, !self.isSeeking else { return }
                self.currentTime = CMTimeGetSeconds(t)
                self.isPlaying = self.player.timeControlStatus == .playing
            }
        }
    }

    func load(song: Song, trackId: String, autoPlayIfPossible: Bool = true) async {
        if currentSongId == trackId {
            if autoPlayIfPossible && !isPlaying { player.play() }
            return
        }

        guard let url = song.previewAssets?.first?.url else {
            lastError = "No preview available for this track"
            return
        }

        let wasPlaying = isPlaying
        currentSongId = trackId
        currentTime = 0
        duration = 30 // preview is ~30s; replaced once item is ready

        let item = AVPlayerItem(url: url)

        statusObserver?.invalidate()
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .readyToPlay else { return }
            let d = CMTimeGetSeconds(item.duration)
            guard d.isFinite, d > 0 else { return }
            Task { @MainActor in self?.duration = d }
        }

        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.isPlaying = false
                self.trackEnded.send(())
            }
        }

        player.replaceCurrentItem(with: item)
        if wasPlaying || autoPlayIfPossible {
            player.play()
        }
        lastError = nil
    }

    func togglePlayPause() {
        if isPlaying {
            player.pause()
        } else {
            player.play()
        }
    }

    func seek(toFraction fraction: Double, completion: (() -> Void)? = nil) {
        guard duration > 0 else { completion?(); return }
        let target = max(0, min(duration, duration * fraction))
        currentTime = target
        isSeeking = true
        let cm = CMTime(seconds: target, preferredTimescale: 600)
        player.seek(to: cm, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor in
                self?.isSeeking = false
                completion?()
            }
        }
    }
}
