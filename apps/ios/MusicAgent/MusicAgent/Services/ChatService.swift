import Foundation

/// Handles WebSocket communication with the Cloudflare Agents MusicChatAgent.
///
/// The Cloudflare Agents SDK WebSocket protocol sends and receives JSON messages.
/// Agent responses stream as incremental updates to a UIMessage structure.
@Observable
final class ChatService {
    private var webSocketTask: URLSessionWebSocketTask?
    private var isConnected = false
    private(set) var isStreaming = false

    var onMessageUpdate: ((ChatMessage) -> Void)?
    var onStreamComplete: (() -> Void)?
    var onAction: (([String: Any]) -> Void)?

    private var currentStreamMessage: ChatMessage?
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = .shared
        self.session = URLSession(configuration: config)
    }

    // MARK: - Connection

    func connect(sessionId: String, userId: String) {
        disconnect()

        let wsURL = AppConfig.wsBaseURL
            .appendingPathComponent("agents/MusicChatAgent")

        var components = URLComponents(url: wsURL, resolvingAgainstBaseURL: true)!
        components.queryItems = [
            URLQueryItem(name: "session_id", value: sessionId),
            URLQueryItem(name: "user_id", value: userId),
        ]

        guard let url = components.url else { return }

        var request = URLRequest(url: url)
        // Attach session cookie
        if let token = KeychainHelper.get(key: "session_token") {
            request.setValue("better-auth.session_token=\(token)", forHTTPHeaderField: "Cookie")
        }

        webSocketTask = session.webSocketTask(with: request)
        webSocketTask?.resume()
        isConnected = true
        receiveMessages()
    }

    func disconnect() {
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        isConnected = false
        isStreaming = false
    }

    // MARK: - Send

    func sendMessage(text: String, sessionId: String, userId: String, storefront: String = "us") {
        guard isConnected else { return }

        let payload: [String: Any] = [
            "type": "cf_agent_message",
            "data": [
                "session_id": sessionId,
                "user_id": userId,
                "storefront": storefront,
                "text": text,
            ]
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let jsonString = String(data: data, encoding: .utf8) else { return }

        isStreaming = true
        currentStreamMessage = ChatMessage(role: .agent, parts: [])

        webSocketTask?.send(.string(jsonString)) { [weak self] error in
            if let error {
                print("[ChatService] Send error: \(error)")
                self?.isStreaming = false
            }
        }
    }

    // MARK: - Receive

    private func receiveMessages() {
        webSocketTask?.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleMessage(text)
                    }
                @unknown default:
                    break
                }
                // Continue listening
                self.receiveMessages()

            case .failure(let error):
                print("[ChatService] Receive error: \(error)")
                self.isConnected = false
                self.isStreaming = false
            }
        }
    }

    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        let messageType = json["type"] as? String

        switch messageType {
        case "cf_agent_message_response":
            // Incremental message update from agent
            if let messageData = json["data"] as? [String: Any] {
                parseAgentMessage(messageData)
            }

        case "cf_agent_message_complete":
            // Stream finished
            isStreaming = false
            if let msg = currentStreamMessage {
                onMessageUpdate?(msg)
            }
            onStreamComplete?()
            currentStreamMessage = nil

        case "cf_agent_error":
            isStreaming = false
            let errorText = (json["data"] as? [String: Any])?["message"] as? String ?? "Unknown error"
            let errorMsg = ChatMessage(role: .agent, text: "Error: \(errorText)")
            onMessageUpdate?(errorMsg)
            currentStreamMessage = nil

        default:
            // Handle other message types or raw message updates
            if let parts = json["parts"] as? [[String: Any]] {
                parseStreamParts(parts)
            }
        }
    }

    private func parseAgentMessage(_ data: [String: Any]) {
        guard let parts = data["parts"] as? [[String: Any]] else { return }
        parseStreamParts(parts)
    }

    private func parseStreamParts(_ parts: [[String: Any]]) {
        var messageParts: [MessagePart] = []

        for part in parts {
            let type = part["type"] as? String
            switch type {
            case "text":
                let content = part["content"] as? String ?? ""
                messageParts.append(.text(TextPart(content: content)))

            case "thinking":
                let content = part["content"] as? String ?? ""
                messageParts.append(.thinking(ThinkingPart(content: content)))

            case "tool_call", "tool-invocation":
                let toolId = part["id"] as? String ?? part["toolCallId"] as? String ?? UUID().uuidString
                let toolName = part["tool_name"] as? String ?? part["toolName"] as? String ?? "unknown"
                let statusStr = part["status"] as? String ?? part["state"] as? String ?? "running"
                let status: ToolCallStatus = {
                    switch statusStr {
                    case "completed", "result": return .completed
                    case "failed", "error": return .failed
                    case "pending": return .pending
                    default: return .running
                    }
                }()

                let toolPart = ToolCallPart(
                    id: toolId,
                    type: .toolCall,
                    toolName: toolName,
                    args: nil,
                    result: nil,
                    status: status
                )
                messageParts.append(.toolCall(toolPart))

                // Check for _action in result
                if let result = part["result"] as? [String: Any],
                   let action = result["_action"] as? [String: Any] {
                    onAction?(action)
                }

            default:
                break
            }
        }

        if !messageParts.isEmpty {
            currentStreamMessage = ChatMessage(
                id: currentStreamMessage?.id ?? UUID().uuidString,
                role: .agent,
                parts: messageParts
            )
            if let msg = currentStreamMessage {
                onMessageUpdate?(msg)
            }
        }
    }
}
