import SwiftUI

struct ChatView: View {
    @Bindable var viewModel: ChatViewModel
    var onShowConversations: () -> Void
    var onShowQueue: () -> Void
    var onShowSettings: () -> Void
    var onNewChat: () -> Void

    var body: some View {
        ZStack {
            Color.honey50.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                headerBar

                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(viewModel.messages) { message in
                                MessageBubble(message: message)
                                    .id(message.id)
                            }

                            if viewModel.isStreaming {
                                HStack(spacing: 8) {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                    Text("Thinking...")
                                        .font(.caption)
                                        .foregroundColor(.honey900.opacity(0.5))
                                }
                                .padding(.horizontal)
                                .id("streaming")
                            }
                        }
                        .padding()
                    }
                    .onChange(of: viewModel.messages.count) {
                        if let last = viewModel.messages.last {
                            withAnimation {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }

                // Input
                ChatInputBar(
                    text: $viewModel.input,
                    isStreaming: viewModel.isStreaming,
                    onSend: { viewModel.sendMessage() }
                )
            }
        }
    }

    private var headerBar: some View {
        HStack {
            Button(action: onShowConversations) {
                Image(systemName: "line.3.horizontal")
                    .font(.title3)
                    .foregroundColor(.honey900)
            }

            Spacer()

            HStack(spacing: 8) {
                Circle()
                    .fill(LinearGradient(colors: [.honey400, .honey50], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 28, height: 28)
                    .overlay(Circle().stroke(Color.honey50, lineWidth: 1.5))
                    .shadow(color: .honey400.opacity(0.3), radius: 4, x: 0, y: 2)

                Text("Playhead")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.honey900)
            }

            Spacer()

            HStack(spacing: 16) {
                Button(action: onNewChat) {
                    Image(systemName: "plus.circle")
                        .font(.title3)
                        .foregroundColor(.honey900)
                }

                Button(action: onShowQueue) {
                    Image(systemName: "list.bullet")
                        .font(.title3)
                        .foregroundColor(.honey900)
                }

                Button(action: onShowSettings) {
                    Image(systemName: "gearshape")
                        .font(.title3)
                        .foregroundColor(.honey900)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color.honey50)
    }
}
