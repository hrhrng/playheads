import SwiftUI

struct RecordPlayerView: View {
    let playerViewModel: PlayerViewModel
    @State private var rotation: Double = 0

    var body: some View {
        VStack(spacing: 24) {
            // Vinyl Record
            ZStack {
                // Glow effect
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Color.honey400.opacity(0.15), Color.honey400.opacity(0)],
                            center: .center,
                            startRadius: 60,
                            endRadius: 160
                        )
                    )
                    .frame(width: 300, height: 300)
                    .blur(radius: 20)

                // Glass plate under the record
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 275, height: 275)
                    .overlay(
                        Circle()
                            .stroke(Color.white.opacity(0.3), lineWidth: 0.5)
                    )
                    .shadow(color: .honey900.opacity(0.08), radius: 20, x: 0, y: 10)

                // Record
                ZStack {
                    // Outer disc
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Color.honey900.opacity(0.9), Color.honey900],
                                center: .center,
                                startRadius: 20,
                                endRadius: 140
                            )
                        )
                        .frame(width: 260, height: 260)
                        .shadow(color: .honey900.opacity(0.2), radius: 20, x: 0, y: 10)

                    // Groove rings
                    ForEach(0..<5) { i in
                        Circle()
                            .stroke(Color.white.opacity(0.05), lineWidth: 0.5)
                            .frame(width: CGFloat(80 + i * 35), height: CGFloat(80 + i * 35))
                    }

                    // Center artwork or label
                    if let track = playerViewModel.nowPlaying,
                       let url = track.artworkURL {
                        AsyncImage(url: url) { image in
                            image.resizable()
                                .aspectRatio(contentMode: .fill)
                        } placeholder: {
                            centerLabel
                        }
                        .frame(width: 90, height: 90)
                        .clipShape(Circle())
                    } else {
                        centerLabel
                    }
                }
                .rotationEffect(.degrees(rotation))
                .onAppear { startRotation() }
                .onChange(of: playerViewModel.isPlaying) {
                    if playerViewModel.isPlaying {
                        startRotation()
                    }
                }
            }

            // Track Info
            if let track = playerViewModel.nowPlaying {
                VStack(spacing: 4) {
                    Text(track.name)
                        .font(.headline)
                        .foregroundColor(.honey900)
                        .lineLimit(1)

                    Text(track.artist)
                        .font(.subheadline)
                        .foregroundColor(.honey900.opacity(0.6))
                        .lineLimit(1)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .liquidGlass(cornerRadius: 16, opacity: 0.3, bordered: false)
            } else {
                Text("No Track Playing")
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(.honey900.opacity(0.4))
            }

            // Playback Controls
            PlaybackControls(playerViewModel: playerViewModel)
        }
    }

    private var centerLabel: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [Color.honey400, Color.honey400.opacity(0.8)],
                    center: .center,
                    startRadius: 5,
                    endRadius: 45
                )
            )
            .frame(width: 90, height: 90)
            .overlay(
                Circle()
                    .fill(Color.honey50)
                    .frame(width: 20, height: 20)
                    .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
            )
    }

    private func startRotation() {
        guard playerViewModel.isPlaying else { return }
        withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
            rotation += 360
        }
    }
}
