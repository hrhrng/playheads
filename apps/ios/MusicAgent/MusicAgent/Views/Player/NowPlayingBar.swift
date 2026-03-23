import SwiftUI

struct NowPlayingBar: View {
    let playerViewModel: PlayerViewModel

    var body: some View {
        if let track = playerViewModel.nowPlaying {
            HStack(spacing: 12) {
                // Artwork
                if let url = track.artworkURL {
                    AsyncImage(url: url) { image in
                        image.resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color.honey400.opacity(0.3))
                    }
                    .frame(width: 44, height: 44)
                    .cornerRadius(6)
                }

                // Track info
                VStack(alignment: .leading, spacing: 2) {
                    Text(track.name)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.honey900)
                        .lineLimit(1)

                    Text(track.artist)
                        .font(.caption)
                        .foregroundColor(.honey900.opacity(0.6))
                        .lineLimit(1)
                }

                Spacer()

                // Controls
                HStack(spacing: 20) {
                    Button(action: { Task { await playerViewModel.togglePlay() } }) {
                        Image(systemName: playerViewModel.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title3)
                            .foregroundColor(.honey900)
                    }

                    Button(action: { Task { await playerViewModel.skipNext() } }) {
                        Image(systemName: "forward.fill")
                            .font(.body)
                            .foregroundColor(.honey900)
                    }
                    .disabled(playerViewModel.upNext.isEmpty)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(.ultraThinMaterial)
                    .shadow(color: .honey900.opacity(0.1), radius: 10, x: 0, y: 4)
            )
        }
    }
}
