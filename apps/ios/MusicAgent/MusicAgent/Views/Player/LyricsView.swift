import SwiftUI

struct LyricsView: View {
    let track: UnifiedTrack?
    @State private var lyrics: String?
    @State private var isLoading = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                if isLoading {
                    ProgressView("Loading lyrics...")
                        .tint(.honey900)
                } else if let lyrics, !lyrics.isEmpty {
                    ScrollView {
                        Text(lyrics)
                            .font(.body)
                            .foregroundColor(.honey900)
                            .multilineTextAlignment(.center)
                            .padding(24)
                            .liquidGlass(cornerRadius: 20, opacity: 0.35, bordered: false)
                            .padding()
                    }
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "music.note")
                            .font(.largeTitle)
                            .foregroundColor(.honey900.opacity(0.3))
                        Text("No lyrics available")
                            .foregroundColor(.honey900.opacity(0.5))
                    }
                    .padding(24)
                    .liquidGlass(cornerRadius: 20, opacity: 0.3, bordered: false)
                }
            }
            .meshGradientBackground()
            .navigationTitle(track?.name ?? "Lyrics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.honey900)
                }
            }
        }
    }
}
