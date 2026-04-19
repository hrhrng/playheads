import SwiftUI
import CoreGraphics

/// Single custom display face for hero / editorial copy.
///
/// The app pairs LXGW WenKai (霞鹜文楷 — OFL-1.1) for display text with the
/// system font for small UI meta. Both Latin and CJK glyphs live inside the
/// same LXGW file, so bilingual copy (song name in Chinese next to an English
/// subtitle) reads as one voice instead of SF-Pro vs PingFang split.
///
/// Use `.display(size:)` at ≥14pt. Anything smaller should stay on the system
/// font so pixel-grid hinting stays tight — LXGW at 11–13pt smudges.
enum Typography {
    static let displayName = "LXGWWenKaiScreen"
}

extension Font {
    static func display(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(Typography.displayName, size: size).weight(weight)
    }
}
