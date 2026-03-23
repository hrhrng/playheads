import Foundation
import AuthenticationServices

@Observable
final class AuthViewModel {
    let authService: AuthService

    var email = ""
    var magicLinkSent = false
    var isLoggingIn = false
    var errorMessage: String?

    init(authService: AuthService) {
        self.authService = authService
    }

    // MARK: - Session Check

    func checkSession() async {
        await authService.checkSession()
    }

    // MARK: - Magic Link

    func sendMagicLink() async {
        guard !email.isEmpty else {
            errorMessage = "Please enter your email"
            return
        }
        isLoggingIn = true
        errorMessage = nil
        do {
            try await authService.sendMagicLink(email: email)
            magicLinkSent = true
        } catch {
            errorMessage = "Failed to send magic link: \(error.localizedDescription)"
        }
        isLoggingIn = false
    }

    // MARK: - Apple Sign In

    func handleAppleSignIn(result: Result<ASAuthorization, Error>) async {
        isLoggingIn = true
        errorMessage = nil
        switch result {
        case .success(let auth):
            if let credential = auth.credential as? ASAuthorizationAppleIDCredential {
                do {
                    try await authService.signInWithApple(credential: credential)
                } catch {
                    errorMessage = "Apple sign in failed: \(error.localizedDescription)"
                }
            }
        case .failure(let error):
            if (error as NSError).code != ASAuthorizationError.canceled.rawValue {
                errorMessage = "Apple sign in failed: \(error.localizedDescription)"
            }
        }
        isLoggingIn = false
    }

    // MARK: - Logout

    func signOut() async {
        await authService.signOut()
    }
}
