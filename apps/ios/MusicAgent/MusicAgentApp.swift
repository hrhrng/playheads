import SwiftUI

@main
struct MusicAgentApp: App {
    init() {
        // Warm the RN runtime so the first chat-sheet open doesn't eat the
        // Hermes/bundle cold-start cost. The mood feed does its own image
        // + palette work on main, so this overlap is free wall-clock.
        ReactNativeHost.shared.preload()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
    }
}
