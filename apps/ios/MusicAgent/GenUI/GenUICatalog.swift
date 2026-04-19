import Foundation

/// Single source of truth for every GenUI component this client renders.
/// Used for two things:
///   1. `SpecRenderer` dispatch (decode string → enum → SwiftUI view)
///   2. The capability list we report to the agent backend, which filters the
///      json-render catalog / system prompt so the model never emits a
///      component we can't display. The backend reads this from
///      `body.genuiWhitelist` on the chat request (see apps/agent/chat-agent).
///
/// Adding a component: (a) add a case here; (b) add a case to SpecRenderer's
/// `render(element:)`; (c) implement the view file. Nothing else.
enum GenUIComponent: String, CaseIterable {
    case textBlock       = "TextBlock"
    case divider         = "Divider"
    case section         = "Section"
    case trackCard       = "TrackCard"
    case albumCard       = "AlbumCard"
    case albumDetail     = "AlbumDetail"
    case artistSpotlight = "ArtistSpotlight"
    case badgeGroup      = "BadgeGroup"
    case lyricsCard      = "LyricsCard"
    case moodBoard       = "MoodBoard"
    case stat            = "Stat"
    case timelineEra     = "TimelineEra"

    /// Flat list of component type strings this client can render — pass
    /// directly to the agent as the whitelist.
    static var supportedTypes: [String] {
        allCases.map(\.rawValue)
    }
}
