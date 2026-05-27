import SwiftUI

enum LyricsLevel: Int { case idle = 0, half = 1, full = 2 }

struct ContentView: View {
    @StateObject private var viewModel = MoodFeedViewModel()
    @ObservedObject private var playback = PlaybackController.shared
    @ObservedObject private var palette = PaletteStore.shared
    @State private var currentId: String?
    @State private var chatOpen: Bool = false
    @State private var lyricsLevel: LyricsLevel = .idle
    @Namespace private var chatNS

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

                // 2. Full-screen paginated inner feed — scrolls BEHIND chrome.
                //    When lyrics is fully expanded, the chrome is gone so the
                //    card reclaims that 110pt for lyrics.
                innerFeed(topPad: proxy.safeAreaInsets.top + 56,
                          bottomPad: lyricsLevel == .full
                              ? max(proxy.safeAreaInsets.bottom, 12)
                              : max(proxy.safeAreaInsets.bottom, 12) + 110)

                // 3. Transparent chrome overlay. Pill is hidden while chat is
                //    open so its matchedGeometryEffect partner (composer in
                //    ChatOverlay) is the single source — SwiftUI morphs.
                VStack(spacing: 0) {
                    headerLayer
                        .padding(.horizontal, 18)
                    Spacer(minLength: 0)
                    if !chatOpen && lyricsLevel != .full {
                        bottomLayer
                            .padding(.horizontal, 18)
                            .padding(.bottom, 4)
                            .transition(.move(edge: .bottom))
                    }
                }

                // 4. Chat overlay — custom sheet clone (grab handle, detents,
                //    drag-to-dismiss, rubber-band overdrag) with the pill
                //    morphing into the composer at the bottom.
                if chatOpen {
                    ChatOverlay(
                        track: currentTrack,
                        namespace: chatNS,
                        bottomSafeInset: proxy.safeAreaInsets.bottom,
                        isOpen: $chatOpen
                    )
                    .zIndex(5)
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
        .task { await viewModel.load() }
        .onAppear {
            if currentId == nil { currentId = viewModel.tracks.first?.id }
        }
        .onChange(of: viewModel.tracks.first?.id) { _, newFirst in
            if currentId == nil { currentId = newFirst }
        }
        .onChange(of: currentId) { _, newId in
            // Swipe between cards: carry playing/paused intent forward.
            loadCurrent(id: newId, policy: .continueIfPlaying)
            extractPalette(id: newId)
            // Reset lyrics to idle when user swipes to a different track —
            // each card manages its own lyrics state cleanly.
            if lyricsLevel != .idle {
                withAnimation(lyricsSpring) {
                    lyricsLevel = .idle
                }
            }
        }
        .onReceive(playback.trackEnded) { _ in
            advanceToNext()
        }
        .onReceive(viewModel.$tracks) { newTracks in
            // Initial metadata fetch resolved — preload current track so it's
            // ready to play the instant user taps play (but don't auto-start).
            guard newTracks.contains(where: { $0.song != nil }) else { return }
            loadCurrent(id: currentId, policy: .preload, in: newTracks)
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
        let nextTrack = viewModel.tracks[nextIdx]
        // Load with forcePlay BEFORE the currentId change so onChange's idempotent
        // load is a no-op (same trackId). Then animate scroll.
        if let song = nextTrack.song {
            Task { await playback.load(song: song, trackId: nextTrack.id, policy: .forcePlay) }
        }
        withAnimation(.easeInOut(duration: 0.45)) {
            currentId = nextTrack.id
        }
    }

    private func loadCurrent(id: String?, policy: PlaybackController.LoadPolicy, in tracks: [MoodTrack]? = nil) {
        let list = tracks ?? viewModel.tracks
        guard let id,
              let track = list.first(where: { $0.id == id }),
              let song = track.song else { return }
        Task { await playback.load(song: song, trackId: id, policy: policy) }
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
                        InnerCard(
                            track: track,
                            topPad: topPad,
                            bottomPad: bottomPad,
                            lyricsLevel: track.id == currentId ? lyricsLevel : .idle,
                            onToggleLyrics: toggleLyrics
                        )
                        .frame(width: geo.size.width, height: geo.size.height)
                        .id(track.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentId)
            .scrollDisabled(lyricsLevel != .idle)
            .scrollContentBackground(.hidden)
            .background(Color.clear)
            .simultaneousGesture(
                DragGesture(minimumDistance: 24)
                    .onEnded { v in
                        // Only active when lyrics is at least half-expanded —
                        // drag up → full, drag down → collapse one level.
                        guard lyricsLevel != .idle else { return }
                        let dy = v.translation.height
                        if dy < -60 && lyricsLevel == .half {
                            setLyricsLevel(.full)
                        } else if dy > 60 {
                            setLyricsLevel(lyricsLevel == .full ? .half : .idle)
                        }
                    }
            )
        }
        .ignoresSafeArea()
    }

    // Sheet-like spring: slower response, a touch more bounce so the chrome's
    // slide-off feels weighty (matches iOS native sheet dismissal timing).
    private var lyricsSpring: Animation {
        .spring(response: 0.55, dampingFraction: 0.82)
    }

    private func toggleLyrics() {
        withAnimation(lyricsSpring) {
            lyricsLevel = (lyricsLevel == .idle) ? .half : .idle
        }
    }

    private func setLyricsLevel(_ level: LyricsLevel) {
        withAnimation(lyricsSpring) {
            lyricsLevel = level
        }
    }

    // MARK: Fixed bottom chrome
    @ViewBuilder
    private var bottomLayer: some View {
        if let t = currentTrack {
            BottomStack(
                track: t,
                namespace: chatNS,
                onChatTap: {
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
                        chatOpen = true
                    }
                }
            )
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
    var lyricsLevel: LyricsLevel = .idle
    var onToggleLyrics: () -> Void = {}
    @Namespace private var morphNS

    private var coverSize: CGFloat? {
        switch lyricsLevel {
        case .idle: return nil           // fills available width
        case .half: return 96
        case .full: return 44
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            headerRow
                .padding(.horizontal, 20)
                .padding(.top, 12)

            if lyricsLevel == .idle {
                Spacer(minLength: 0)
            } else {
                LyricsScroll(track: track)
                    .padding(.top, 16)
                    .padding(.horizontal, 20)
                    // Delay the fade-in so the cover/meta matchedGeometry morph
                    // finishes first — otherwise the scroll's first line renders
                    // mid-frame at an interpolated position and flashes.
                    .transition(.asymmetric(
                        insertion: .opacity.animation(.easeOut(duration: 0.22).delay(0.22)),
                        removal: .opacity.animation(.easeOut(duration: 0.12))
                    ))
            }
        }
        .padding(.top, topPad)
        .padding(.bottom, bottomPad)
    }

    @ViewBuilder
    private var headerRow: some View {
        if lyricsLevel == .idle {
            VStack(alignment: .leading, spacing: 22) {
                AlbumCover(track: track)
                    .matchedGeometryEffect(id: "cover", in: morphNS, anchor: .topLeading)

                VStack(alignment: .leading, spacing: 4) {
                    Text(track.songName)
                        .font(.display(size: 23, weight: .medium))
                        .kerning(-0.2)
                        .foregroundStyle(track.ink)
                    Text(track.artist)
                        .font(.system(size: 13.5, weight: .regular))
                        .foregroundStyle(track.ink2)
                        .padding(.bottom, 6)
                    // 3-line lyric preview — tap to expand.
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(track.lyrics.enumerated()), id: \.offset) { idx, line in
                            Text(line)
                                .font(.display(size: 14.5,
                                               weight: idx == track.currentLyricIndex ? .medium : .regular))
                                .foregroundStyle(idx == track.currentLyricIndex ? track.ink : track.ink4)
                                .lineSpacing(6)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.5)
                        onToggleLyrics()
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            HStack(alignment: .center, spacing: 14) {
                AlbumCover(track: track)
                    .frame(width: coverSize, height: coverSize)
                    .matchedGeometryEffect(id: "cover", in: morphNS, anchor: .topLeading)
                VStack(alignment: .leading, spacing: 3) {
                    Text(track.songName)
                        .font(.display(size: 18, weight: .medium))
                        .kerning(-0.2)
                        .foregroundStyle(track.ink)
                        .lineLimit(1)
                    Text(track.artist)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(track.ink2)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Button(action: onToggleLyrics) {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(track.ink3)
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Lyrics scroll (half + full panel content)

struct LyricsScroll: View {
    let track: MoodTrack

    private var lines: [String] {
        Array(repeating: track.lyrics, count: 6).flatMap { $0 }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                ForEach(lines.indices, id: \.self) { i in
                    let isActive = i % max(track.lyrics.count, 1) == track.currentLyricIndex
                    Text(lines[i])
                        .font(.display(size: 26,
                                       weight: isActive ? .semibold : .medium))
                        .foregroundStyle(isActive ? track.ink : track.ink4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 60)
        }
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
                .font(.display(size: 14, weight: .medium))
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

// MARK: - Progress + chat

struct BottomStack: View {
    let track: MoodTrack
    let namespace: Namespace.ID
    var onChatTap: () -> Void = {}

    var body: some View {
        VStack(spacing: 14) {
            ProgressRow(track: track)
            ChatBar(track: track, mode: .pill(onTap: onChatTap))
                .matchedGeometryEffect(id: "composer", in: namespace)
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
        HStack(alignment: .center, spacing: 12) {
            Text(currentLabel)
                .font(.system(size: 12, weight: .regular))
                .monospacedDigit()
                .foregroundStyle(track.ink3)

            GeometryReader { geo in
                let barHeight: CGFloat = isScrubbing ? 6 : 3
                let thumbSize: CGFloat = 10
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(track.ruleColor)
                        .frame(height: barHeight)
                    Capsule()
                        .fill(track.ink.opacity(0.92))
                        .frame(width: max(barHeight, geo.size.width * displayFraction), height: barHeight)
                        .animation(isScrubbing ? nil : .linear(duration: 0.35), value: displayFraction)
                    // Always-visible thumb at the end of the fill.
                    Circle()
                        .fill(track.ink)
                        .frame(width: thumbSize, height: thumbSize)
                        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                        .offset(x: max(0, geo.size.width * displayFraction) - thumbSize / 2)
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
                            // Drop the seek if the track advanced mid-drag (auto-play,
                            // user swipe, etc.) — playback.seek acts on the *current*
                            // AVPlayer item, so applying our intended fraction would
                            // hit the wrong song.
                            if let f = dragFraction, isActive {
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

            Text(totalLabel)
                .font(.system(size: 12, weight: .regular))
                .monospacedDigit()
                .foregroundStyle(track.ink3)

            Button {
                if isActive {
                    playback.toggle()
                } else if let song = track.song {
                    Task { await playback.load(song: song, trackId: track.id, policy: .forcePlay) }
                }
            } label: {
                ZStack {
                    Group {
                        if #available(iOS 26.0, *) {
                            Circle()
                                .fill(Color.clear)
                                .glassEffect(.regular, in: Circle())
                        } else {
                            Circle()
                                .fill(.ultraThinMaterial)
                        }
                    }
                    .overlay(Circle().fill(track.chipBg).allowsHitTesting(false))
                    .overlay(Circle().strokeBorder(track.ruleColor, lineWidth: 1).allowsHitTesting(false))
                    .frame(width: 50, height: 50)

                    Image(systemName: showingPause ? "pause.fill" : "play.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(track.ink)
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

// MARK: - ChatBar (single component for collapsed pill + expanded composer)

struct ChatBar: View {
    enum Mode {
        case pill(onTap: () -> Void)            // collapsed on feed — caret + hint
        case composer(
            text: Binding<String>,
            focused: FocusState<Bool>.Binding,
            onSubmit: () -> Void
        )                                        // expanded inside sheet — TextField
    }

    let track: MoodTrack
    let mode: Mode
    var onASR: () -> Void = {}
    var onVoice: () -> Void = {}

    private var isEmpty: Bool {
        if case let .composer(text, _, _) = mode {
            return text.wrappedValue.trimmingCharacters(in: .whitespaces).isEmpty
        }
        return true
    }

    var body: some View {
        let inner = HStack(spacing: 8) {
            content
            Spacer(minLength: 0)
            trailingButtons
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)

        let bar = Group {
            if #available(iOS 26.0, *) {
                inner.glassEffect(.regular, in: Capsule())
            } else {
                inner.background(.ultraThinMaterial, in: Capsule())
            }
        }
        // Decorative overlays must not absorb touches or they swallow the
        // TextField's tap-to-focus event.
        .overlay(Capsule().fill(track.chipBg).allowsHitTesting(false))
        .overlay(Capsule().strokeBorder(track.ruleColor, lineWidth: 1).allowsHitTesting(false))
        .animation(.easeOut(duration: 0.15), value: isEmpty)

        // Only attach a whole-bar tap gesture in pill mode — if we attach it
        // in composer mode it swallows the TextField's tap and breaks focus.
        if case let .pill(onTap) = mode {
            bar
                .contentShape(Capsule())
                .onTapGesture {
                    UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.6)
                    onTap()
                }
        } else {
            bar
        }
    }

    @ViewBuilder
    private var content: some View {
        switch mode {
        case .pill:
            Text(track.chatHint)
                .font(.display(size: 14.5, weight: .regular))
                .foregroundStyle(track.ink3)
        case let .composer(text, focused, onSubmit):
            TextField(track.chatHint, text: text, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...4)
                .font(.display(size: 14.5, weight: .regular))
                .foregroundStyle(track.ink)
                .tint(track.ink)
                .focused(focused)
                .submitLabel(.send)
                .onSubmit(onSubmit)
        }
    }

    @ViewBuilder
    private var trailingButtons: some View {
        // Left slot: mic ↔ send (mic when empty, send when there's text).
        if isEmpty {
            iconButton("mic", action: onASR)
        } else {
            Button {
                if case let .composer(_, _, onSubmit) = mode { onSubmit() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 26))
                    .foregroundStyle(track.ink)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .transition(.scale.combined(with: .opacity))
        }
        // Right slot: voice mode always stays visible.
        iconButton("waveform", action: onVoice)
    }

    private func iconButton(_ system: String, action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.6)
            action()
        } label: {
            Image(systemName: system)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(track.ink3)
                .frame(width: 30, height: 30)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}


// MARK: - Chat overlay (custom sheet clone with hero morph)

struct ChatOverlay: View {
    let track: MoodTrack?
    let namespace: Namespace.ID
    let bottomSafeInset: CGFloat
    @Binding var isOpen: Bool
    @ObservedObject private var store = ConversationStore.shared
    @ObservedObject private var convStore = ConversationsStore.shared
    @ObservedObject private var settings = DebugSettings.shared
    @ObservedObject private var auth = AuthStore.shared
    @State private var text: String = ""
    @FocusState private var focused: Bool
    @State private var detent: Detent = .medium
    @State private var dragOffset: CGFloat = 0   // + = dragging down
    @State private var panel: Panel = .chat
    @State private var creatingSession: Bool = false

    enum Detent { case medium, large }
    enum Panel { case chat, list }

    private func height(for d: Detent, screen: CGFloat) -> CGFloat {
        switch d {
        case .medium: return screen * 0.55
        case .large:  return screen * 0.92
        }
    }

    var body: some View {
        GeometryReader { geo in
            let screen = geo.size.height
            let rest = height(for: detent, screen: screen)
            let maxH = height(for: .large, screen: screen)

            // Rubber-band overdrag above max; clamp min at 140.
            let raw = rest - dragOffset
            let effH: CGFloat = raw > maxH
                ? maxH + pow(raw - maxH, 0.7)
                : max(140, raw)

            let scrim = min(0.48, effH / screen * 0.55)

            ZStack(alignment: .bottom) {
                Color.black.opacity(scrim)
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }

                sheet(height: effH, screen: screen)
            }
        }
        .ignoresSafeArea()
        .onChange(of: focused) { _, isFocused in
            // User tapped the composer — bring up keyboard + expand to large.
            if isFocused && detent != .large {
                setDetent(.large)
            }
        }
    }

    @ViewBuilder
    private func sheet(height: CGFloat, screen: CGFloat) -> some View {
        VStack(spacing: 0) {
            // Drag region: grab handle + collapse button + track meta. Only
            // this area listens for the drag gesture so the TextField below
            // keeps its own tap/focus handling intact.
            VStack(spacing: 0) {
                ZStack {
                    Capsule()
                        .fill(.white.opacity(0.32))
                        .frame(width: 36, height: 5)

                    HStack {
                        Button(action: dismiss) {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.72))
                                .frame(width: 30, height: 30)
                                .contentShape(Rectangle())
                        }
                        if auth.state.isSignedIn {
                            Button(action: togglePanel) {
                                Image(systemName: panel == .chat ? "list.bullet" : "bubble.left")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.72))
                                    .frame(width: 30, height: 30)
                                    .contentShape(Rectangle())
                            }
                        }
                        Spacer()
                        #if DEBUG
                        Button(action: cycleEnv) {
                            HStack(spacing: 4) {
                                Image(systemName: "network")
                                Text(settings.environment.label)
                                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                            }
                            .foregroundStyle(envColor(for: settings.environment))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.black.opacity(0.22))
                            .clipShape(Capsule())
                        }
                        Button(action: cycleMock) {
                            HStack(spacing: 4) {
                                Image(systemName: "ladybug")
                                Text(store.mockLabel)
                                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                            }
                            .foregroundStyle(.white.opacity(0.55))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.black.opacity(0.22))
                            .clipShape(Capsule())
                        }
                        #endif
                    }
                    .padding(.horizontal, 12)
                }
                .padding(.top, 8)
                .padding(.bottom, 10)

                if let t = track {
                    VStack(spacing: 2) {
                        Text(t.songName)
                            .font(.display(size: 13, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.92))
                        Text(t.artist)
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.55))
                    }
                    .padding(.bottom, 8)
                }
            }
            .contentShape(Rectangle())
            .gesture(dragGesture(screen: screen))

            if auth.state.isSignedIn {
                if panel == .chat {
                    // RN is headless — runs useAgentChat and @json-render/react
                    // in the background, pushing parsed messages into
                    // ConversationStore via ChatBridge. SwiftUI renders
                    // everything natively above it.
                    ZStack(alignment: .top) {
                        ChatMessagesView(store: store, track: track)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        if let sid = convStore.activeSessionId {
                            ChatHostRepresentable(sessionId: sid, store: store)
                                .frame(width: 0, height: 0)
                                .accessibilityHidden(true)
                                // Rebuild RN root when env / user flips so
                                // useAgent re-hosts against the right base URL
                                // + identity. Session id is a prop, not a
                                // remount trigger — swapping sessions inside
                                // the same user reuses the JS runtime and only
                                // reconnects the agent WebSocket.
                                .id("\(settings.environment.rawValue):\(auth.state.user?.id ?? "anon")")
                        }
                    }

                    // Composer — morphs from the pill. Bottom padding matches
                    // the pill's exact on-screen position (safeArea.bottom +
                    // 4) so the morph lands at the same y.
                    if let t = track {
                        ChatBar(
                            track: t,
                            mode: .composer(text: $text, focused: $focused, onSubmit: send),
                            onASR: startASR,
                            onVoice: startVoiceMode
                        )
                        .matchedGeometryEffect(id: "composer", in: namespace)
                        .padding(.horizontal, 18)
                        .padding(.bottom, bottomSafeInset + 4)
                    }
                } else {
                    ConversationsView(
                        store: convStore,
                        track: track,
                        userId: auth.state.user?.id,
                        onSelect: { id in selectConversation(id: id) },
                        onNew: { newConversation() }
                    )
                    .transition(.opacity)
                }
            } else {
                SignInGate(auth: auth, track: track)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.28), value: auth.state.isSignedIn)
        .animation(.easeOut(duration: 0.22), value: panel)
        .task(id: auth.state.user?.id ?? "") {
            guard let uid = auth.state.user?.id else { return }
            convStore.loadActiveSession(userId: uid)
            await convStore.refresh(userId: uid)
        }
        .onChange(of: settings.environment) { _, _ in
            // Env swap: clear list + active id, then reload for the new host.
            convStore.activeSessionId = nil
            store.cancelMockStream()
        store.replace(messages: [])
            if let uid = auth.state.user?.id {
                Task { await convStore.refresh(userId: uid) }
            }
        }
        .onChange(of: convStore.activeSessionId) { _, newId in
            if let uid = auth.state.user?.id {
                convStore.persistActiveSession(userId: uid)
                if newId != nil { convStore.startTitlePollingIfNeeded(userId: uid) }
                else { convStore.stopTitlePolling() }
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .background(sheetBackground)
        .transition(.move(edge: .bottom))
    }

    private func startASR() {
        // TODO: Speech framework → stream transcript into `text`.
    }

    private func startVoiceMode() {
        // TODO: push a voice-mode surface (realtime API).
    }

    private var sheetShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            cornerRadii: .init(topLeading: 28, topTrailing: 28),
            style: .continuous
        )
    }

    @ViewBuilder
    private var sheetBackground: some View {
        Group {
            if #available(iOS 26.0, *) {
                sheetShape
                    .fill(Color.clear)
                    .glassEffect(.regular, in: sheetShape)
                    .overlay(sheetShape.fill(Color.black.opacity(0.3)))
                    .overlay(sheetShape.strokeBorder(.white.opacity(0.10), lineWidth: 1))
            } else {
                sheetShape
                    .fill(.ultraThinMaterial)
                    .overlay(sheetShape.fill(Color.black.opacity(0.22)))
                    .overlay(sheetShape.strokeBorder(.white.opacity(0.08), lineWidth: 1))
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .shadow(color: .black.opacity(0.35), radius: 30, y: -4)
    }

    private func dragGesture(screen: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { v in
                dragOffset = v.translation.height
            }
            .onEnded { v in
                let predicted = v.predictedEndTranslation.height
                let currentH = height(for: detent, screen: screen) - dragOffset

                if detent == .medium && predicted > 180 {
                    dismiss(); return
                }
                if detent == .large && predicted > 200 {
                    setDetent(.medium); return
                }
                if predicted < -160 && detent == .medium {
                    setDetent(.large); return
                }
                // Snap to nearest.
                let candidates: [Detent] = [.medium, .large]
                let nearest = candidates.min(by: {
                    abs(height(for: $0, screen: screen) - currentH) <
                    abs(height(for: $1, screen: screen) - currentH)
                }) ?? .medium
                setDetent(nearest)
            }
    }

    private func setDetent(_ d: Detent) {
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            detent = d
            dragOffset = 0
        }
    }

    private func send() {
        let msg = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !msg.isEmpty else { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.5)

        // Mirror `apps/web/src/hooks/useChat.ts`: if no session is active
        // yet, call `POST /api/session/create` first so we have a sticky id
        // to route the RN websocket to, then emit the user message. The
        // pendingUserMessage nonce + sessionId both propagate via
        // appProperties in the same React render so useAgent reconnects and
        // sendMessage fires against the new DO.
        if convStore.activeSessionId == nil {
            guard let uid = auth.state.user?.id, !creatingSession else { return }
            creatingSession = true
            text = ""
            Task {
                defer { creatingSession = false }
                guard let id = await convStore.create(userId: uid) else { return }
                convStore.activeSessionId = id
                store.cancelMockStream()
        store.replace(messages: [])
                store.sendUser(msg)
            }
        } else {
            store.sendUser(msg)
            text = ""
        }
    }

    private func togglePanel() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.5)
        focused = false
        withAnimation(.easeOut(duration: 0.22)) {
            panel = (panel == .chat) ? .list : .chat
        }
    }

    private func selectConversation(id: String) {
        convStore.activeSessionId = id
        // Clear UI immediately; useAgentChat replays persisted history from
        // the Durable Object once the new WebSocket connects.
        store.cancelMockStream()
        store.replace(messages: [])
        withAnimation(.easeOut(duration: 0.22)) {
            panel = .chat
        }
    }

    private func newConversation() {
        guard let uid = auth.state.user?.id, !creatingSession else { return }
        creatingSession = true
        Task {
            defer { creatingSession = false }
            if let id = await convStore.create(userId: uid) {
                convStore.activeSessionId = id
                store.cancelMockStream()
        store.replace(messages: [])
                await MainActor.run {
                    withAnimation(.easeOut(duration: 0.22)) {
                        panel = .chat
                    }
                }
            }
        }
    }

    #if DEBUG
    private func cycleMock() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.4)
        store.cycleMockScenario()
    }

    private func cycleEnv() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.5)
        settings.cycleEnvironment()
        // Different env = different cookies, different user, different
        // conversation history. Wipe everything and re-bootstrap so the UI
        // reflects the new backend identity instead of stale state.
        store.cancelMockStream()
        store.replace(messages: [])
        APIClient.shared.clearSessionCookies()
        Task { await auth.bootstrap() }
    }

    private func envColor(for env: AgentEnvironment) -> Color {
        switch env {
        case .production: return Color(red: 0.85, green: 0.75, blue: 0.55)  // warm cream (prod = default)
        case .preview:    return Color(red: 0.55, green: 0.75, blue: 0.95)  // cool blue (staging)
        case .local:      return Color(red: 0.95, green: 0.65, blue: 0.55)  // warning orange
        }
    }
    #endif

    private func dismiss() {
        focused = false
        withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
            isOpen = false
            dragOffset = 0
        }
    }
}

/// Headless RN host: runs `useAgentChat` + `@json-render/react` (see
/// `apps/mobile-chat/App.tsx`) and pushes parsed messages back through
/// `ChatBridge`. Nothing here is visible — SwiftUI renders the message list
/// itself. Native → JS flows via `appProperties` (sessionId + pendingUserMessage).
struct ChatHostRepresentable: UIViewControllerRepresentable {
    let sessionId: String
    @ObservedObject var store: ConversationStore

    func makeUIViewController(context: Context) -> UIViewController {
        let vc = UIViewController()
        vc.view.backgroundColor = .clear
        vc.view.isUserInteractionEnabled = false

        let rnView = ReactNativeHost.shared.makeRootView(
            moduleName: "MobileChat",
            initialProperties: props()
        )
        rnView.backgroundColor = .clear
        rnView.translatesAutoresizingMaskIntoConstraints = false
        vc.view.addSubview(rnView)
        NSLayoutConstraint.activate([
            rnView.topAnchor.constraint(equalTo: vc.view.topAnchor),
            rnView.bottomAnchor.constraint(equalTo: vc.view.bottomAnchor),
            rnView.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor),
            rnView.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor)
        ])
        context.coordinator.rootView = rnView
        context.coordinator.lastKey = propsKey()
        return vc
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        // SwiftUI calls updateUIViewController on every ancestor body
        // re-render. Push to RN only when the outbound state actually
        // changes — session switches and user-message nonces both need to
        // propagate; unrelated parent re-renders don't.
        let key = propsKey()
        guard context.coordinator.lastKey != key else { return }
        context.coordinator.lastKey = key
        context.coordinator.rootView?.setValue(props(), forKey: "appProperties")
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        weak var rootView: UIView?
        var lastKey: String = ""
    }

    private func propsKey() -> String {
        "\(sessionId)|\(store.pendingUserMessage?.nonce ?? "")"
    }

    private func props() -> [String: Any] {
        var out: [String: Any] = [
            "baseUrl": DebugSettings.shared.environment.baseUrl,
            "sessionId": sessionId,
            "userId": AuthStore.shared.state.user?.id ?? "anon",
            "storefront": "us",
            // Every component this iOS client can render. Agent reads this on
            // the request body and narrows the model's allowed component
            // vocabulary so we never get an "unknown" fallback card.
            "genuiWhitelist": GenUIComponent.supportedTypes
        ]
        if let cmd = store.pendingUserMessage {
            out["pendingUserMessage"] = ["text": cmd.text, "nonce": cmd.nonce]
        }
        return out
    }
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
