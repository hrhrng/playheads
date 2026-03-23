import SwiftUI

struct PlaybackControls: View {
    let playerViewModel: PlayerViewModel

    var body: some View {
        VStack(spacing: 16) {
            // Seek bar
            if let track = playerViewModel.nowPlaying {
                VStack(spacing: 4) {
                    Slider(
                        value: Binding(
                            get: { playerViewModel.musicService.playbackTime.current },
                            set: { playerViewModel.seekTo($0) }
                        ),
                        in: 0...max(track.durationSeconds, 1)
                    )
                    .tint(.honey900)

                    HStack {
                        Text(formatTime(playerViewModel.musicService.playbackTime.current))
                        Spacer()
                        Text(formatTime(track.durationSeconds))
                    }
                    .font(.caption2)
                    .foregroundColor(.honey900.opacity(0.5))
                }
                .padding(.horizontal, 32)
            }

            // Control buttons
            HStack(spacing: 40) {
                Button(action: { Task { await playerViewModel.skipPrevious() } }) {
                    Image(systemName: "backward.fill")
                        .font(.title2)
                        .foregroundColor(.honey900)
                }
                .disabled(playerViewModel.nowPlaying == nil)

                Button(action: { Task { await playerViewModel.togglePlay() } }) {
                    Image(systemName: playerViewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 56))
                        .foregroundColor(.honey900)
                        .shadow(color: .honey900.opacity(0.2), radius: 8, x: 0, y: 4)
                }
                .disabled(playerViewModel.nowPlaying == nil)

                Button(action: { Task { await playerViewModel.skipNext() } }) {
                    Image(systemName: "forward.fill")
                        .font(.title2)
                        .foregroundColor(.honey900)
                }
                .disabled(playerViewModel.upNext.isEmpty)
            }
        }
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
