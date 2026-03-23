import SwiftUI

// MARK: - Color Palette

extension Color {
    // Soft Modern / Pablo Honey Palette
    static let honey50 = Color(red: 1.00, green: 0.99, blue: 0.96) // #FFFDF5 (Cream)
    static let honey400 = Color(red: 0.99, green: 0.73, blue: 0.07) // #FDB913 (Saffron)
    static let honey900 = Color(red: 0.23, green: 0.23, blue: 0.60) // #3B3B98 (Indigo)
    static let honeyText = Color(red: 0.07, green: 0.07, blue: 0.07) // #121212 (Soft Black)

    // Liquid Glass Palette
    static let glassWhite = Color.white.opacity(0.45)
    static let glassBorder = Color.white.opacity(0.6)
    static let glassHighlight = Color.white.opacity(0.8)
    static let glassShadow = Color.honey900.opacity(0.08)
}

// MARK: - Typography

extension Font {
    static let playheadTitle = Font.system(size: 28, weight: .bold)
    static let playheadHeadline = Font.system(size: 20, weight: .bold)
    static let playheadBody = Font.system(size: 16, weight: .regular)
    static let playheadCaption = Font.system(size: 12, weight: .regular)
}

// MARK: - Liquid Glass View Modifiers

struct LiquidGlassBackground: ViewModifier {
    var cornerRadius: CGFloat = 20
    var opacity: CGFloat = 0.45
    var bordered: Bool = true

    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(Color.white.opacity(opacity))

                    if bordered {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.7),
                                        Color.white.opacity(0.2),
                                        Color.white.opacity(0.1),
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 0.75
                            )
                    }
                }
                .shadow(color: Color.honey900.opacity(0.06), radius: 16, x: 0, y: 8)
                .shadow(color: Color.black.opacity(0.03), radius: 2, x: 0, y: 1)
            )
    }
}

struct LiquidGlassButtonStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .modifier(LiquidGlassBackground(cornerRadius: 14, opacity: 0.35))
    }
}

struct MeshGradientBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    LinearGradient(
                        colors: [
                            Color(red: 0.96, green: 0.95, blue: 1.0),   // lavender tint
                            Color(red: 1.0, green: 0.98, blue: 0.94),   // warm cream
                            Color(red: 0.94, green: 0.97, blue: 1.0),   // cool blue tint
                            Color(red: 1.0, green: 0.96, blue: 0.92),   // peach
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )

                    // Soft radial accents
                    Circle()
                        .fill(Color.honey400.opacity(0.08))
                        .frame(width: 400, height: 400)
                        .blur(radius: 100)
                        .offset(x: -100, y: -200)

                    Circle()
                        .fill(Color.honey900.opacity(0.04))
                        .frame(width: 300, height: 300)
                        .blur(radius: 80)
                        .offset(x: 120, y: 300)
                }
                .ignoresSafeArea()
            )
    }
}

extension View {
    func liquidGlass(cornerRadius: CGFloat = 20, opacity: CGFloat = 0.45, bordered: Bool = true) -> some View {
        modifier(LiquidGlassBackground(cornerRadius: cornerRadius, opacity: opacity, bordered: bordered))
    }

    func liquidGlassButton() -> some View {
        modifier(LiquidGlassButtonStyle())
    }

    func meshGradientBackground() -> some View {
        modifier(MeshGradientBackground())
    }
}
