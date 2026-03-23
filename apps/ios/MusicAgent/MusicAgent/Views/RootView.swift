import SwiftUI

struct RootView: View {
    let authService: AuthService
    let authViewModel: AuthViewModel
    let musicService: MusicService
    let playerViewModel: PlayerViewModel
    let chatService: ChatService
    let chatViewModel: ChatViewModel
    let conversationListViewModel: ConversationListViewModel

    @State private var currentConversationId: String?
    @State private var showConversations = false
    @State private var showQueue = false
    @State private var showSettings = false

    var body: some View {
        Group {
            if authService.isLoading {
                LoadingView()
            } else if !authService.isAuthenticated {
                LoginView(viewModel: authViewModel)
            } else if !authService.isWaitlistApproved {
                WaitlistView(email: authService.userEmail ?? "")
            } else {
                mainContent
            }
        }
        .task {
            await authViewModel.checkSession()
            if authService.isAuthenticated, let userId = authService.userId {
                await playerViewModel.setup(userId: userId)
                conversationListViewModel.setup(userId: userId)
                await conversationListViewModel.loadConversations()
                await startNewChat()
            }
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        ZStack(alignment: .bottom) {
            ChatView(
                viewModel: chatViewModel,
                onShowConversations: { showConversations = true },
                onShowQueue: { showQueue = true },
                onShowSettings: { showSettings = true },
                onNewChat: { Task { await startNewChat() } }
            )

            if playerViewModel.nowPlaying != nil {
                NowPlayingBar(playerViewModel: playerViewModel)
                    .padding(.horizontal)
                    .padding(.bottom, 4)
            }
        }
        .sheet(isPresented: $showConversations) {
            ConversationListView(
                viewModel: conversationListViewModel,
                onSelect: { conversation in
                    showConversations = false
                    switchToConversation(conversation.id)
                }
            )
        }
        .sheet(isPresented: $showQueue) {
            QueueView(playerViewModel: playerViewModel)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(
                authViewModel: authViewModel,
                musicService: musicService,
                userId: authService.userId ?? ""
            )
        }
    }

    private func startNewChat() async {
        guard let userId = authService.userId else { return }
        if let conversationId = await conversationListViewModel.createConversation() {
            currentConversationId = conversationId
            chatViewModel.startNewConversation(sessionId: conversationId, userId: userId)
        }
    }

    private func switchToConversation(_ id: String) {
        guard let userId = authService.userId else { return }
        currentConversationId = id
        chatViewModel.startNewConversation(sessionId: id, userId: userId)
    }
}

struct LoadingView: View {
    var body: some View {
        ZStack {
            Color.honey50.ignoresSafeArea()
            VStack(spacing: 16) {
                Circle()
                    .fill(LinearGradient(colors: [.honey400, .honey50], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 64, height: 64)
                    .shadow(color: .honey400.opacity(0.3), radius: 10, x: 0, y: 4)
                Text("Playheads")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.honey900)
                ProgressView()
                    .tint(.honey900)
            }
        }
    }
}
