import SwiftUI

/// Serif + ink conversation list shown when the chat sheet swaps to the list
/// panel. Mirrors the web ConversationList component but rendered with
/// SwiftUI's List for built-in swipe actions and tint-free transparent rows.
struct ConversationsView: View {
    @ObservedObject var store: ConversationsStore
    let track: MoodTrack?
    let userId: String?
    let onSelect: (String) -> Void
    let onNew: () -> Void

    @State private var renameTarget: Conversation?
    @State private var renameText: String = ""

    private var ink: Color { track?.ink ?? .white.opacity(0.9) }
    private var ink2: Color { track?.ink2 ?? .white.opacity(0.7) }
    private var ink3: Color { track?.ink3 ?? .white.opacity(0.5) }

    var body: some View {
        List {
            // Header action row — "new chat" mirrors the "+" button in web.
            Section {
                Button(action: onNew) {
                    HStack(spacing: 10) {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(ink)
                        Text("New conversation")
                            .font(.system(size: 15, weight: .medium, design: .serif))
                            .foregroundStyle(ink)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .listRowBackground(Color.clear)
                .listRowSeparatorTint(track?.ruleColor ?? .white.opacity(0.15))
            }

            if store.conversations.isEmpty && !store.isLoading {
                emptyState
            } else {
                ForEach(store.conversations) { conv in
                    ConversationRow(
                        conversation: conv,
                        isActive: conv.id == store.activeSessionId,
                        ink: ink,
                        ink2: ink2,
                        ink3: ink3,
                        rule: track?.ruleColor ?? .white.opacity(0.15)
                    )
                    .contentShape(Rectangle())
                    .onTapGesture {
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.5)
                        onSelect(conv.id)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparatorTint(track?.ruleColor ?? .white.opacity(0.15))
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            Task { await delete(conv) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        Button {
                            renameTarget = conv
                            renameText = conv.title ?? ""
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        .tint(.indigo)
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: false) {
                        Button {
                            Task { await togglePin(conv) }
                        } label: {
                            Label(conv.isPinned ? "Unpin" : "Pin",
                                  systemImage: conv.isPinned ? "pin.slash" : "pin")
                        }
                        .tint(.orange)
                    }
                }

                if store.hasMore {
                    Color.clear
                        .frame(height: 24)
                        .listRowBackground(Color.clear)
                        .onAppear {
                            if let uid = userId {
                                Task { await store.loadMore(userId: uid) }
                            }
                        }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .refreshable {
            if let uid = userId { await store.refresh(userId: uid) }
        }
        .task(id: userId ?? "") {
            guard let uid = userId else { return }
            await store.refresh(userId: uid)
        }
        .alert(
            "Rename conversation",
            isPresented: Binding(
                get: { renameTarget != nil },
                set: { if !$0 { renameTarget = nil } }
            ),
            presenting: renameTarget
        ) { conv in
            TextField("Title", text: $renameText)
            Button("Cancel", role: .cancel) { }
            Button("Save") {
                let title = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !title.isEmpty, let uid = userId else { return }
                Task { await store.rename(id: conv.id, userId: uid, title: title) }
            }
        } message: { _ in
            Text("Enter a new name for this conversation.")
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 6) {
            Text("No conversations yet")
                .font(.system(size: 14, design: .serif))
                .italic()
                .foregroundStyle(ink3)
            Text("Send a message to start one.")
                .font(.system(size: 12, design: .serif))
                .foregroundStyle(ink3.opacity(0.75))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .listRowBackground(Color.clear)
    }

    private func delete(_ conv: Conversation) async {
        guard let uid = userId else { return }
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.6)
        await store.delete(id: conv.id, userId: uid)
    }

    private func togglePin(_ conv: Conversation) async {
        guard let uid = userId else { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.5)
        await store.setPinned(id: conv.id, userId: uid, isPinned: !conv.isPinned)
    }
}

// MARK: - Row

private struct ConversationRow: View {
    let conversation: Conversation
    let isActive: Bool
    let ink: Color
    let ink2: Color
    let ink3: Color
    let rule: Color

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if conversation.isPinned {
                Image(systemName: "pin.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(ink3)
                    .padding(.top, 5)
            } else if isActive {
                Circle()
                    .fill(ink)
                    .frame(width: 5, height: 5)
                    .padding(.top, 7)
                    .padding(.leading, 2)
            } else {
                // Reserve consistent leading gutter so rows align.
                Color.clear.frame(width: 10, height: 1)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(displayTitle)
                    .font(.system(size: 15, weight: isActive ? .semibold : .regular, design: .serif))
                    .foregroundStyle(ink)
                    .lineLimit(1)
                if let preview = conversation.lastMessagePreview, !preview.isEmpty {
                    Text(preview)
                        .font(.system(size: 12.5, design: .serif))
                        .foregroundStyle(ink3)
                        .lineLimit(1)
                }
                if let rel = relativeTime {
                    Text(rel)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(ink3.opacity(0.75))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
    }

    private var displayTitle: String {
        if let t = conversation.title, !t.isEmpty { return t }
        return "Untitled"
    }

    private var relativeTime: String? {
        let raw = conversation.lastMessageAt ?? conversation.updatedAt
        guard let ms = Double(raw) else { return nil }
        let date = Date(timeIntervalSince1970: ms / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
