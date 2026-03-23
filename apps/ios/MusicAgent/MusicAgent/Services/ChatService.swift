import Foundation

// MARK: - Vercel AI UI Message Stream v1 Parser

/// Parses the Vercel AI SDK UI Message Stream protocol (v1).
///
/// The protocol uses SSE-like `data: {JSON}\n` lines over WebSocket.
/// See: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
///
/// Message lifecycle:
///   data: {"type":"start","messageId":"..."}
///   data: {"type":"text-start","id":"..."}
///   data: {"type":"text-delta","id":"...","delta":"chunk"}
///   data: {"type":"text-end","id":"..."}
///   data: {"type":"reasoning-start","id":"..."}
///   data: {"type":"reasoning-delta","id":"...","delta":"..."}
///   data: {"type":"reasoning-end","id":"..."}
///   data: {"type":"tool-input-start","toolCallId":"...","toolName":"..."}
///   data: {"type":"tool-input-delta","toolCallId":"...","inputTextDelta":"..."}
///   data: {"type":"tool-input-available","toolCallId":"...","toolName":"...","input":{...}}
///   data: {"type":"tool-output-available","toolCallId":"...","output":"..."}
///   data: {"type":"finish"}
///   data: [DONE]
final class UIMessageStreamParser {
    private var messageId: String?
    private var textParts: [String: String] = [:]        // id -> accumulated text
    private var reasoningParts: [String: String] = [:]    // id -> accumulated reasoning
    private var toolCalls: [String: ToolCallState] = [:]  // toolCallId -> state

    struct ToolCallState {
        let toolCallId: String
        var toolName: String
        var input: String?
        var output: String?
        var status: ToolCallStatus
    }

    /// Parse a single SSE line. Returns true if the stream is done.
    func parseLine(_ line: String) -> StreamEvent {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)

        // SSE data prefix
        let payload: String
        if trimmed.hasPrefix("data: ") {
            payload = String(trimmed.dropFirst(6))
        } else if trimmed.hasPrefix("data:") {
            payload = String(trimmed.dropFirst(5))
        } else {
            // Might be raw JSON (no SSE prefix — Cloudflare Agents sometimes sends raw)
            payload = trimmed
        }

        if payload == "[DONE]" {
            return .done
        }

        // Legacy error format: 3:"error message"
        if payload.hasPrefix("3:") {
            let errorText = String(payload.dropFirst(2)).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
            return .error(errorText)
        }

        guard let data = payload.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return .unknown
        }

        switch type {
        case "start":
            messageId = json["messageId"] as? String
            return .streamStarted

        case "text-start":
            let id = json["id"] as? String ?? UUID().uuidString
            textParts[id] = ""
            return .updated

        case "text-delta":
            let id = json["id"] as? String ?? ""
            let delta = json["delta"] as? String ?? ""
            textParts[id, default: ""] += delta
            return .updated

        case "text-end":
            return .updated

        case "reasoning-start":
            let id = json["id"] as? String ?? UUID().uuidString
            reasoningParts[id] = ""
            return .updated

        case "reasoning-delta":
            let id = json["id"] as? String ?? ""
            let delta = json["delta"] as? String ?? ""
            reasoningParts[id, default: ""] += delta
            return .updated

        case "reasoning-end":
            return .updated

        case "tool-input-start":
            let callId = json["toolCallId"] as? String ?? UUID().uuidString
            let toolName = json["toolName"] as? String ?? "unknown"
            toolCalls[callId] = ToolCallState(
                toolCallId: callId,
                toolName: toolName,
                status: .running
            )
            return .updated

        case "tool-input-delta":
            // Streaming the tool input JSON — we accumulate but don't need to display
            return .updated

        case "tool-input-available":
            let callId = json["toolCallId"] as? String ?? ""
            if var state = toolCalls[callId] {
                if let input = json["input"] {
                    state.input = stringifyJSON(input)
                }
                toolCalls[callId] = state
            }
            return .updated

        case "tool-output-available":
            let callId = json["toolCallId"] as? String ?? ""
            if var state = toolCalls[callId] {
                let outputRaw = json["output"]
                state.output = (outputRaw as? String) ?? stringifyJSON(outputRaw as Any)
                state.status = .completed
                toolCalls[callId] = state

                // Extract _action from output
                if let action = extractAction(from: state.output) {
                    return .action(action, toolCallId: callId)
                }
            }
            return .updated

        case "error":
            let errorText = json["errorText"] as? String ?? "Unknown error"
            return .error(errorText)

        case "finish":
            return .finished

        case "start-step", "finish-step":
            return .updated

        default:
            return .unknown
        }
    }

    /// Build a ChatMessage from the current accumulated state.
    func buildMessage() -> ChatMessage {
        var parts: [MessagePart] = []

        // Add text parts (ordered by insertion — Dictionary may reorder, but typically 1 text part)
        for (_, text) in textParts where !text.isEmpty {
            parts.append(.text(TextPart(content: text)))
        }

        // Add reasoning parts
        for (_, reasoning) in reasoningParts where !reasoning.isEmpty {
            parts.append(.thinking(ThinkingPart(content: reasoning)))
        }

        // Add tool calls
        for (_, tool) in toolCalls {
            var resultValue: AnyCodable?
            if let output = tool.output {
                // Try to parse JSON message for display
                if let data = output.data(using: .utf8),
                   let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let message = parsed["message"] as? String {
                    resultValue = AnyCodable(message)
                } else {
                    resultValue = AnyCodable(output)
                }
            }

            let toolPart = ToolCallPart(
                id: tool.toolCallId,
                type: .toolCall,
                toolName: tool.toolName,
                args: nil,
                result: resultValue,
                status: tool.status
            )
            parts.append(.toolCall(toolPart))
        }

        return ChatMessage(
            id: messageId ?? UUID().uuidString,
            role: .agent,
            parts: parts.isEmpty ? [.text(TextPart(content: ""))] : parts
        )
    }

    /// Reset parser state for a new message.
    func reset() {
        messageId = nil
        textParts.removeAll()
        reasoningParts.removeAll()
        toolCalls.removeAll()
    }

    // MARK: - Private

    private func extractAction(from output: String?) -> [String: Any]? {
        guard let output, let data = output.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = parsed["_action"] as? [String: Any],
              (action["type"] as? String) != nil else { return nil }
        return action
    }

    private func stringifyJSON(_ value: Any) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: value),
           let str = String(data: data, encoding: .utf8) { return str }
        return String(describing: value)
    }
}

enum StreamEvent {
    case streamStarted
    case updated
    case finished
    case done
    case error(String)
    case action([String: Any], toolCallId: String)
    case unknown
}

// MARK: - Chat Service

/// Handles WebSocket communication with the Cloudflare Agents MusicChatAgent.
///
/// Protocol: Cloudflare Agents SDK wraps WebSocket around Vercel AI UI Message Stream v1.
/// The web client uses `useAgent` + `useAgentChat` from `@cloudflare/ai-chat/react`.
/// This service reimplements the client-side protocol in Swift.
@Observable
final class ChatService {
    private var webSocketTask: URLSessionWebSocketTask?
    private var isConnected = false
    private(set) var isStreaming = false

    var onMessageUpdate: ((ChatMessage) -> Void)?
    var onStreamComplete: (() -> Void)?
    var onAction: (([String: Any]) -> Void)?

    private var parser = UIMessageStreamParser()
    private var processedActionIds = Set<String>()
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = .shared
        self.session = URLSession(configuration: config)
    }

    // MARK: - Connection

    /// Connect to the Cloudflare Agents MusicChatAgent Durable Object.
    /// Mirrors: `useAgent({ agent: "MusicChatAgent", name: sessionId })`
    func connect(sessionId: String, userId: String) {
        disconnect()

        let wsURL = AppConfig.wsBaseURL
            .appendingPathComponent("agents/MusicChatAgent")

        var components = URLComponents(url: wsURL, resolvingAgainstBaseURL: true)!
        // Cloudflare Agents SDK uses `name` query param for Durable Object instance ID
        components.queryItems = [
            URLQueryItem(name: "name", value: sessionId),
        ]

        guard let url = components.url else { return }

        var request = URLRequest(url: url)
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

    /// Send a user message to the agent.
    /// Mirrors: `agentSendMessage({ text })` with body `{ session_id, user_id, storefront }`
    func sendMessage(text: String, sessionId: String, userId: String, storefront: String = "us") {
        guard isConnected else { return }

        // The Cloudflare Agents useAgentChat hook sends messages with this shape.
        // The `body` fields are merged into the request by the SDK.
        let payload: [String: Any] = [
            "messages": [
                ["role": "user", "content": text]
            ],
            "body": [
                "session_id": sessionId,
                "user_id": userId,
                "storefront": storefront,
            ]
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let jsonString = String(data: data, encoding: .utf8) else { return }

        isStreaming = true
        parser.reset()

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
                let text: String?
                switch message {
                case .string(let str): text = str
                case .data(let data): text = String(data: data, encoding: .utf8)
                @unknown default: text = nil
                }

                if let text {
                    self.handleRawMessage(text)
                }

                // Continue listening
                self.receiveMessages()

            case .failure(let error):
                print("[ChatService] WebSocket error: \(error)")
                self.isConnected = false
                if self.isStreaming {
                    self.isStreaming = false
                    self.onStreamComplete?()
                }
            }
        }
    }

    /// Handle a raw WebSocket text frame.
    /// The frame may contain multiple SSE lines separated by newlines,
    /// or be a single JSON object (Cloudflare Agents format).
    private func handleRawMessage(_ raw: String) {
        // Split into SSE lines — each `data: {...}` is a separate event
        let lines = raw.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        for line in lines {
            let event = parser.parseLine(line)

            switch event {
            case .streamStarted:
                break

            case .updated:
                let message = parser.buildMessage()
                onMessageUpdate?(message)

            case .action(let action, let toolCallId):
                // Dispatch action only once per tool call (avoid replay on history load)
                if !processedActionIds.contains(toolCallId) {
                    processedActionIds.insert(toolCallId)
                    onAction?(action)
                }
                let message = parser.buildMessage()
                onMessageUpdate?(message)

            case .finished:
                let message = parser.buildMessage()
                onMessageUpdate?(message)

            case .done:
                isStreaming = false
                let message = parser.buildMessage()
                onMessageUpdate?(message)
                onStreamComplete?()

            case .error(let errorText):
                isStreaming = false
                let errorMsg = ChatMessage(role: .agent, text: "Error: \(errorText)")
                onMessageUpdate?(errorMsg)
                onStreamComplete?()

            case .unknown:
                // Try to handle as a Cloudflare Agents envelope message
                handleCloudflareAgentsMessage(line)
            }
        }
    }

    /// Fallback: handle Cloudflare Agents SDK envelope messages that aren't SSE format.
    /// The CF Agents SDK may wrap messages in its own envelope before the SSE stream starts.
    private func handleCloudflareAgentsMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        // Handle history replay — CF Agents sends stored messages on connect
        if let messages = json["messages"] as? [[String: Any]] {
            // These are historical UIMessage objects from the Durable Object SQLite store
            for msg in messages {
                if let role = msg["role"] as? String, role == "assistant",
                   let parts = msg["parts"] as? [[String: Any]] {
                    parseHistoryParts(parts)
                }
            }
        }
    }

    /// Parse historical message parts from Cloudflare Agents history replay.
    private func parseHistoryParts(_ parts: [[String: Any]]) {
        var messageParts: [MessagePart] = []

        for part in parts {
            let type = part["type"] as? String
            switch type {
            case "text":
                let text = part["text"] as? String ?? ""
                if !text.isEmpty {
                    messageParts.append(.text(TextPart(content: text)))
                }

            case "reasoning":
                let text = part["text"] as? String ?? ""
                if !text.isEmpty {
                    messageParts.append(.thinking(ThinkingPart(content: text)))
                }

            default:
                // Tool parts: "tool-invocation", "dynamic-tool", or "tool-*"
                if let typeStr = type, (typeStr.hasPrefix("tool-") || typeStr == "dynamic-tool") {
                    let toolCallId = part["toolCallId"] as? String ?? UUID().uuidString
                    let toolName = part["toolName"] as? String ?? "unknown"
                    let state = part["state"] as? String ?? "pending"

                    let status: ToolCallStatus = {
                        switch state {
                        case "output-available": return .completed
                        case "output-error": return .failed
                        default: return .running
                        }
                    }()

                    // Mark historical actions as processed to prevent re-dispatch
                    processedActionIds.insert(toolCallId)

                    var resultValue: AnyCodable?
                    if let output = part["output"] as? String {
                        if let data = output.data(using: .utf8),
                           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                           let message = parsed["message"] as? String {
                            resultValue = AnyCodable(message)
                        } else {
                            resultValue = AnyCodable(output)
                        }
                    }

                    let toolPart = ToolCallPart(
                        id: toolCallId,
                        type: .toolCall,
                        toolName: toolName,
                        args: nil,
                        result: resultValue,
                        status: status
                    )
                    messageParts.append(.toolCall(toolPart))
                }
            }
        }

        if !messageParts.isEmpty {
            let historyMessage = ChatMessage(role: .agent, parts: messageParts)
            onMessageUpdate?(historyMessage)
        }
    }

    /// Reset processed action IDs (call when switching conversations)
    func resetActionTracking() {
        processedActionIds.removeAll()
    }
}
