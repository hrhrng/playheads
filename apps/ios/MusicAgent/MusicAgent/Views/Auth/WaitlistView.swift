import SwiftUI

struct WaitlistView: View {
    let email: String

    var body: some View {
        ZStack {
            VStack(spacing: 24) {
                Spacer()

                VStack(spacing: 20) {
                    Circle()
                        .fill(LinearGradient(colors: [.honey400, .honey50], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 80, height: 80)
                        .overlay(Circle().stroke(Color.white.opacity(0.7), lineWidth: 2))
                        .shadow(color: .honey400.opacity(0.25), radius: 20, x: 0, y: 10)

                    Text("You're on the list!")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.honey900)

                    Text("We'll let you know at \(email) when your spot is ready.")
                        .font(.body)
                        .foregroundColor(.honey900.opacity(0.6))
                        .multilineTextAlignment(.center)
                }
                .padding(32)
                .liquidGlass(cornerRadius: 28, opacity: 0.45)
                .padding(.horizontal, 24)

                Spacer()
            }
        }
        .meshGradientBackground()
    }
}
