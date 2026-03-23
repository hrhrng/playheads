import Foundation
import AuthenticationServices

@Observable
final class AuthService {
    private(set) var currentSession: AuthSession?
    private(set) var isLoading = true
    private(set) var isAuthenticated = false
    private(set) var isWaitlistApproved = false

    init() {}

    // MARK: - Session

    func checkSession() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let session: AuthSession = try await APIClient.shared.get("/api/auth/session")
            self.currentSession = session
            self.isAuthenticated = true
            self.isWaitlistApproved = session.user.waitlistApproved ?? false
        } catch {
            self.currentSession = nil
            self.isAuthenticated = false
            self.isWaitlistApproved = false
        }
    }

    var userId: String? { currentSession?.user.id }
    var userEmail: String? { currentSession?.user.email }
    var userName: String? { currentSession?.user.name }

    // MARK: - Magic Link

    func sendMagicLink(email: String) async throws {
        struct Body: Encodable { let email: String; let callbackURL: String }
        let _: AnyCodable = try await APIClient.shared.post(
            "/api/auth/signin/magic-link",
            body: Body(email: email, callbackURL: "\(AppConfig.apiBaseURL)/api/auth/magic-link/callback")
        )
    }

    // MARK: - Apple Sign In

    func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
        guard let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            throw APIError.invalidResponse
        }

        struct Body: Encodable {
            let provider: String
            let idToken: String
            let callbackURL: String
        }

        let session: AuthSession = try await APIClient.shared.post(
            "/api/auth/signin/social",
            body: Body(
                provider: "apple",
                idToken: idToken,
                callbackURL: "\(AppConfig.apiBaseURL)/api/auth/callback/apple"
            )
        )

        await APIClient.shared.setSessionToken(session.session.token)
        self.currentSession = session
        self.isAuthenticated = true
        self.isWaitlistApproved = session.user.waitlistApproved ?? false
    }

    // MARK: - Google Sign In

    func signInWithGoogle(idToken: String) async throws {
        struct Body: Encodable {
            let provider: String
            let idToken: String
            let callbackURL: String
        }

        let session: AuthSession = try await APIClient.shared.post(
            "/api/auth/signin/social",
            body: Body(
                provider: "google",
                idToken: idToken,
                callbackURL: "\(AppConfig.apiBaseURL)/api/auth/callback/google"
            )
        )

        await APIClient.shared.setSessionToken(session.session.token)
        self.currentSession = session
        self.isAuthenticated = true
        self.isWaitlistApproved = session.user.waitlistApproved ?? false
    }

    // MARK: - Logout

    func signOut() async {
        do {
            try await APIClient.shared.postVoid("/api/auth/signout")
        } catch {
            // Best effort
        }
        await APIClient.shared.setSessionToken(nil)
        currentSession = nil
        isAuthenticated = false
        isWaitlistApproved = false
    }
}
