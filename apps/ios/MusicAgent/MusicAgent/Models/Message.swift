import Foundation

enum MessageRole: String, Codable {
    case user
    case agent = "assistant"
}

enum MessagePartType: String, Codable {
    case text
    case thinking
    case toolCall = "tool_call"
}

struct TextPart: Codable, Identifiable {
    let id = UUID()
    let type: MessagePartType
    var content: String

    enum CodingKeys: String, CodingKey {
        case type, content
    }

    init(content: String) {
        self.type = .text
        self.content = content
    }
}

struct ThinkingPart: Codable, Identifiable {
    let id = UUID()
    let type: MessagePartType
    var content: String

    enum CodingKeys: String, CodingKey {
        case type, content
    }

    init(content: String) {
        self.type = .thinking
        self.content = content
    }
}

enum ToolCallStatus: String, Codable {
    case pending
    case running
    case completed
    case failed
}

struct ToolCallPart: Codable, Identifiable {
    let id: String
    let type: MessagePartType
    let toolName: String
    var args: [String: AnyCodable]?
    var result: AnyCodable?
    var status: ToolCallStatus

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case toolName = "tool_name"
        case args
        case result
        case status
    }
}

enum MessagePart: Identifiable {
    case text(TextPart)
    case thinking(ThinkingPart)
    case toolCall(ToolCallPart)

    var id: String {
        switch self {
        case .text(let p): return p.id.uuidString
        case .thinking(let p): return p.id.uuidString
        case .toolCall(let p): return p.id
        }
    }
}

struct ChatMessage: Identifiable {
    let id: String
    let role: MessageRole
    var parts: [MessagePart]

    init(id: String = UUID().uuidString, role: MessageRole, parts: [MessagePart]) {
        self.id = id
        self.role = role
        self.parts = parts
    }

    init(id: String = UUID().uuidString, role: MessageRole, text: String) {
        self.id = id
        self.role = role
        self.parts = [.text(TextPart(content: text))]
    }

    var textContent: String {
        parts.compactMap { part in
            if case .text(let t) = part { return t.content }
            return nil
        }.joined()
    }
}

/// Type-erased Codable wrapper for JSON values
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map(\.value)
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues(\.value)
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }

    /// Access nested dictionary values
    var dictionary: [String: Any]? { value as? [String: Any] }
    var string: String? { value as? String }
    var array: [Any]? { value as? [Any] }
}
