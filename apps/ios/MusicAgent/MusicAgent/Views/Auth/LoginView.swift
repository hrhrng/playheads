import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @Bindable var viewModel: AuthViewModel

    var body: some View {
        ZStack {
            Color.honey50.ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                // Logo
                VStack(spacing: 12) {
                    Circle()
                        .fill(LinearGradient(colors: [.honey400, .honey50], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 80, height: 80)
                        .overlay(Circle().stroke(Color.honey50, lineWidth: 3))
                        .shadow(color: .honey400.opacity(0.3), radius: 15, x: 0, y: 8)

                    Text("Playheads")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.honey900)

                    Text("Your AI-powered music companion")
                        .font(.subheadline)
                        .foregroundColor(.honey900.opacity(0.6))
                }

                Spacer()

                // Login Form
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
                    .cornerRadius(25)

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 32)

                Spacer()
            }
        }
    }

    private var emailLoginView: some View {
        VStack(spacing: 12) {
            TextField("Enter your email", text: $viewModel.email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .padding()
                .background(Color.white)
                .cornerRadius(25)
                .shadow(color: .honey900.opacity(0.05), radius: 10, x: 0, y: 4)

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
                .background(Color.honey900)
                .foregroundColor(.white)
                .cornerRadius(25)
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
