import SwiftUI

struct WaitlistView: View {
    let email: String

    var body: some View {
        ZStack {
            Color.honey50.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Circle()
                    .fill(LinearGradient(colors: [.honey400, .honey50], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 80, height: 80)
                    .shadow(color: .honey400.opacity(0.3), radius: 15, x: 0, y: 8)

                Text("You're on the list!")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.honey900)

                Text("We'll let you know at \(email) when your spot is ready.")
                    .font(.body)
                    .foregroundColor(.honey900.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)

                Spacer()
            }
        }
    }
}
