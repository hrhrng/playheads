import Foundation

/// Mirror of `@json-render/core`'s Spec: a flat element map keyed by string,
/// with a designated root. Children point at other keys in the same map.
struct Spec: Equatable {
    var root: String
    var elements: [String: UIElement]

    init(root: String, elements: [String: UIElement]) {
        self.root = root
        self.elements = elements
    }

    init?(specDict raw: Any?) {
        guard let dict = raw as? [String: Any],
              let root = dict["root"] as? String,
              let rawElements = dict["elements"] as? [String: Any] else {
            return nil
        }
        self.root = root
        self.elements = rawElements.reduce(into: [:]) { acc, pair in
            if let el = UIElement(dict: pair.value) {
                acc[pair.key] = el
            }
        }
    }
}

/// Single element in a spec. `children` holds keys (not nested elements) —
/// resolve via `Spec.elements[childKey]`.
struct UIElement: Equatable {
    var type: String
    var props: JSONValue
    var children: [String]

    init(type: String, props: JSONValue, children: [String] = []) {
        self.type = type
        self.props = props
        self.children = children
    }

    init?(dict raw: Any) {
        guard let dict = raw as? [String: Any],
              let type = dict["type"] as? String else {
            return nil
        }
        self.type = type
        self.props = JSONValue.from(dict["props"]) ?? .object([:])
        self.children = (dict["children"] as? [String]) ?? []
    }
}

/// Untyped JSON value so GenUI component views can read props without us
/// having to pre-declare every schema. Each view pulls what it needs via
/// the typed accessors (`.string("title")`, `.int("count")`, …).
indirect enum JSONValue: Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    static func from(_ raw: Any?) -> JSONValue? {
        guard let raw else { return .null }
        if raw is NSNull { return .null }
        if let b = raw as? Bool { return .bool(b) }
        if let n = raw as? NSNumber {
            // NSNumber + Bool are unified on Foundation — re-check bool shape.
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return .bool(n.boolValue) }
            return .number(n.doubleValue)
        }
        if let s = raw as? String { return .string(s) }
        if let arr = raw as? [Any] { return .array(arr.compactMap(JSONValue.from)) }
        if let obj = raw as? [String: Any] {
            return .object(obj.reduce(into: [:]) { acc, pair in
                if let v = JSONValue.from(pair.value) { acc[pair.key] = v }
            })
        }
        return nil
    }

    // MARK: - Typed accessors

    func string(_ key: String) -> String? {
        if case let .object(dict) = self, case let .string(v) = dict[key] ?? .null { return v }
        return nil
    }

    func int(_ key: String) -> Int? {
        if case let .object(dict) = self, case let .number(v) = dict[key] ?? .null { return Int(v) }
        return nil
    }

    func double(_ key: String) -> Double? {
        if case let .object(dict) = self, case let .number(v) = dict[key] ?? .null { return v }
        return nil
    }

    func bool(_ key: String) -> Bool? {
        if case let .object(dict) = self, case let .bool(v) = dict[key] ?? .null { return v }
        return nil
    }

    func array(_ key: String) -> [JSONValue]? {
        if case let .object(dict) = self, case let .array(v) = dict[key] ?? .null { return v }
        return nil
    }
}
