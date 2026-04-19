import SwiftUI

// MARK: - AlbumCard
// `{ title, subtitle, trackId?, query?, year?, artworkUrl?, ... }`
// v0: typography card + placeholder cover. Expandable tracklist is a later
// pass (needs Apple Music catalog fetch, tap gesture, detent-aware layout).

struct GenUIAlbumCard: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        let title = props.string("title") ?? ""
        let subtitle = props.string("subtitle") ?? ""
        let year = props.string("year")
        HStack(alignment: .top, spacing: 14) {
            artPlaceholder(size: 56)
                .frame(width: 56, height: 56)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold, design: .serif))
                    .foregroundStyle(track?.ink ?? .white)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    Text(subtitle)
                        .font(.system(size: 12, design: .serif))
                        .foregroundStyle(track?.ink2 ?? .white.opacity(0.7))
                    if let y = year, !y.isEmpty {
                        Text("·")
                            .font(.system(size: 12, design: .serif))
                            .foregroundStyle(track?.ink3 ?? .white.opacity(0.45))
                        Text(y)
                            .font(.system(size: 11, design: .serif))
                            .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                            .monospacedDigit()
                    }
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(track?.ink3 ?? .white.opacity(0.45))
        }
        .padding(.vertical, 6)
    }
}

// MARK: - AlbumDetail
// Same props as AlbumCard but rendered large — cover prominent.

struct GenUIAlbumDetail: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        let title = props.string("title") ?? ""
        let subtitle = props.string("subtitle") ?? ""
        let year = props.string("year")
        VStack(alignment: .leading, spacing: 10) {
            artPlaceholder(size: 120)
                .frame(width: 120, height: 120)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 18, weight: .semibold, design: .serif))
                    .foregroundStyle(track?.ink ?? .white)
                Text(subtitle)
                    .font(.system(size: 13, design: .serif))
                    .foregroundStyle(track?.ink2 ?? .white.opacity(0.7))
                if let y = year, !y.isEmpty {
                    Text(y)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                        .monospacedDigit()
                        .padding(.top, 1)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - ArtistSpotlight
// `{ name, subtitle?, bio?, imageUrl?, stats?: [{ label, value }] }`

struct GenUIArtistSpotlight: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        let name = props.string("name") ?? ""
        let subtitle = props.string("subtitle")
        let bio = props.string("bio")
        let stats = props.array("stats") ?? []

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                artPlaceholder(size: 64)
                    .frame(width: 64, height: 64)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(track?.ruleColor ?? Color.white.opacity(0.18), lineWidth: 0.5))
                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(.system(size: 18, weight: .semibold, design: .serif))
                        .foregroundStyle(track?.ink ?? .white)
                    if let s = subtitle, !s.isEmpty {
                        Text(s)
                            .font(.system(size: 12, design: .serif))
                            .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                    }
                }
                Spacer(minLength: 0)
            }

            if let b = bio, !b.isEmpty {
                Text(b)
                    .font(.system(size: 14, design: .serif))
                    .foregroundStyle(track?.ink2 ?? .white.opacity(0.75))
                    .lineSpacing(3)
            }

            if !stats.isEmpty {
                HStack(spacing: 18) {
                    ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(stat.string("value") ?? "")
                                .font(.system(size: 15, weight: .semibold, design: .serif))
                                .foregroundStyle(track?.ink ?? .white)
                                .monospacedDigit()
                            Text(stat.string("label") ?? "")
                                .font(.system(size: 10, design: .serif))
                                .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                                .textCase(.uppercase)
                                .kerning(0.4)
                        }
                    }
                }
                .padding(.top, 2)
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - BadgeGroup
// `{ badges: [{ label, color? }] }` — wrap of small capsules.

struct GenUIBadgeGroup: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        let badges = props.array("badges") ?? []
        FlowLayout(spacing: 6) {
            ForEach(Array(badges.enumerated()), id: \.offset) { _, b in
                BadgePill(label: b.string("label") ?? "", tint: b.string("color"))
            }
        }
        .padding(.vertical, 4)
    }
}

private struct BadgePill: View {
    let label: String
    let tint: String?
    @Environment(\.moodTrack) private var track

    var body: some View {
        let tintColor: Color? = tint.flatMap(Color.init(hexString:))
        let foreground: Color = tintColor ?? track?.ink ?? .white
        let background: Color = tintColor?.opacity(0.12) ?? track?.chipBg ?? Color.white.opacity(0.08)
        let border: Color = track?.ruleColor ?? Color.white.opacity(0.12)

        Text(label)
            .font(.system(size: 11, weight: .medium, design: .serif))
            .foregroundStyle(foreground)
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(Capsule().fill(background))
            .overlay(Capsule().strokeBorder(border, lineWidth: 0.5))
    }
}

// MARK: - LyricsCard
// `{ lines: [String], trackName, artist, trackId?, query? }` — pull-quote.

struct GenUILyricsCard: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        let lines = (props.array("lines") ?? []).compactMap { $0.asString }
        let trackName = props.string("trackName") ?? ""
        let artist = props.string("artist") ?? ""

        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(.system(size: 17, weight: .regular, design: .serif))
                        .italic()
                        .foregroundStyle(track?.ink ?? .white)
                        .lineSpacing(2)
                }
            }
            .padding(.leading, 14)
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(track?.ruleColor ?? Color.white.opacity(0.22))
                    .frame(width: 2)
            }
            HStack(spacing: 4) {
                Text("—")
                Text(trackName)
                    .fontWeight(.medium)
                Text(",")
                Text(artist)
                    .foregroundStyle(track?.ink3 ?? .white.opacity(0.6))
            }
            .font(.system(size: 11, design: .serif))
            .foregroundStyle(track?.ink2 ?? .white.opacity(0.7))
            .padding(.leading, 14)
        }
        .padding(.vertical, 6)
    }
}

// MARK: - MoodBoard
// `{ mood, description?, emoji?, gradient?: [hex, hex], children? }`

struct GenUIMoodBoard: View {
    let props: JSONValue
    let childPairs: [(String, AnyView)]
    @Environment(\.moodTrack) private var track

    var body: some View {
        let mood = props.string("mood") ?? ""
        let description = props.string("description")
        let emoji = props.string("emoji")
        let gradient = (props.array("gradient") ?? [])
            .compactMap { $0.asString }
            .compactMap { Color(hexString: $0) }
        let colors: [Color] = gradient.isEmpty
            ? [track?.ink ?? .purple, track?.ink3 ?? .pink]
            : gradient

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                if let e = emoji, !e.isEmpty {
                    Text(e).font(.system(size: 28))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(mood)
                        .font(.system(size: 18, weight: .semibold, design: .serif))
                        .foregroundStyle(track?.ink ?? .white)
                    if let d = description, !d.isEmpty {
                        Text(d)
                            .font(.system(size: 12, design: .serif))
                            .foregroundStyle(track?.ink2 ?? .white.opacity(0.7))
                            .lineSpacing(2)
                    }
                }
                Spacer(minLength: 0)
            }
            // Gradient hairline instead of full background — matches
            // editorial tone, not admin-card vibe.
            LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing)
                .frame(height: 2)
                .clipShape(Capsule())
                .opacity(0.75)

            if !childPairs.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(childPairs, id: \.0) { _, view in
                        view.transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .animation(.spring(response: 0.42, dampingFraction: 0.88), value: childPairs.map(\.0))
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Stat
// `{ value, label }`

struct GenUIStat: View {
    let props: JSONValue
    @Environment(\.moodTrack) private var track

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(props.string("value") ?? "")
                .font(.system(size: 20, weight: .semibold, design: .serif))
                .foregroundStyle(track?.ink ?? .white)
                .monospacedDigit()
            Text(props.string("label") ?? "")
                .font(.system(size: 10, design: .serif))
                .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                .textCase(.uppercase)
                .kerning(0.4)
        }
    }
}

// MARK: - TimelineEra
// `{ year, label, description?, children? }` — left-dotted vertical era.

struct GenUITimelineEra: View {
    let props: JSONValue
    let childPairs: [(String, AnyView)]
    @Environment(\.moodTrack) private var track

    var body: some View {
        let year = props.string("year") ?? ""
        let label = props.string("label") ?? ""
        let description = props.string("description")

        HStack(alignment: .top, spacing: 14) {
            // Dot + line column.
            VStack(spacing: 0) {
                Circle()
                    .fill(track?.ink2 ?? .white.opacity(0.7))
                    .frame(width: 8, height: 8)
                    .padding(.top, 4)
                Rectangle()
                    .fill(track?.ruleColor ?? Color.white.opacity(0.18))
                    .frame(width: 1.5)
                    .padding(.top, 2)
            }
            .frame(width: 8)

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(year)
                        .font(.system(size: 13, weight: .semibold, design: .serif))
                        .foregroundStyle(track?.ink ?? .white)
                        .monospacedDigit()
                    Text(label)
                        .font(.system(size: 12, design: .serif))
                        .foregroundStyle(track?.ink2 ?? .white.opacity(0.7))
                    Spacer(minLength: 0)
                }
                if let d = description, !d.isEmpty {
                    Text(d)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
                        .lineSpacing(2)
                }
                if !childPairs.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(childPairs, id: \.0) { _, view in
                            view.transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .animation(.spring(response: 0.42, dampingFraction: 0.88), value: childPairs.map(\.0))
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Helpers

@ViewBuilder
fileprivate func artPlaceholder(size: CGFloat) -> some View {
    EnvironmentRead { track in
        RoundedRectangle(cornerRadius: size >= 96 ? 8 : 4, style: .continuous)
            .fill(track?.chipBg ?? Color.white.opacity(0.1))
            .overlay(
                Image(systemName: "music.note")
                    .font(.system(size: max(14, size * 0.3)))
                    .foregroundStyle(track?.ink3 ?? .white.opacity(0.5))
            )
    }
}

/// Tiny bridge to read @Environment inside a fileprivate helper.
fileprivate struct EnvironmentRead<Content: View>: View {
    @Environment(\.moodTrack) var track
    let build: (MoodTrack?) -> Content
    init(@ViewBuilder _ build: @escaping (MoodTrack?) -> Content) { self.build = build }
    var body: some View { build(track) }
}

fileprivate extension JSONValue {
    var asString: String? {
        if case let .string(s) = self { return s }
        return nil
    }
}

// MARK: - Color(hexString:)

fileprivate extension Color {
    init?(hexString: String) {
        var s = hexString.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6 || s.count == 8, let n = UInt64(s, radix: 16) else { return nil }
        let r, g, b, a: Double
        if s.count == 8 {
            a = Double((n & 0xff000000) >> 24) / 255
            r = Double((n & 0x00ff0000) >> 16) / 255
            g = Double((n & 0x0000ff00) >> 8) / 255
            b = Double(n & 0x000000ff) / 255
        } else {
            a = 1
            r = Double((n & 0xff0000) >> 16) / 255
            g = Double((n & 0x00ff00) >> 8) / 255
            b = Double(n & 0x0000ff) / 255
        }
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

// MARK: - FlowLayout
// Simple wrap layout so BadgeGroup / stats can flow naturally on narrow widths.

fileprivate struct FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var rows: [CGFloat] = [0]
        var rowH: CGFloat = 0
        var totalH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if rows[rows.count - 1] + size.width > maxW, rows[rows.count - 1] > 0 {
                totalH += rowH + spacing
                rowH = 0
                rows.append(0)
            }
            rows[rows.count - 1] += size.width + spacing
            rowH = max(rowH, size.height)
        }
        totalH += rowH
        return CGSize(width: maxW.isFinite ? maxW : (rows.max() ?? 0), height: totalH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxW = bounds.width
        var x = bounds.minX
        var y = bounds.minY
        var rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowH + spacing
                rowH = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowH = max(rowH, size.height)
            _ = maxW // unused
        }
    }
}
