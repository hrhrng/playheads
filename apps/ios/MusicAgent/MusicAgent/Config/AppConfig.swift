import Foundation

enum Environment {
    case development
    case production

    var apiBaseURL: URL {
        switch self {
        case .development:
            return URL(string: "http://localhost:8787")!
        case .production:
            return URL(string: "https://api.playheads.ai")!
        }
    }

    var wsBaseURL: URL {
        switch self {
        case .development:
            return URL(string: "ws://localhost:8787")!
        case .production:
            return URL(string: "wss://api.playheads.ai")!
        }
    }
}

struct AppConfig {
    static var environment: Environment {
        #if DEBUG
        return .development
        #else
        return .production
        #endif
    }

    /// Override URL from UserDefaults (set via Settings screen in debug builds)
    static var apiBaseURL: URL {
        if let override = UserDefaults.standard.string(forKey: "api_base_url"),
           let url = URL(string: override) {
            return url
        }
        return environment.apiBaseURL
    }

    static var wsBaseURL: URL {
        if let override = UserDefaults.standard.string(forKey: "ws_base_url"),
           let url = URL(string: override) {
            return url
        }
        return environment.wsBaseURL
    }

    static var defaultStorefront: String { "us" }
}
