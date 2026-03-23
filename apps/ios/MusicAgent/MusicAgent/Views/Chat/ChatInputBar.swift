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
                .background(Color.white)
                .cornerRadius(24)
                .shadow(color: .honey900.opacity(0.05), radius: 10, x: 0, y: 4)
                .foregroundColor(.honey900)
                .submitLabel(.send)
                .onSubmit(onSend)
                .disabled(isStreaming)

            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 40))
                    .foregroundColor(canSend ? .honey900 : .honey900.opacity(0.3))
                    .shadow(color: .honey900.opacity(0.2), radius: 8, x: 0, y: 4)
            }
            .disabled(!canSend)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(
            Color.white.opacity(0.8)
                .background(.ultraThinMaterial)
        )
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isStreaming
    }
}
