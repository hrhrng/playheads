import SwiftUI

struct ContentView: View {
    @State private var message: String = ""
    @State private var chatHistory: [ChatMessage] = [
        ChatMessage(role: .agent, content: "Ready to mix. What's the vibe?")
    ]
    
    struct ChatMessage: Hashable {
        enum Role { case user, agent }
        let role: Role
        let content: String
    }
    
    var body: some View {
        ZStack {
            Color.honey50.edgesIgnoringSafeArea(.all)
            
            VStack(spacing: 0) {
                // Header
                HStack {
                    Circle()
                        .fill(LinearGradient(colors: [.honey400, .honey50], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 32, height: 32)
                        .overlay(Circle().stroke(Color.honey50, lineWidth: 2))
                        .shadow(color: .honey400.opacity(0.3), radius: 5, x: 0, y: 4)
                        
                    Text("Playhead")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.honey900)
                    Spacer()
                }
                .padding(.horizontal)
                .padding(.top, 20)
                .padding(.bottom, 10)
                
                // Main Content (Visualizer Placeholder)
                Spacer()
                VStack {
                    ZStack {
                        Circle()
                            .fill(Color.honey400.opacity(0.1))
                            .frame(width: 250, height: 250)
                            .blur(radius: 20)
                        
                        RoundedRectangle(cornerRadius: 32)
                            .fill(Color.white)
                            .frame(width: 280, height: 280)
                            .shadow(color: .honey900.opacity(0.1), radius: 20, x: 0, y: 10)
                            .overlay(
                                Text("No Track Playing")
                                    .font(.title3)
                                    .fontWeight(.medium)
                                    .foregroundColor(.honey900.opacity(0.4))
                            )
                    }
                }
                Spacer()
                
                // Chat Area (Floating Panel)
                VStack(spacing: 16) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(chatHistory, id: \.self) { msg in
                                HStack {
                                    if msg.role == .user { Spacer() }
                                    Text(msg.content)
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 12)
                                        .background(msg.role == .user ? Color.honey900 : Color.white)
                                        .foregroundColor(msg.role == .user ? .white : .honey900)
                                        .cornerRadius(20)
                                        .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
                                    if msg.role == .agent { Spacer() }
                                }
                            }
                        }
                    }
                    .frame(height: 200)
                    .mask(LinearGradient(gradient: Gradient(colors: [.clear, .black, .black]), startPoint: .top, endPoint: .center))

                    HStack {
                        TextField("Command the deck...", text: $message)
                            .padding()
                            .background(Color.white)
                            .cornerRadius(24)
                            .shadow(color: .honey900.opacity(0.05), radius: 10, x: 0, y: 4)
                            .foregroundColor(.honey900)
                        
                        Button(action: sendMessage) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 44))
                                .foregroundColor(.honey900)
                                .shadow(color: .honey900.opacity(0.2), radius: 8, x: 0, y: 4)
                        }
                    }
                }
                .padding()
                .background(Color.white.opacity(0.6).blur(radius: 10))
                .cornerRadius(32, corners: [.topLeft, .topRight])
            }
        }
    }
    
    func sendMessage() {
        guard !message.isEmpty else { return }
        withAnimation {
            chatHistory.append(ChatMessage(role: .user, content: message))
            message = ""
            // Mock response
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                withAnimation {
                    chatHistory.append(ChatMessage(role: .agent, content: "Searching for track..."))
                }
            }
        }
    }
}

// Rounded Corner Extension
extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape( RoundedCorner(radius: radius, corners: corners) )
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: radius, height: radius))
        return Path(path.cgPath)
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
