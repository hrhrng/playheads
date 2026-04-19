import SwiftUI
import AuthenticationServices

/// Rendered in place of the chat list when `AuthStore.state` is not
/// `.signedIn`. Keeps the same serif / ink language as the rest of the sheet.
struct SignInGate: View {
    @ObservedObject var auth: AuthStore
    let track: MoodTrack?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer(minLength: 40)

            VStack(alignment: .leading, spacing: 8) {
                Text("Sign in to chat")
                    .font(.system(size: 22, weight: .semibold, design: .serif))
                    .foregroundStyle(track?.ink ?? .white)
                Text("Your conversations sync across devices. Nothing else uses your account.")
                    .font(.system(size: 14, design: .serif))
                    .foregroundStyle(track?.ink2 ?? .white.opacity(0.7))
                    .lineSpacing(3)
            }
            .padding(.horizontal, 20)

            SignInWithAppleButton(
                .signIn,
                onRequest: { request in
                    request.requestedScopes = [.email, .fullName]
                },
                onCompletion: { _ in
                    // The real exchange runs through AuthStore so we get the
                    // backend session cookie; this handler just fires the
                    // same path.
                    Task { await auth.signInWithApple() }
                }
            )
            .signInWithAppleButtonStyle(.white)
            .frame(height: 48)
            .padding(.horizontal, 20)
            .opacity(isSigningIn ? 0.5 : 1)
            .disabled(isSigningIn)
            .allowsHitTesting(!isSigningIn)
            // Intercept taps so we can drive the flow through AuthStore
            // (SignInWithAppleButton's built-in provider doesn't share a
            // session with the backend — we need to bridge).
            .overlay(
                Button {
                    Task { await auth.signInWithApple() }
                } label: {
                    Color.clear
                }
                .disabled(isSigningIn)
            )

            if case let .error(msg) = auth.state {
                Text(msg)
                    .font(.system(size: 12, design: .serif))
                    .foregroundStyle(Color(red: 0.95, green: 0.55, blue: 0.45))
                    .padding(.horizontal, 20)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var isSigningIn: Bool {
        if case .signingIn = auth.state { return true }
        return false
    }
}
