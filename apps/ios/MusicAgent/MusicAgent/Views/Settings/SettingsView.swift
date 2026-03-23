import SwiftUI

struct SettingsView: View {
    let authViewModel: AuthViewModel
    let musicService: MusicService
    let userId: String
    @Environment(\.dismiss) private var dismiss
    @State private var isValidatingToken = false
    @State private var tokenValid: Bool?

    #if DEBUG
    @State private var customAPIURL = UserDefaults.standard.string(forKey: "api_base_url") ?? ""
    @State private var customWSURL = UserDefaults.standard.string(forKey: "ws_base_url") ?? ""
    #endif

    var body: some View {
        NavigationStack {
            Form {
                // Profile
                Section("Account") {
                    if let email = authViewModel.authService.userEmail {
                        HStack {
                            Text("Email")
                            Spacer()
                            Text(email)
                                .foregroundColor(.secondary)
                        }
                    }

                    if let name = authViewModel.authService.userName {
                        HStack {
                            Text("Name")
                            Spacer()
                            Text(name)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // Apple Music
                Section("Apple Music") {
                    HStack {
                        Text("Status")
                        Spacer()
                        if musicService.isAuthorized {
                            Label("Connected", systemImage: "checkmark.circle.fill")
                                .foregroundColor(.green)
                                .font(.subheadline)
                        } else {
                            Text("Not connected")
                                .foregroundColor(.secondary)
                        }
                    }

                    if !musicService.isAuthorized {
                        Button("Connect Apple Music") {
                            Task { await musicService.initialize() }
                        }
                        .foregroundColor(.honey900)
                    } else {
                        Button("Validate Connection") {
                            Task {
                                isValidatingToken = true
                                tokenValid = await musicService.validateToken(userId: userId)
                                isValidatingToken = false
                            }
                        }
                        .foregroundColor(.honey900)

                        if isValidatingToken {
                            ProgressView()
                        } else if let valid = tokenValid {
                            Text(valid ? "Token is valid" : "Token expired — reconnect")
                                .font(.caption)
                                .foregroundColor(valid ? .green : .orange)
                        }

                        Button("Disconnect", role: .destructive) {
                            Task { await musicService.clearToken(userId: userId) }
                        }
                    }

                    HStack {
                        Text("Storefront")
                        Spacer()
                        Text(musicService.storefrontId.uppercased())
                            .foregroundColor(.secondary)
                    }
                }

                #if DEBUG
                // Developer Settings
                Section("Developer") {
                    TextField("API Base URL", text: $customAPIURL)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .onSubmit {
                            UserDefaults.standard.set(customAPIURL.isEmpty ? nil : customAPIURL, forKey: "api_base_url")
                        }

                    TextField("WebSocket Base URL", text: $customWSURL)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .onSubmit {
                            UserDefaults.standard.set(customWSURL.isEmpty ? nil : customWSURL, forKey: "ws_base_url")
                        }

                    HStack {
                        Text("Environment")
                        Spacer()
                        Text(AppConfig.environment == .development ? "Development" : "Production")
                            .foregroundColor(.secondary)
                    }
                }
                #endif

                // Logout
                Section {
                    Button("Sign Out", role: .destructive) {
                        Task {
                            await authViewModel.signOut()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.honey900)
                }
            }
        }
    }
}
