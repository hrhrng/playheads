import SwiftUI

/// Walks a flat Spec tree starting at `spec.root` and dispatches each element
/// through the GenUI registry to a SwiftUI view. Children are resolved by key
/// lookup, not by nesting — matches json-render's flat element-map shape.
struct SpecRenderer: View {
    let spec: Spec

    var body: some View {
        if let rootEl = spec.elements[spec.root] {
            render(element: rootEl)
        }
    }

    @ViewBuilder
    private func render(element: UIElement) -> some View {
        let kind = GenUIComponent(rawValue: element.type)
        let children = resolveChildren(of: element)
        switch kind {
        case .textBlock:        GenUITextBlock(props: element.props)
        case .divider:          GenUIDivider(props: element.props)
        case .trackCard:        GenUITrackCard(props: element.props)
        case .albumCard:        GenUIAlbumCard(props: element.props)
        case .albumDetail:      GenUIAlbumDetail(props: element.props)
        case .artistSpotlight:  GenUIArtistSpotlight(props: element.props)
        case .badgeGroup:       GenUIBadgeGroup(props: element.props)
        case .lyricsCard:       GenUILyricsCard(props: element.props)
        case .stat:             GenUIStat(props: element.props)
        case .moodBoard:
            GenUIMoodBoard(
                props: element.props,
                childPairs: children.map { (keyOf(element: $0), AnyView(self.render(element: $0))) }
            )
        case .timelineEra:
            GenUITimelineEra(
                props: element.props,
                childPairs: children.map { (keyOf(element: $0), AnyView(self.render(element: $0))) }
            )
        case .section:
            GenUISection(
                props: element.props,
                childPairs: children.map { (keyOf(element: $0), AnyView(self.render(element: $0))) }
            )
        case nil:
            GenUIUnknown(type: element.type)
        }
    }

    private func resolveChildren(of element: UIElement) -> [UIElement] {
        element.children.compactMap { spec.elements[$0] }
    }

    /// Find the element's key in the spec — needed for ForEach identity so
    /// new children animate in instead of snapping.
    private func keyOf(element: UIElement) -> String {
        spec.elements.first(where: { $0.value == element })?.key ?? UUID().uuidString
    }
}
