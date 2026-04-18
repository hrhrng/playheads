import SwiftUI

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xff) / 255
        let g = Double((hex >> 8) & 0xff) / 255
        let b = Double(hex & 0xff) / 255
        self.init(red: r, green: g, blue: b, opacity: alpha)
    }

    static let pageBg = Color(hex: 0x0B0906)
    static let pageInk = Color(hex: 0xD8CFBF)
    static let pageMeta = Color(hex: 0x8A8275)
}

struct MoodPalette: Hashable {
    let name: String
    let ink: Color
    let ink2: Color
    let ink3: Color
    let ink4: Color
    let rule: Color
    let chipBg: Color
    let c1: Color
    let c2: Color
    let c3: Color
    let c4: Color
    let c5: Color
    let coverTxt: Color
    let coverSub: Color
    let swatches: [Color]

    var base: Color { c4 }
    var b1: Color { c2 }
    var b2: Color { c1 }
    var b3: Color { c3 }
    var b4: Color { c5 }

    static let amber = MoodPalette(
        name: "Amber",
        ink: Color(hex: 0xF4E9CE),
        ink2: Color(hex: 0xE6D5A8),
        ink3: Color(hex: 0xF4E9CE, alpha: 0.55),
        ink4: Color(hex: 0xF4E9CE, alpha: 0.28),
        rule: Color(hex: 0xF4E9CE, alpha: 0.18),
        chipBg: Color(hex: 0xF4E9CE, alpha: 0.12),
        c1: Color(hex: 0xF5B04A),
        c2: Color(hex: 0xF08738),
        c3: Color(hex: 0x2B1810),
        c4: Color(hex: 0x1A0F08),
        c5: Color(hex: 0x3C1F10),
        coverTxt: Color(hex: 0xF4D9A8),
        coverSub: Color(hex: 0xF4D9A8, alpha: 0.72),
        swatches: [Color(hex: 0xF5B04A), Color(hex: 0xF08738), Color(hex: 0x2B1810), Color(hex: 0x3C1F10)]
    )

    static let blue = MoodPalette(
        name: "Rain",
        ink: Color(hex: 0xEAF2FA),
        ink2: Color(hex: 0xCEDEF0),
        ink3: Color(hex: 0xEAF2FA, alpha: 0.55),
        ink4: Color(hex: 0xEAF2FA, alpha: 0.28),
        rule: Color(hex: 0xEAF2FA, alpha: 0.16),
        chipBg: Color(hex: 0xEAF2FA, alpha: 0.10),
        c1: Color(hex: 0x4FA3E8),
        c2: Color(hex: 0x2D7FC8),
        c3: Color(hex: 0x0E4A8E),
        c4: Color(hex: 0x0A3A72),
        c5: Color(hex: 0x1B63B5),
        coverTxt: .white,
        coverSub: Color.white.opacity(0.8),
        swatches: [Color(hex: 0x4FA3E8), Color(hex: 0x2D7FC8), Color(hex: 0x0E4A8E), Color(hex: 0x0A3A72)]
    )

    static let forest = MoodPalette(
        name: "Forest",
        ink: Color(hex: 0xE6EACF),
        ink2: Color(hex: 0xCDD4AC),
        ink3: Color(hex: 0xE6EACF, alpha: 0.55),
        ink4: Color(hex: 0xE6EACF, alpha: 0.28),
        rule: Color(hex: 0xE6EACF, alpha: 0.16),
        chipBg: Color(hex: 0xE6EACF, alpha: 0.10),
        c1: Color(hex: 0x8FA57A),
        c2: Color(hex: 0x5E7A4C),
        c3: Color(hex: 0x1C2617),
        c4: Color(hex: 0x0F170B),
        c5: Color(hex: 0x2A3923),
        coverTxt: Color(hex: 0xDDE4CF),
        coverSub: Color(hex: 0xDDE4CF, alpha: 0.68),
        swatches: [Color(hex: 0x8FA57A), Color(hex: 0x5E7A4C), Color(hex: 0x1C2617), Color(hex: 0x2A3923)]
    )

    static let neon = MoodPalette(
        name: "Neon",
        ink: Color(hex: 0xF4E8F5),
        ink2: Color(hex: 0xDDC9DE),
        ink3: Color(hex: 0xF4E8F5, alpha: 0.55),
        ink4: Color(hex: 0xF4E8F5, alpha: 0.28),
        rule: Color(hex: 0xF4E8F5, alpha: 0.18),
        chipBg: Color(hex: 0xF4E8F5, alpha: 0.12),
        c1: Color(hex: 0xE84A8A),
        c2: Color(hex: 0x1FB8C4),
        c3: Color(hex: 0x2A1244),
        c4: Color(hex: 0x140820),
        c5: Color(hex: 0x6A2E7C),
        coverTxt: Color(hex: 0xFFE9F2),
        coverSub: Color(hex: 0xFFE9F2, alpha: 0.72),
        swatches: [Color(hex: 0xE84A8A), Color(hex: 0x1FB8C4), Color(hex: 0x6A2E7C), Color(hex: 0x2A1244)]
    )
}
