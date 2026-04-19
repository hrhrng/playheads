import Foundation

/// Dev-only scenarios for verifying the native message list, GenUI registry,
/// and streaming placeholders without the live agent. Cycle through via the
/// debug button in the sheet drag handle.
enum MockScenario: Int, CaseIterable {
    case empty
    case simpleText
    case withReasoning
    case specCardList
    case streaming
    case longConversation
    case allComponents
    case lyricsQuote
    case artistProfile
    case moodBoard
    case timelineEras

    var label: String {
        switch self {
        case .empty:            return "empty"
        case .simpleText:       return "text"
        case .withReasoning:    return "reasoning"
        case .specCardList:     return "spec cards"
        case .streaming:        return "streaming"
        case .longConversation: return "long"
        case .allComponents:    return "all"
        case .lyricsQuote:      return "lyrics"
        case .artistProfile:    return "artist"
        case .moodBoard:        return "mood"
        case .timelineEras:     return "timeline"
        }
    }
}

/// Streaming simulator. Each scenario builds its final state incrementally so
/// the taste of "tokens arriving" / "cards popping in" matches what the real
/// agent stream will feel like. All mutations go through `ConversationStore`
/// so SwiftUI rerenders naturally.
@MainActor
extension ConversationStore {

    // Tunable pacing.
    private static let textCharsPerTick = 3
    private static let textTickMs: UInt64 = 18
    private static let reasoningCharsPerTick = 4
    private static let reasoningTickMs: UInt64 = 22
    private static let prelude: UInt64 = 500     // dots linger before anything arrives
    private static let interPart: UInt64 = 220   // gap between reasoning→text→spec
    private static let specItemMs: UInt64 = 140  // gap between cards appearing

    func streamMock(_ scenario: MockScenario) async {
        switch scenario {
        case .empty:
            replace(messages: [])

        case .simpleText:
            replace(messages: [
                .init(id: "u1", role: .user, text: "what's this track about?"),
                .init(id: "a1", role: .agent, text: "")
            ])
            await sleep(Self.prelude)
            await streamText(id: "a1",
                target: "It sits in a late-70s AOR pocket—warm analog guitars, a wide stereo image, and a vocal mixed just above the bed.")

        case .withReasoning:
            replace(messages: [
                .init(id: "u2", role: .user, text: "why does it hit so hard at the bridge?"),
                .init(id: "a2", role: .agent, text: "")
            ])
            await sleep(Self.prelude)
            await streamReasoning(id: "a2",
                target: "The user is asking about perceived emotional impact. The section at 2:14 removes the drum bus and rhythm guitars, which is a common tension-release setup.")
            await sleep(Self.interPart)
            await streamText(id: "a2",
                target: "The bridge drops every instrument except a sub-bass and a single overdub, then returns at full dynamics. Classic contrast trick.")

        case .specCardList:
            replace(messages: [
                .init(id: "u3", role: .user, text: "play me 3 similar tracks."),
                .init(id: "a3", role: .agent, text: "")
            ])
            await sleep(Self.prelude)
            await streamText(id: "a3", target: "These share the late-night pocket you're on:")
            await sleep(Self.interPart)
            await streamSpec(id: "a3", target: Self.specSimilarVibes())

        case .streaming:
            // Pure "thinking" — agent message stays empty so StreamingDots
            // runs indefinitely (or until next cycle).
            replace(messages: [
                .init(id: "u4", role: .user, text: "tell me a fun fact about this album"),
                .init(id: "a4", role: .agent, text: "")
            ])

        case .lyricsQuote:
            replace(messages: [
                .init(id: "u-lyr", role: .user, text: "remind me of that bridge line"),
                .init(id: "a-lyr", role: .agent, text: "")
            ])
            await sleep(Self.prelude)
            await streamText(id: "a-lyr", target: "You were searching for this one:")
            await sleep(Self.interPart)
            await streamSpec(id: "a-lyr", target: Self.specLyrics())

        case .artistProfile:
            replace(messages: [
                .init(id: "u-art", role: .user, text: "tell me about kastelruther spatzen"),
                .init(id: "a-art", role: .agent, text: "")
            ])
            await sleep(Self.prelude)
            await streamSpec(id: "a-art", target: Self.specArtist())

        case .moodBoard:
            replace(messages: [
                .init(id: "u-mb", role: .user, text: "set a late-night focus mood"),
                .init(id: "a-mb", role: .agent, text: "")
            ])
            await sleep(Self.prelude)
            await streamSpec(id: "a-mb", target: Self.specMoodBoard())

        case .timelineEras:
            replace(messages: [
                .init(id: "u-tl", role: .user, text: "how has their sound evolved?"),
                .init(id: "a-tl", role: .agent, text: "")
            ])
            await sleep(Self.prelude)
            await streamText(id: "a-tl", target: "Three rough chapters:")
            await sleep(Self.interPart)
            await streamSpec(id: "a-tl", target: Self.specTimeline())

        case .allComponents:
            replace(messages: [
                .init(id: "u-all", role: .user, text: "show me everything you can render"),
                .init(id: "a-all", role: .agent, text: "")
            ])
            await sleep(Self.prelude)
            await streamText(id: "a-all", target: "A guided tour of the renderer:")
            await sleep(Self.interPart)
            await streamSpec(id: "a-all", target: Self.specAll())

        case .longConversation:
            replace(messages: [])
            await append(.init(id: "u5", role: .user, text: "hey"))
            await append(.init(id: "a5", role: .agent, text: ""))
            await sleep(Self.prelude)
            await streamText(id: "a5", target: "Hey. What's on?")

            await sleep(400)
            await append(.init(id: "u6", role: .user, text: "something new. moody, late-night."))
            await append(.init(id: "a6", role: .agent, text: ""))
            await sleep(Self.prelude)
            await streamText(id: "a6", target: "Here's a starter trio. Swap any one out and I'll pivot.")
            await sleep(Self.interPart)
            await streamSpec(id: "a6", target: Self.specSimilarVibes())

            await sleep(500)
            await append(.init(id: "u7", role: .user, text: "second one. louder."))
            await append(.init(id: "a7", role: .agent, text: ""))
            await sleep(Self.prelude)
            await streamText(id: "a7", target: "Pushed it up. Telling queue to drop the first and make room.")
        }
    }

    // MARK: - Streaming primitives

    private func append(_ message: ChatMessage) async {
        var next = messages
        next.append(message)
        replace(messages: next)
        await sleep(60)
    }

    private func streamText(id: String, target: String) async {
        await stream(id: id, target: target, charsPerTick: Self.textCharsPerTick, tickMs: Self.textTickMs) { msg, chunk in
            msg.text = chunk
        }
    }

    private func streamReasoning(id: String, target: String) async {
        await stream(id: id, target: target, charsPerTick: Self.reasoningCharsPerTick, tickMs: Self.reasoningTickMs) { msg, chunk in
            msg.reasoning = chunk
        }
    }

    private func stream(
        id: String,
        target: String,
        charsPerTick: Int,
        tickMs: UInt64,
        apply: (inout ChatMessage, String) -> Void
    ) async {
        let chars = Array(target)
        var cursor = 0
        while cursor < chars.count {
            if Task.isCancelled { return }
            cursor = min(cursor + charsPerTick, chars.count)
            let chunk = String(chars[0..<cursor])
            update(id: id) { apply(&$0, chunk) }
            await sleep(tickMs)
        }
    }

    private func streamSpec(id: String, target: Spec) async {
        guard let rootEl = target.elements[target.root] else { return }
        // Start with root only, no children — Section title/subtitle appears first.
        var built = Spec(
            root: target.root,
            elements: [target.root: UIElement(type: rootEl.type, props: rootEl.props, children: [])]
        )
        update(id: id) { $0.spec = built }
        await sleep(Self.specItemMs)

        for childKey in rootEl.children {
            if Task.isCancelled { return }
            guard let child = target.elements[childKey] else { continue }
            built.elements[childKey] = child
            var rootCopy = built.elements[target.root]!
            rootCopy.children.append(childKey)
            built.elements[target.root] = rootCopy
            update(id: id) { $0.spec = built }
            await sleep(Self.specItemMs)
        }
    }

    private func sleep(_ ms: UInt64) async {
        try? await Task.sleep(nanoseconds: ms * 1_000_000)
    }

    // MARK: - Spec fixture

    fileprivate static func specLyrics() -> Spec {
        Spec(specDict: [
            "root": "l1",
            "elements": [
                "l1": [
                    "type": "LyricsCard",
                    "props": [
                        "lines": [
                            "Wenn der Abend kommt und die Sterne wachen,",
                            "bleibt die Sehnsucht wach in unsrer Nacht."
                        ],
                        "trackName": "Nur Gesundheit",
                        "artist": "Kastelruther Spatzen"
                    ]
                ]
            ]
        ])!
    }

    fileprivate static func specArtist() -> Spec {
        Spec(specDict: [
            "root": "ar",
            "elements": [
                "ar": [
                    "type": "ArtistSpotlight",
                    "props": [
                        "name": "Kastelruther Spatzen",
                        "subtitle": "Volksmusik · South Tyrol",
                        "bio": "Six-piece from the Dolomites, active since the 70s. Known for a velvety close-harmony approach and accordion-forward arrangements that never tip into kitsch.",
                        "stats": [
                            ["label": "Formed", "value": "1979"],
                            ["label": "Albums", "value": "32"],
                            ["label": "Members", "value": "6"]
                        ]
                    ]
                ]
            ]
        ])!
    }

    fileprivate static func specMoodBoard() -> Spec {
        Spec(specDict: [
            "root": "mb",
            "elements": [
                "mb": [
                    "type": "MoodBoard",
                    "props": [
                        "mood": "Late-night focus",
                        "description": "Soft attack, low-mid weight, minimal percussion. Room to breathe.",
                        "emoji": "🌌",
                        "gradient": ["#6b5b95", "#b8a5c7"]
                    ],
                    "children": ["mb-bg", "mb-tc"]
                ],
                "mb-bg": [
                    "type": "BadgeGroup",
                    "props": [
                        "badges": [
                            ["label": "ambient"],
                            ["label": "70bpm"],
                            ["label": "serif lyrics", "color": "#c9a86b"]
                        ]
                    ]
                ],
                "mb-tc": [
                    "type": "TrackCard",
                    "props": ["title": "Drift", "artist": "Unknown Mountain"]
                ]
            ]
        ])!
    }

    fileprivate static func specTimeline() -> Spec {
        Spec(specDict: [
            "root": "tl",
            "elements": [
                "tl": [
                    "type": "Section",
                    "props": ["title": "Career arc"],
                    "children": ["era1", "era2", "era3"]
                ],
                "era1": [
                    "type": "TimelineEra",
                    "props": [
                        "year": "1979",
                        "label": "Formation",
                        "description": "Village-band instincts; traditional repertoire with close harmony."
                    ]
                ],
                "era2": [
                    "type": "TimelineEra",
                    "props": [
                        "year": "1990s",
                        "label": "Breakthrough",
                        "description": "Studio polish, wider distribution, Grand Prix circuit."
                    ],
                    "children": ["era2-album"]
                ],
                "era2-album": [
                    "type": "AlbumCard",
                    "props": ["title": "Bleibt Bei Uns", "subtitle": "Kastelruther Spatzen", "year": "1995"]
                ],
                "era3": [
                    "type": "TimelineEra",
                    "props": [
                        "year": "2010s→",
                        "label": "Late-period",
                        "description": "Sparser production, returning to the intimate room sound of the early years."
                    ]
                ]
            ]
        ])!
    }

    fileprivate static func specAll() -> Spec {
        Spec(specDict: [
            "root": "all",
            "elements": [
                "all": [
                    "type": "Section",
                    "props": ["title": "Every component", "subtitle": "One sample of each"],
                    "children": ["all-text", "all-badges", "all-stats", "all-div", "all-artist", "all-mood", "all-album", "all-lyrics", "all-track"]
                ],
                "all-text": [
                    "type": "TextBlock",
                    "props": ["text": "TextBlock handles the prose passages between cards.", "variant": "body"]
                ],
                "all-badges": [
                    "type": "BadgeGroup",
                    "props": ["badges": [
                        ["label": "late-night"],
                        ["label": "analog", "color": "#c9a86b"],
                        ["label": "70bpm"],
                        ["label": "soft-attack"]
                    ]]
                ],
                "all-stats": [
                    "type": "Stat",
                    "props": ["value": "3:24", "label": "Avg length"]
                ],
                "all-div": ["type": "Divider", "props": [:]],
                "all-artist": [
                    "type": "ArtistSpotlight",
                    "props": [
                        "name": "Unknown Mountain",
                        "subtitle": "Ambient · Kyoto",
                        "bio": "Small-room ambient project known for tape-saturated piano and generous reverb tails."
                    ]
                ],
                "all-mood": [
                    "type": "MoodBoard",
                    "props": [
                        "mood": "Drift",
                        "description": "Slow, melodic, patient.",
                        "emoji": "🌫"
                    ]
                ],
                "all-album": [
                    "type": "AlbumCard",
                    "props": ["title": "Fantasy", "subtitle": "Jay Chou", "year": "2001"]
                ],
                "all-lyrics": [
                    "type": "LyricsCard",
                    "props": [
                        "lines": ["The room stayed quiet long after the record ended."],
                        "trackName": "Nocturne",
                        "artist": "Jay Chou"
                    ]
                ],
                "all-track": [
                    "type": "TrackCard",
                    "props": ["title": "Rainy Sunday", "artist": "Kastelruther Spatzen", "album": "Südtirol"]
                ]
            ]
        ])!
    }

    fileprivate static func specSimilarVibes() -> Spec {
        Spec(specDict: [
            "root": "s1",
            "elements": [
                "s1": [
                    "type": "Section",
                    "props": ["title": "Similar vibes", "subtitle": "3 tracks from the same mood cluster"],
                    "children": ["c1", "c2", "c3", "d1", "t1"]
                ],
                "c1": [
                    "type": "TrackCard",
                    "props": ["title": "Nocturne", "artist": "Jay Chou", "album": "Fantasy"]
                ],
                "c2": [
                    "type": "TrackCard",
                    "props": ["title": "Rainy Sunday", "artist": "Kastelruther Spatzen", "album": "Südtirol"]
                ],
                "c3": [
                    "type": "TrackCard",
                    "props": ["title": "Drift", "artist": "Unknown Mountain"]
                ],
                "d1": ["type": "Divider", "props": [:]],
                "t1": [
                    "type": "TextBlock",
                    "props": ["text": "These share a soft-attack percussion pocket and vocals mixed just above the bed.", "variant": "caption"]
                ]
            ]
        ])!
    }
}
