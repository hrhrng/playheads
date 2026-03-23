import SwiftUI

struct ChatView: View {
    @Bindable var viewModel: ChatViewModel
    var onShowConversations: () -> Void
    var onShowQueue: () -> Void
    var onShowSettings: () -> Void
    var onNewChat: () -> Void

    var body: some View {
        ZStack {
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
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .liquidGlass(cornerRadius: 16, opacity: 0.3)
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
        .meshGradientBackground()
    }

    private var headerBar: some View {
        HStack {
            Button(action: onShowConversations) {
                Image(systemName: "line.3.horizontal")
                    .font(.title3)
                    .foregroundColor(.honey900)
                    .frame(width: 36, height: 36)
                    .liquidGlass(cornerRadius: 10, opacity: 0.3, bordered: false)
            }

            Spacer()

            HStack(spacing: 8) {
                Circle()
                    .fill(LinearGradient(colors: [.honey400, .honey50], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 28, height: 28)
                    .overlay(Circle().stroke(Color.glassHighlight, lineWidth: 1.5))
                    .shadow(color: .honey400.opacity(0.25), radius: 6, x: 0, y: 2)

                Text("Playhead")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.honey900)
            }

            Spacer()

            HStack(spacing: 12) {
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
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .liquidGlass(cornerRadius: 14, opacity: 0.3, bordered: false)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(
            Color.white.opacity(0.001) // hit area
                .background(.ultraThinMaterial.opacity(0.5))
        )
    }
}
