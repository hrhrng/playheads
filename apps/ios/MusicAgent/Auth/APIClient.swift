import Foundation

/// Thin URLSession wrapper that routes through `DebugSettings.environment` and
/// lets HTTPCookieStorage persist the better-auth session cookie across
/// launches. Every `/api/*` call goes through here.
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.httpShouldSetCookies = true
        // .shared storage persists to ~/Library/Cookies on device — good
        // enough for session cookies without having to go through Keychain.
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = 20
        self.session = URLSession(configuration: config)
    }

    // MARK: - Base URL

    /// Snapshot read from the MainActor-isolated DebugSettings. All request
    /// helpers hop to the main actor first via `resolveBase()`.
    @MainActor
    private static func currentBase() -> URL {
        URL(string: DebugSettings.shared.environment.baseUrl)!
    }

    private func resolveBase() async -> URL {
        await MainActor.run { Self.currentBase() }
    }

    // MARK: - Request construction

    private func makeURL(base: URL, path: String, query: [String: String] = [:]) -> URL {
        var comps = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        return comps.url!
    }

    // MARK: - Typed helpers

    /// GET with JSON response.
    func get<T: Decodable>(_ path: String, query: [String: String] = [:], as: T.Type = T.self) async throws -> T {
        let base = await resolveBase()
        let req = URLRequest(url: makeURL(base: base, path: path, query: query))
        return try await perform(req)
    }

    /// POST JSON body → JSON response.
    func post<T: Decodable, B: Encodable>(_ path: String, body: B, as: T.Type = T.self) async throws -> T {
        let base = await resolveBase()
        var req = URLRequest(url: makeURL(base: base, path: path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        return try await perform(req)
    }

    /// POST with no response body decoding.
    @discardableResult
    func postVoid<B: Encodable>(_ path: String, body: B) async throws -> HTTPURLResponse {
        let base = await resolveBase()
        var req = URLRequest(url: makeURL(base: base, path: path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        return try await performDiscarding(req)
    }

    // MARK: - Cookie inspection / reset

    /// Remove every cookie scoped to the current environment — used on sign-out
    /// so the next `/api/auth/session` hit lands as anonymous.
    @MainActor
    func clearSessionCookies() {
        let host = Self.currentBase().host ?? ""
        guard let cookies = HTTPCookieStorage.shared.cookies else { return }
        for cookie in cookies where cookie.domain.contains(host) || host.contains(cookie.domain) {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    // MARK: - Core

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        try validate(http, data: data)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error, body: String(data: data, encoding: .utf8))
        }
    }

    private func performDiscarding(_ request: URLRequest) async throws -> HTTPURLResponse {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        try validate(http, data: data)
        return http
    }

    private func validate(_ http: HTTPURLResponse, data: Data) throws {
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.status(
                code: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
    }
}

enum APIError: Error, CustomStringConvertible {
    case invalidResponse
    case status(code: Int, body: String)
    case decoding(Error, body: String?)

    var description: String {
        switch self {
        case .invalidResponse:              return "non-HTTP response"
        case let .status(code, body):       return "HTTP \(code): \(body)"
        case let .decoding(err, body):      return "decode: \(err) — body: \(body ?? "<nil>")"
        }
    }
}
