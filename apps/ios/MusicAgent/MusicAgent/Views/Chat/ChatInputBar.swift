import SwiftUI

struct ChatInputBar: View {
    @Binding var text: String
    let isStreaming: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            TextField("Command the deck...", text: $text)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .foregroundColor(.honey900)
                .liquidGlass(cornerRadius: 24, opacity: 0.6)
                .submitLabel(.send)
                .onSubmit(onSend)
                .disabled(isStreaming)

            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(
                        canSend
                            ? LinearGradient(colors: [.honey900, .honey900.opacity(0.8)], startPoint: .top, endPoint: .bottom)
                            : LinearGradient(colors: [.honey900.opacity(0.25), .honey900.opacity(0.2)], startPoint: .top, endPoint: .bottom)
                    )
                    .shadow(color: .honey900.opacity(canSend ? 0.2 : 0), radius: 8, x: 0, y: 4)
            }
            .disabled(!canSend)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(
            ZStack {
                Rectangle()
                    .fill(.ultraThinMaterial)
                Rectangle()
                    .fill(Color.white.opacity(0.3))
            }
        )
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isStreaming
    }
}
