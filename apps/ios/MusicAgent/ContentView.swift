import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = MoodFeedViewModel()
    @ObservedObject private var playback = PlaybackController.shared
    @ObservedObject private var palette = PaletteStore.shared
    @State private var currentId: String?
    @State private var chatOpen: Bool = false

    private var currentTrack: MoodTrack? {
        guard !viewModel.tracks.isEmpty else { return nil }
        if let id = currentId, let t = viewModel.tracks.first(where: { $0.id == id }) {
            return t
        }
        return viewModel.tracks.first
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                // 1. Full-screen mood background
                backgroundLayer
                    .ignoresSafeArea()

                // 2. Full-screen paginated inner feed — scrolls BEHIND chrome
                innerFeed(topPad: proxy.safeAreaInsets.top + 56,
                          bottomPad: max(proxy.safeAreaInsets.bottom, 12) + 110)

                // 3. Transparent chrome overlay
                VStack(spacing: 0) {
                    headerLayer
                        .padding(.horizontal, 18)
                    Spacer(minLength: 0)
                    bottomLayer
                        .padding(.horizontal, 18)
                        .padding(.bottom, 4)
                }

                // DEBUG overlay
                VStack {
                    Spacer()
                    DebugStrip(viewModel: viewModel, playback: playback, currentId: currentId)
                        .padding(.bottom, 2)
                }
                .allowsHitTesting(false)
            }
        }
        .foregroundStyle(currentTrack?.ink ?? .white)
        .animation(.easeInOut(duration: 0.45), value: currentId)
        .background(Color.pageBg)
        .sheet(isPresented: $chatOpen) {
            ChatSheet(track: currentTrack)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(.ultraThinMaterial)
        }
        .task { await viewModel.load() }
        .onAppear {
            if currentId == nil { currentId = viewModel.tracks.first?.id }
        }
        .onChange(of: viewModel.tracks.first?.id) { _, newFirst in
            if currentId == nil { currentId = newFirst }
        }
        .onChange(of: currentId) { _, newId in
            loadCurrent(id: newId, autoPlay: true)
            extractPalette(id: newId)
        }
        .onReceive(playback.trackEnded) { _ in
            advanceToNext()
        }
        .onReceive(viewModel.$tracks) { newTracks in
            guard newTracks.contains(where: { $0.song != nil }) else { return }
            loadCurrent(id: currentId, autoPlay: false, in: newTracks)
            for track in newTracks where track.song != nil {
                if let url = track.artworkURL {
                    Task { await palette.load(trackId: track.id, url: url) }
                }
            }
        }
    }

    private func extractPalette(id: String?) {
        guard let id,
              let track = viewModel.tracks.first(where: { $0.id == id }),
              let url = track.artworkURL else { return }
        Task { await palette.load(trackId: id, url: url) }
    }

    private func advanceToNext() {
        guard let id = currentId,
              let idx = viewModel.tracks.firstIndex(where: { $0.id == id }) else { return }
        let nextIdx = idx + 1 < viewModel.tracks.count ? idx + 1 : 0
        withAnimation(.easeInOut(duration: 0.45)) {
            currentId = viewModel.tracks[nextIdx].id
        }
    }

    private func loadCurrent(id: String?, autoPlay: Bool, in tracks: [MoodTrack]? = nil) {
        let list = tracks ?? viewModel.tracks
        guard let id,
              let track = list.first(where: { $0.id == id }),
              let song = track.song else { return }
        Task { await playback.load(song: song, trackId: id, autoPlayIfPossible: autoPlay) }
    }

    // MARK: Fixed background with cross-fade
    @ViewBuilder
    private var backgroundLayer: some View {
        if let t = currentTrack {
            let clusters = palette.clusters[t.id] ?? []
            BlurredMoodBackground(mood: t.mood, art: t.artPalette, clusters: clusters)
                .id("bg-\(t.id)-\(clusters.count)")
                .transition(.opacity)
        } else {
            Color.pageBg
        }
    }

    // MARK: Fixed header
    @ViewBuilder
    private var headerLayer: some View {
        if let t = currentTrack {
            TopBar(title: t.sessionTitle, ink: t.ink2)
                .id("hd-\(t.id)")
                .transition(.opacity)
        } else {
            TopBar(title: "", ink: .white)
        }
    }

    // MARK: Scrollable inner card — full-screen, scrolls BEHIND chrome
    private func innerFeed(topPad: CGFloat, bottomPad: CGFloat) -> some View {
        GeometryReader { geo in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.tracks) { track in
                        InnerCard(track: track, topPad: topPad, bottomPad: bottomPad)
                            .frame(width: geo.size.width, height: geo.size.height)
                            .id(track.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentId)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
        }
        .ignoresSafeArea()
    }

    // MARK: Fixed bottom chrome
    @ViewBuilder
    private var bottomLayer: some View {
        if let t = currentTrack {
            BottomStack(track: t, onChatTap: { chatOpen = true })
                .id("bt-\(t.id)")
                .transition(.opacity)
        } else {
            Color.clear.frame(height: 0)
        }
    }
}

// MARK: - Inner card (only this pages) — floats over mood background, scrolls behind chrome

struct InnerCard: View {
    let track: MoodTrack
    var topPad: CGFloat = 0
    var bottomPad: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 22) {
                AlbumCover(track: track)
                MetaBlock(track: track)
            }
            .padding(.horizontal, 20)
            Spacer(minLength: 0)
        }
        .padding(.top, topPad)
        .padding(.bottom, bottomPad)
    }
}

// MARK: - Background (blurred color blobs)

struct BlurredMoodBackground: View {
    let mood: MoodPalette
    let art: ArtPalette?
    let clusters: [ClusterColor]

    private var usingClusters: Bool { clusters.count >= 2 }

    private var baseColor: Color {
        if usingClusters { return clusters[0].color }
        return art?.background ?? mood.base
    }
    private func clusterColor(_ i: Int, fallback: Color) -> Color {
        if usingClusters, i < clusters.count { return clusters[i].color }
        return fallback
    }
    private var blob1: Color { clusterColor(1, fallback: art?.primary ?? mood.b1) }
    private var blob2: Color { clusterColor(2, fallback: art?.secondary ?? mood.b2) }
    private var blob3: Color { clusterColor(3, fallback: art?.tertiary ?? mood.b3) }
    private var blob4: Color { clusterColor(4, fallback: art?.quaternary ?? mood.b4) }
    private var blobOpacity: Double { usingClusters ? 0.9 : (art == nil ? 0.95 : 0.55) }
    private var veilColor: Color { usingClusters ? clusters[0].color : (art?.primary ?? mood.ink) }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                baseColor.ignoresSafeArea()

                blob(color: blob1, size: CGSize(width: w * 0.85, height: h * 0.65))
                    .offset(x: -w * 0.35, y: -h * 0.4)
                    .opacity(blobOpacity)

                blob(color: blob2, size: CGSize(width: w * 0.9, height: h * 0.7))
                    .offset(x: w * 0.4, y: -h * 0.38)
                    .opacity(blobOpacity)

                blob(color: blob3, size: CGSize(width: w * 0.95, height: h * 0.7))
                    .offset(x: -w * 0.4, y: h * 0.4)
                    .opacity(blobOpacity)

                blob(color: blob4, size: CGSize(width: w * 0.85, height: h * 0.65))
                    .offset(x: w * 0.4, y: h * 0.4)
                    .opacity(blobOpacity * 0.9)

                blob(color: blob1, size: CGSize(width: w * 0.8, height: h * 0.6))
                    .offset(x: -w * 0.08, y: h * 0.05)
                    .opacity(blobOpacity * 0.6)

                RadialGradient(
                    colors: [veilColor.opacity(0.18), .clear],
                    center: UnitPoint(x: 0.5, y: 0.3),
                    startRadius: 0,
                    endRadius: max(w, h) * 0.9
                )
                .blendMode(.screen)
                .allowsHitTesting(false)
            }
            .clipped()
        }
        .ignoresSafeArea()
    }

    private func blob(color: Color, size: CGSize) -> some View {
        Circle()
            .fill(color)
            .frame(width: size.width, height: size.height)
            .blur(radius: 90)
    }
}

// MARK: - Top bar

struct TopBar: View {
    let title: String
    let ink: Color

    var body: some View {
        HStack {
            Button { } label: {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach([18.0, 18.0, 12.0], id: \.self) { w in
                        Rectangle().frame(width: w, height: 1.6).cornerRadius(1)
                    }
                }
                .foregroundStyle(ink)
            }
            Spacer()
            Text(title)
                .font(.system(size: 14, weight: .medium, design: .serif))
                .foregroundStyle(ink)
            Spacer()
            Button { } label: {
                ZStack {
                    Rectangle().frame(width: 18, height: 1.6)
                    Rectangle().frame(width: 1.6, height: 18)
                }
                .foregroundStyle(ink)
            }
        }
        .frame(height: 40)
    }
}

// MARK: - Album cover

struct AlbumCover: View {
    let track: MoodTrack

    var body: some View {
        artLayer
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .shadow(color: .black.opacity(0.5), radius: 25, x: 0, y: 20)
            .shadow(color: .black.opacity(0.35), radius: 10, x: 0, y: 8)
    }

    @ViewBuilder
    private var artLayer: some View {
        if let url = track.artworkURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    ZStack {
                        image.resizable().scaledToFill()
                        LinearGradient(
                            colors: [.clear, .black.opacity(0.55)],
                            startPoint: UnitPoint(x: 0.5, y: 0.45),
                            endPoint: .bottom
                        )
                    }
                default:
                    gradientArt
                }
            }
        } else {
            gradientArt
        }
    }

    private var gradientArt: some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(
                    colors: [track.mood.c3, track.mood.c4, track.mood.c5],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                RadialGradient(
                    colors: [track.mood.c1, .clear],
                    center: UnitPoint(x: 0.35, y: 0.28),
                    startRadius: 0,
                    endRadius: geo.size.width * 0.55
                )
                RadialGradient(
                    colors: [track.mood.c2, .clear],
                    center: UnitPoint(x: 0.7, y: 0.45),
                    startRadius: 0,
                    endRadius: geo.size.width * 0.6
                )
                LinearGradient(
                    colors: [.clear, .black.opacity(0.55)],
                    startPoint: UnitPoint(x: 0.5, y: 0.4),
                    endPoint: .bottom
                )
            }
        }
    }
}

// MARK: - Meta / lyrics

struct MetaBlock: View {
    let track: MoodTrack

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(track.songName)
                .font(.system(size: 23, weight: .medium, design: .serif))
                .kerning(-0.2)
                .foregroundStyle(track.ink)
            Text(track.artist)
                .font(.system(size: 13.5, weight: .regular, design: .serif))
                .foregroundStyle(track.ink2)
                .padding(.bottom, 6)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(track.lyrics.enumerated()), id: \.offset) { idx, line in
                    Text(line)
                        .font(.system(size: 14.5, weight: idx == track.currentLyricIndex ? .medium : .regular, design: .serif))
                        .foregroundStyle(idx == track.currentLyricIndex ? track.ink : track.ink4)
                        .lineSpacing(6)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Progress + chat

struct BottomStack: View {
    let track: MoodTrack
    var onChatTap: () -> Void = {}

    var body: some View {
        VStack(spacing: 14) {
            ProgressRow(track: track)
            ChatPill(track: track, onTap: onChatTap)
        }
    }
}

struct ProgressRow: View {
    let track: MoodTrack
    @ObservedObject private var playback = PlaybackController.shared
    @State private var dragFraction: Double?

    private var isActive: Bool { playback.currentSongId == track.id }
    private var liveCurrent: TimeInterval { isActive ? playback.currentTime : 0 }
    private var liveDuration: TimeInterval {
        if isActive && playback.duration > 0 { return playback.duration }
        return track.song?.duration ?? 0
    }
    private var playbackFraction: Double {
        guard liveDuration > 0 else { return 0 }
        return min(1, max(0, liveCurrent / liveDuration))
    }
    private var displayFraction: Double { dragFraction ?? playbackFraction }
    private var displayedCurrent: TimeInterval { displayFraction * liveDuration }
    private var currentLabel: String { formatTime(displayedCurrent) }
    private var totalLabel: String {
        liveDuration > 0 ? formatTime(liveDuration) : track.totalTime
    }
    private var showingPause: Bool { isActive && playback.isPlaying }
    private var isScrubbing: Bool { dragFraction != nil }

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                GeometryReader { geo in
                    let barHeight: CGFloat = isScrubbing ? 7 : 3
                    let thumbSize: CGFloat = 14
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(track.ruleColor)
                            .frame(height: barHeight)
                        Capsule()
                            .fill(track.ink.opacity(0.92))
                            .frame(width: max(barHeight, geo.size.width * displayFraction), height: barHeight)
                            .animation(isScrubbing ? nil : .linear(duration: 0.35), value: displayFraction)
                        if isScrubbing {
                            Circle()
                                .fill(track.ink)
                                .frame(width: thumbSize, height: thumbSize)
                                .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
                                .offset(x: max(0, geo.size.width * displayFraction) - thumbSize / 2)
                        }
                    }
                    .frame(maxHeight: .infinity, alignment: .center)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { v in
                                guard liveDuration > 0 else { return }
                                if dragFraction == nil {
                                    UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.7)
                                }
                                let f = min(1, max(0, v.location.x / geo.size.width))
                                dragFraction = f
                            }
                            .onEnded { _ in
                                if let f = dragFraction {
                                    UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.5)
                                    playback.seek(toFraction: f) {
                                        dragFraction = nil
                                    }
                                } else {
                                    dragFraction = nil
                                }
                            }
                    )
                }
                .frame(height: 22)

                HStack {
                    Text(currentLabel)
                        .font(.system(size: 11, weight: .regular, design: .serif))
                        .monospacedDigit()
                        .foregroundStyle(track.ink3)
                    Spacer()
                    Text(totalLabel)
                        .font(.system(size: 11, weight: .regular, design: .serif))
                        .monospacedDigit()
                        .foregroundStyle(track.ink3)
                }
            }

            Button { playback.togglePlayPause() } label: {
                ZStack {
                    Circle()
                        .fill(track.ink)
                        .frame(width: 42, height: 42)
                    Image(systemName: showingPause ? "pause.fill" : "play.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(track.coverBtnBase)
                        .offset(x: showingPause ? 0 : 1)
                }
            }
            .buttonStyle(.plain)
        }
    }

    private func formatTime(_ t: TimeInterval) -> String {
        guard t.isFinite, t >= 0 else { return "0:00" }
        let total = Int(t)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

struct ChatPill: View {
    let track: MoodTrack
    var onTap: () -> Void = {}
    @State private var blink = false

    var body: some View {
        HStack(spacing: 6) {
            Rectangle()
                .fill(track.ink3)
                .frame(width: 1, height: 14)
                .opacity(blink ? 0 : 0.7)
            Text(track.chatHint)
                .font(.system(size: 14.5, weight: .regular, design: .serif))
                .foregroundStyle(track.ink3)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().fill(track.chipBg))
        .overlay(Capsule().stroke(track.ruleColor, lineWidth: 1))
        .contentShape(Capsule())
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.6)
            onTap()
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
                blink = true
            }
        }
    }
}

// MARK: - Chat sheet host (React Native bridge drops in here)

struct ChatSheet: View {
    let track: MoodTrack?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ChatHostRepresentable(track: track)
            .ignoresSafeArea()
    }
}

/// Hosts the React Native `RCTRootView` (registered JS module name: `MobileChat`).
/// When RN is wired up (Podfile + bridge), replace the placeholder view with the real
/// `RCTRootView`. See `apps/mobile-chat/README.md` for integration steps.
struct ChatHostRepresentable: UIViewControllerRepresentable {
    let track: MoodTrack?

    func makeUIViewController(context: Context) -> UIViewController {
        let vc = UIViewController()
        vc.view.backgroundColor = .clear
        let label = UILabel()
        label.text = "Chat / GenUI\n(React Native host — not yet wired)"
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = UIColor(white: 1, alpha: 0.75)
        label.font = .systemFont(ofSize: 15, weight: .regular)
        label.translatesAutoresizingMaskIntoConstraints = false
        vc.view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: vc.view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: vc.view.centerYAnchor),
            label.widthAnchor.constraint(lessThanOrEqualTo: vc.view.widthAnchor, constant: -32)
        ])
        return vc
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

struct DebugStrip: View {
    @ObservedObject var viewModel: MoodFeedViewModel
    @ObservedObject var playback: PlaybackController
    let currentId: String?

    var body: some View {
        let songCount = viewModel.tracks.filter { $0.song != nil }.count
        let current = currentId.flatMap { id in viewModel.tracks.first(where: { $0.id == id }) }
        let hasPreview = current?.song?.previewAssets?.first?.url != nil
        VStack(spacing: 1) {
            Text("auth=\(authLabel) songs=\(songCount)/\(viewModel.tracks.count) preview=\(hasPreview ? "y" : "n")")
            if let err = viewModel.loadError { Text("feed: \(err)") }
            if let err = playback.lastError { Text("play: \(err)") }
        }
        .font(.system(size: 9, design: .monospaced))
        .foregroundStyle(.white.opacity(0.9))
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Color.black.opacity(0.55))
        .cornerRadius(4)
    }

    private var authLabel: String {
        switch viewModel.authStatus {
        case .notDetermined: return "?"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .authorized: return "ok"
        @unknown default: return "?"
        }
    }
}

#Preview {
    ContentView().preferredColorScheme(.dark)
}
