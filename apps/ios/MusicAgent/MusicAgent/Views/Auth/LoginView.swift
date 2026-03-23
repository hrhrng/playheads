import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @Bindable var viewModel: AuthViewModel

    var body: some View {
        ZStack {
            VStack(spacing: 32) {
                Spacer()

                // Logo
                VStack(spacing: 12) {
                    Circle()
                        .fill(LinearGradient(colors: [.honey400, .honey50], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 80, height: 80)
                        .overlay(Circle().stroke(Color.white.opacity(0.7), lineWidth: 2))
                        .shadow(color: .honey400.opacity(0.25), radius: 20, x: 0, y: 10)

                    Text("Playheads")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.honey900)

                    Text("Your AI-powered music companion")
                        .font(.subheadline)
                        .foregroundColor(.honey900.opacity(0.6))
                }

                Spacer()

                // Login Form — Glass Card
                VStack(spacing: 16) {
                    if viewModel.magicLinkSent {
                        magicLinkSentView
                    } else {
                        emailLoginView
                    }

                    dividerRow

                    // Apple Sign In
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.email, .fullName]
                    } onCompletion: { result in
                        Task { await viewModel.handleAppleSignIn(result: result) }
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 50)
                    .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(24)
                .liquidGlass(cornerRadius: 28, opacity: 0.45)
                .padding(.horizontal, 24)

                Spacer()
            }
        }
        .meshGradientBackground()
    }

    private var emailLoginView: some View {
        VStack(spacing: 12) {
            TextField("Enter your email", text: $viewModel.email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .padding()
                .background(Color.white.opacity(0.6))
                .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 25, style: .continuous)
                        .stroke(Color.white.opacity(0.5), lineWidth: 0.75)
                )

            Button(action: { Task { await viewModel.sendMagicLink() } }) {
                HStack {
                    if viewModel.isLoggingIn {
                        ProgressView()
                            .tint(.white)
                    }
                    Text("Send Magic Link")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(
                    LinearGradient(
                        colors: [Color.honey900, Color.honey900.opacity(0.85)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))
                .shadow(color: .honey900.opacity(0.2), radius: 10, x: 0, y: 4)
            }
            .disabled(viewModel.isLoggingIn)
        }
    }

    private var magicLinkSentView: some View {
        VStack(spacing: 12) {
            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 40))
                .foregroundColor(.honey400)

            Text("Check your email")
                .font(.headline)
                .foregroundColor(.honey900)

            Text("We sent a magic link to \(viewModel.email)")
                .font(.subheadline)
                .foregroundColor(.honey900.opacity(0.6))
                .multilineTextAlignment(.center)

            Button("Use a different email") {
                viewModel.magicLinkSent = false
            }
            .font(.subheadline)
            .foregroundColor(.honey900)
        }
        .padding()
    }

    private var dividerRow: some View {
        HStack {
            Rectangle()
                .fill(Color.honey900.opacity(0.1))
                .frame(height: 1)
            Text("or")
                .font(.caption)
                .foregroundColor(.honey900.opacity(0.4))
            Rectangle()
                .fill(Color.honey900.opacity(0.1))
                .frame(height: 1)
        }
    }
}
