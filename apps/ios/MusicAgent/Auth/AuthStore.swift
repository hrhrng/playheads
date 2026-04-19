import Foundation
import AuthenticationServices
import UIKit

/// Owns the auth lifecycle. SIWA kicks in via `signInWithApple()`; the better-
/// auth session cookie then carries every subsequent request (URLSession
/// attaches automatically via APIClient).
@MainActor
final class AuthStore: ObservableObject {
    static let shared = AuthStore()

    @Published private(set) var state: AuthState = .unknown

    private init() {}

    // MARK: - Boot

    /// Hit better-auth's `get-session` route. Returns the current user if the
    /// cookie from a prior launch still resolves. Safe to call on every open.
    func bootstrap() async {
        do {
            let res: SessionResponse = try await APIClient.shared.get("/api/auth/get-session")
            if let user = res.user {
                state = .signedIn(user)
            } else {
                state = .signedOut
            }
        } catch APIError.status(let code, _) where code == 401 || code == 403 {
            state = .signedOut
        } catch {
            // Treat transient network errors as signedOut so the gate shows —
            // user can retry by tapping the SIWA button.
            state = .signedOut
        }
    }

    // MARK: - Sign in with Apple

    func signInWithApple() async {
        state = .signingIn
        do {
            let credential = try await requestAppleCredential()
            guard let idTokenData = credential.identityToken,
                  let idToken = String(data: idTokenData, encoding: .utf8) else {
                state = .error("Apple returned no identity token.")
                return
            }
            let nameForApple = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0 }
                .joined(separator: " ")
            try await exchangeWithBackend(
                idToken: idToken,
                name: nameForApple.isEmpty ? nil : nameForApple
            )
            let res: SessionResponse = try await APIClient.shared.get("/api/auth/get-session")
            if let user = res.user {
                state = .signedIn(user)
            } else {
                state = .error("Backend rejected Apple credential.")
            }
        } catch let err as ASAuthorizationError {
            if err.code == .canceled {
                state = .signedOut
            } else {
                state = .error("Apple sign-in failed: \(err.localizedDescription)")
            }
        } catch {
            state = .error("Sign-in failed: \(error)")
        }
    }

    func signOut() async {
        do {
            // Best-effort; if the POST fails we still clear local state.
            _ = try? await APIClient.shared.postVoid("/api/auth/sign-out", body: EmptyBody())
        }
        APIClient.shared.clearSessionCookies()
        state = .signedOut
    }

    // MARK: - Apple flow

    private func requestAppleCredential() async throws -> ASAuthorizationAppleIDCredential {
        try await withCheckedThrowingContinuation { cont in
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.email, .fullName]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            let coord = AppleCoordinator(continuation: cont)
            controller.delegate = coord
            controller.presentationContextProvider = coord
            // Retain the coord for the life of the request.
            coord.retainCycle = controller
            coord.strongSelf = coord
            controller.performRequests()
        }
    }

    /// Hand the Apple identity token over to better-auth's social endpoint.
    /// better-auth's `signIn.social` accepts `idToken` as an object (`{ token,
    /// nonce? }`), not a bare string — it's the same wire shape the web
    /// client library posts. Set-Cookie on the response carries the session.
    private func exchangeWithBackend(idToken: String, name: String?) async throws {
        struct IDToken: Encodable {
            let token: String
        }
        struct Body: Encodable {
            let provider: String
            let idToken: IDToken
            let name: String?
        }
        _ = try await APIClient.shared.postVoid(
            "/api/auth/sign-in/social",
            body: Body(provider: "apple", idToken: IDToken(token: idToken), name: name)
        )
    }
}

// MARK: - Session endpoint

private struct SessionResponse: Decodable {
    let user: User?
    // `session` exists too but we only need user shape here.
}

private struct EmptyBody: Encodable {}

// MARK: - Apple controller delegate shim

/// ASAuthorizationController needs a delegate object living for the round-
/// trip. Bridges back to the async continuation.
private final class AppleCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    var continuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>
    var retainCycle: ASAuthorizationController?
    var strongSelf: AppleCoordinator?

    init(continuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>) {
        self.continuation = continuation
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { release() }
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential else {
            continuation.resume(throwing: APIError.invalidResponse)
            return
        }
        continuation.resume(returning: cred)
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithError error: Error) {
        defer { release() }
        continuation.resume(throwing: error)
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared
            .connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
            ?? ASPresentationAnchor()
    }

    private func release() {
        retainCycle = nil
        strongSelf = nil
    }
}
