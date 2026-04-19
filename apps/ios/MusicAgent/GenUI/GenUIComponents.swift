import SwiftUI

// Shared palette access. Chat host injects the current track via environment
// so every GenUI component can pull ink / rule / chip colors without wiring.
private struct MoodTrackKey: EnvironmentKey {
    static let defaultValue: MoodTrack? = nil
}

extension EnvironmentValues {
    var moodTrack: MoodTrack? {
        get { self[MoodTrackKey.self] }
        set { self[MoodTrackKey.self] = newValue }
    }
}

// MARK: - TextBlock

/// Renders editorial prose. Props: `{ text: String, variant?: "body"|"heading"|"caption" }`.
struct GenUITextBlock: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        let text = props.string("text") ?? ""
        let variant = props.string("variant") ?? "body"
        Text(text)
            .font(font(for: variant))
            .foregroundStyle(color(for: variant))
            .lineSpacing(variant == "body" ? 4 : 2)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func font(for variant: String) -> Font {
        switch variant {
        case "heading": return .system(size: 18, weight: .semibold, design: .serif)
        case "caption": return .system(size: 12, design: .serif)
        default: return .system(size: 16, design: .serif)
        }
    }

    private func color(for variant: String) -> Color {
        switch variant {
        case "caption": return track?.ink3 ?? .white.opacity(0.5)
        default: return track?.ink ?? .white
        }
    }
}

// MARK: - Divider

/// Hairline horizontal rule. Props: `{}` (spacing is fixed for now).
struct GenUIDivider: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        Rectangle()
            .fill(track?.ruleColor ?? .white.opacity(0.18))
            .frame(height: 0.5)
            .padding(.vertical, 4)
    }
}

// MARK: - Section

/// Titled container for other elements. Props:
/// `{ title?: String, subtitle?: String }`. Children render stacked below.
/// Caller passes (key, view) pairs so ForEach identity tracks the spec element
/// keys — lets new children animate in on incremental spec updates.
struct GenUISection: View {
    let props: JSONValue
    let childPairs: [(String, AnyView)]
    @Environment(\.moodTrack) private var track

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title = props.string("title"), !title.isEmpty {
                Text(title)
                    .font(.system(size: 14, weight: .semibold, design: .serif))
                    .foregroundStyle(track?.ink ?? .white)
            }
            if let sub = props.string("subtitle"), !sub.isEmpty {
                Text(sub)
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                    .padding(.bottom, 2)
            }
            ForEach(childPairs, id: \.0) { _, view in
                view
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .move(edge: .top)),
                        removal: .opacity
                    ))
            }
        }
        .padding(.vertical, 4)
        .animation(.spring(response: 0.42, dampingFraction: 0.88), value: childPairs.map(\.0))
    }
}

// MARK: - TrackCard

/// Compact music track card. Props:
/// `{ title: String, artist: String, album?: String, trackId?: String, query?: String }`.
/// No artwork loading yet — keep v0 as a typography card.
struct GenUITrackCard: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        let title = props.string("title") ?? ""
        let artist = props.string("artist") ?? ""
        let album = props.string("album")
        HStack(alignment: .top, spacing: 12) {
            // Leading stripe instead of cover art until we wire image loading.
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(track?.chipBg ?? Color.white.opacity(0.1))
                .frame(width: 40, height: 40)
                .overlay(
                    Image(systemName: "music.note")
                        .font(.system(size: 16))
                        .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold, design: .serif))
                    .foregroundStyle(track?.ink ?? .white)
                    .lineLimit(2)
                Text(artist)
                    .font(.system(size: 12, design: .serif))
                    .foregroundStyle(track?.ink2 ?? .white.opacity(0.7))
                if let album, !album.isEmpty {
                    Text(album)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Fallback

struct GenUIUnknown: View {
    let type: String
    @Environment(\.moodTrack) private var track

    var body: some View {
        Text("⟨unknown: \(type)⟩")
            .font(.system(size: 11, design: .monospaced))
            .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
            .padding(6)
            .background(Color.black.opacity(0.15))
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}
