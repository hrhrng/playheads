import Foundation

/// Backend environment selector. DEBUG builds expose a toggle in the chat
/// sheet's drag handle; Release builds always use `.production`.
enum AgentEnvironment: String, CaseIterable {
    case production
    case preview
    case local

    var label: String {
        switch self {
        case .production: return "prod"
        case .preview:    return "preview"
        case .local:      return "local"
        }
    }

    /// Base URL RN uses for WebSocket + fetch. `useAgent({ host })` derives
    /// `host` from this via `new URL(baseUrl).host` on the JS side.
    var baseUrl: String {
        switch self {
        case .production: return "https://playheads.ai"
        case .preview:    return "https://preview.playheads.ai"
        case .local:      return "http://localhost:8787"
        }
    }
}

/// Persists the current dev selection across launches. Source of truth for any
/// code that needs the backend URL.
@MainActor
final class DebugSettings: ObservableObject {
    static let shared = DebugSettings()

    private let envKey = "playheads.debug.agentEnvironment"

    @Published var environment: AgentEnvironment {
        didSet {
            UserDefaults.standard.set(environment.rawValue, forKey: envKey)
        }
    }

    private init() {
        #if DEBUG
        let stored = UserDefaults.standard.string(forKey: envKey)
        self.environment = stored.flatMap(AgentEnvironment.init(rawValue:)) ?? .production
        #else
        // Release builds never talk to staging. Hardcode prod.
        self.environment = .production
        #endif
    }

    func cycleEnvironment() {
        let all = AgentEnvironment.allCases
        let idx = all.firstIndex(of: environment) ?? 0
        environment = all[(idx + 1) % all.count]
    }
}
