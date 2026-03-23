import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, body: String?)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid server response"
        case .httpError(let code, let body):
            return "HTTP \(code): \(body ?? "Unknown error")"
        case .decodingError(let error): return "Decoding error: \(error.localizedDescription)"
        case .networkError(let error): return error.localizedDescription
        }
    }
}

actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = .shared
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            // Try epoch milliseconds first (number)
            if let ms = try? container.decode(Double.self) {
                return Date(timeIntervalSince1970: ms / 1000)
            }
            // Try ISO8601 string
            let str = try container.decode(String.self)
            if let date = ISO8601DateFormatter().date(from: str) {
                return date
            }
            // Try epoch ms as string
            if let ms = Double(str) {
                return Date(timeIntervalSince1970: ms / 1000)
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode date: \(str)")
        }
    }

    // MARK: - Session Token

    private var sessionToken: String? {
        get { KeychainHelper.get(key: "session_token") }
    }

    func setSessionToken(_ token: String?) {
        if let token {
            KeychainHelper.set(key: "session_token", value: token)
        } else {
            KeychainHelper.delete(key: "session_token")
        }
        // Also set as cookie for URLSession cookie jar
        if let token {
            setCookie(name: "better-auth.session_token", value: token)
        } else {
            deleteCookie(name: "better-auth.session_token")
        }
    }

    private func setCookie(name: String, value: String) {
        let url = AppConfig.apiBaseURL
        let properties: [HTTPCookiePropertyKey: Any] = [
            .name: name,
            .value: value,
            .domain: url.host ?? "localhost",
            .path: "/",
            .secure: url.scheme == "https",
        ]
        if let cookie = HTTPCookie(properties: properties) {
            HTTPCookieStorage.shared.setCookie(cookie)
        }
    }

    private func deleteCookie(name: String) {
        let cookies = HTTPCookieStorage.shared.cookies ?? []
        for cookie in cookies where cookie.name == name {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    // MARK: - HTTP Methods

    func get<T: Decodable>(_ path: String, query: [String: String] = []) async throws -> T {
        let request = try buildRequest(path: path, method: "GET", query: query)
        return try await execute(request)
    }

    func post<T: Decodable>(_ path: String, body: Encodable? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "POST")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await execute(request)
    }

    func put<T: Decodable>(_ path: String, body: Encodable? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "PUT")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await execute(request)
    }

    func patch<T: Decodable>(_ path: String, body: Encodable? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "PATCH")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await execute(request)
    }

    func delete(_ path: String, query: [String: String] = []) async throws {
        let request = try buildRequest(path: path, method: "DELETE", query: query)
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8)
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: body)
        }
    }

    /// POST without decoding response body (fire-and-forget style)
    func postVoid(_ path: String, body: Encodable? = nil) async throws {
        var request = try buildRequest(path: path, method: "POST")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8)
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: body)
        }
    }

    // MARK: - Internal

    private func buildRequest(path: String, method: String, query: [String: String] = []) throws -> URLRequest {
        var components = URLComponents(url: AppConfig.apiBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components?.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Attach session token as cookie header if cookie jar doesn't have it
        if let token = sessionToken {
            let existingCookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
            let hasSessionCookie = existingCookies.contains { $0.name == "better-auth.session_token" }
            if !hasSessionCookie {
                request.setValue("better-auth.session_token=\(token)", forHTTPHeaderField: "Cookie")
            }
        }

        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        // Extract session token from Set-Cookie if present
        if let headers = httpResponse.allHeaderFields as? [String: String],
           let url = request.url {
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: url)
            for cookie in cookies where cookie.name == "better-auth.session_token" {
                setSessionToken(cookie.value)
            }
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8)
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: body)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}

// MARK: - Keychain Helper

enum KeychainHelper {
    private static let service = "ai.playheads.MusicAgent"

    static func set(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        var newItem = query
        newItem[kSecValueData as String] = data
        SecItemAdd(newItem as CFDictionary, nil)
    }

    static func get(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
