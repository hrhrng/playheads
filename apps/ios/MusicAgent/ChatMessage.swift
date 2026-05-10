import Foundation

enum MessageRole: String {
    case user
    case agent
    case system
}

/// Mirrors what `apps/mobile-chat/App.tsx` emits via `ChatBridge.updateMessages`:
/// a single agent reply may carry text (post-YAML-strip), reasoning, a
/// json-render spec, or any combo. User messages are plain text.
struct ChatMessage: Identifiable, Equatable {
    let id: String
    let role: MessageRole
    var text: String
    var reasoning: String?
    var spec: Spec?
    /// `submitted` / `streaming` / `ready` / `error` — passes through for
    /// rendering spinners / stop buttons. Not strongly typed yet.
    var status: String?

    init(id: String, role: MessageRole, text: String, reasoning: String? = nil, spec: Spec? = nil, status: String? = nil) {
        self.id = id
        self.role = role
        self.text = text
        self.reasoning = reasoning
        self.spec = spec
        self.status = status
    }

    /// Decode a UIMessage dict that RN assembled from `useAgentChat` +
    /// `@json-render/react`. Shape:
    /// ```
    /// { id, role: 'user'|'agent', text, reasoning?, spec?, status? }
    /// ```
    init?(uiMessageDict dict: [String: Any]) {
        guard
            let id = dict["id"] as? String,
            let roleRaw = dict["role"] as? String,
            let role = MessageRole(rawValue: roleRaw == "assistant" ? "agent" : roleRaw)
        else { return nil }

        self.id = id
        self.role = role
        self.text = (dict["text"] as? String) ?? ""
        let r = dict["reasoning"] as? String
        self.reasoning = (r?.isEmpty == false) ? r : nil
        self.spec = Spec(specDict: dict["spec"])
        self.status = dict["status"] as? String
    }
}

struct PendingCommand: Equatable {
    let text: String
    let nonce: String
}

/// Singleton so the RN bridge (ObjC-land) has a fixed address to deposit
/// messages into without needing an injection ceremony. SwiftUI observes.
@MainActor
final class ConversationStore: ObservableObject {
    static let shared = ConversationStore()

    @Published private(set) var messages: [ChatMessage] = []
    /// Set by the native composer; flows to RN via `ChatHostRepresentable`'s
    /// `appProperties` so `useAgentChat.sendMessage` can be called on the
    /// JS side. Nonce ensures the same text twice still triggers a send.
    @Published var pendingUserMessage: PendingCommand?

    /// Dev-only cursor into MockScenario cases so the sheet's ladybug button
    /// can step through fixtures.
    @Published private(set) var mockIndex: Int = -1
    var mockLabel: String {
        guard mockIndex >= 0, mockIndex < MockScenario.allCases.count else { return "mock" }
        return MockScenario.allCases[mockIndex].label
    }

    /// Active streaming simulation so switching scenarios cancels the
    /// previous run instead of interleaving chars.
    private var streamingTask: Task<Void, Never>?

    private init() {}

    func replace(messages: [ChatMessage]) {
        self.messages = messages
    }

    /// Cancel any in-flight mock streaming. Called when a real session
    /// switches in so dev fixtures don't leak text into the real transcript.
    func cancelMockStream() {
        streamingTask?.cancel()
        streamingTask = nil
    }

    /// Mutate a message in place by id. Used by the streaming simulator to
    /// append text / reasoning / spec elements as they "arrive".
    func update(id: String, _ mutate: (inout ChatMessage) -> Void) {
        guard let idx = messages.firstIndex(where: { $0.id == id }) else { return }
        var m = messages[idx]
        mutate(&m)
        messages[idx] = m
    }

    func cycleMockScenario() {
        mockIndex = (mockIndex + 1) % MockScenario.allCases.count
        let scenario = MockScenario.allCases[mockIndex]
        streamingTask?.cancel()
        streamingTask = Task { [weak self] in
            await self?.streamMock(scenario)
        }
    }

    func sendUser(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let cmd = PendingCommand(text: trimmed, nonce: UUID().uuidString)
        pendingUserMessage = cmd
        // RN's `useAgentChat` consumes pendingUserMessage within a few render
        // cycles. Clear it shortly after so a remount of the chat host
        // (closing + reopening the chat sheet, or a session swap) doesn't
        // re-fire sendMessage with the same payload — the embedded JS
        // resets its `lastNonce` ref on every fresh mount.
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard let self else { return }
            if self.pendingUserMessage?.nonce == cmd.nonce {
                self.pendingUserMessage = nil
            }
        }
    }

    func handleMusicAction(_ payload: NSDictionary) {
        // TODO: route to PlaybackController / queue ops. Web does this inside
        // useAgentChatAdapter.ts's onData — we get the same payload here.
    }
}
