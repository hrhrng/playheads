import SwiftUI

struct QueueView: View {
    let playerViewModel: PlayerViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.honey50.ignoresSafeArea()

                if playerViewModel.queue.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "music.note.list")
                            .font(.largeTitle)
                            .foregroundColor(.honey900.opacity(0.3))
                        Text("Queue is empty")
                            .foregroundColor(.honey900.opacity(0.5))
                        Text("Ask the agent to play some music!")
                            .font(.caption)
                            .foregroundColor(.honey900.opacity(0.3))
                    }
                } else {
                    List {
                        // Now Playing
                        if let nowPlaying = playerViewModel.nowPlaying {
                            Section("Now Playing") {
                                trackRow(nowPlaying, isPlaying: true)
                            }
                        }

                        // Up Next
                        if !playerViewModel.upNext.isEmpty {
                            Section("Up Next") {
                                ForEach(Array(playerViewModel.upNext.enumerated()), id: \.element.id) { offset, track in
                                    trackRow(track, isPlaying: false)
                                        .swipeActions(edge: .trailing) {
                                            Button(role: .destructive) {
                                                let actualIndex = playerViewModel.currentIndex + 1 + offset
                                                Task { await playerViewModel.removeFromQueue(at: actualIndex) }
                                            } label: {
                                                Label("Remove", systemImage: "trash")
                                            }
                                        }
                                        .onTapGesture {
                                            let actualIndex = playerViewModel.currentIndex + 1 + offset
                                            Task { await playerViewModel.playAtIndex(actualIndex) }
                                        }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Queue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.honey900)
                }
            }
        }
    }

    private func trackRow(_ track: UnifiedTrack, isPlaying: Bool) -> some View {
        HStack(spacing: 12) {
            if isPlaying {
                Image(systemName: "speaker.wave.2.fill")
                    .foregroundColor(.honey400)
                    .font(.caption)
                    .frame(width: 20)
            }

            if let url = track.artworkURL {
                AsyncImage(url: url) { image in
                    image.resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.honey400.opacity(0.2))
                }
                .frame(width: 40, height: 40)
                .cornerRadius(4)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(track.name)
                    .font(.subheadline)
                    .fontWeight(isPlaying ? .semibold : .regular)
                    .foregroundColor(.honey900)
                    .lineLimit(1)

                Text(track.artist)
                    .font(.caption)
                    .foregroundColor(.honey900.opacity(0.6))
                    .lineLimit(1)
            }

            Spacer()

            Text(track.formattedDuration)
                .font(.caption)
                .foregroundColor(.honey900.opacity(0.4))
        }
    }
}
