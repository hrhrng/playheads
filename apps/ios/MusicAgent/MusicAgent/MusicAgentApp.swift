import SwiftUI

@main
struct MusicAgentApp: App {
    @State private var authService = AuthService()
    @State private var musicService = MusicService()
    @State private var chatService = ChatService()

    var body: some Scene {
        WindowGroup {
            let authViewModel = AuthViewModel(authService: authService)
            let playerViewModel = PlayerViewModel(musicService: musicService)
            let chatViewModel = ChatViewModel(chatService: chatService, playerViewModel: playerViewModel)
            let conversationListViewModel = ConversationListViewModel()

            RootView(
                authService: authService,
                authViewModel: authViewModel,
                musicService: musicService,
                playerViewModel: playerViewModel,
                chatService: chatService,
                chatViewModel: chatViewModel,
                conversationListViewModel: conversationListViewModel
            )
            .preferredColorScheme(.dark)
        }
    }
}
