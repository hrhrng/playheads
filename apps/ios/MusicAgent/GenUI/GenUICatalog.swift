import Foundation

/// Single source of truth for every GenUI component this client renders.
/// Used by `SpecRenderer` dispatch (decode string → enum → SwiftUI view).
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
}
