import SwiftUI

struct ConversationListView: View {
    let viewModel: ConversationListViewModel
    let onSelect: (Conversation) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var renameTarget: Conversation?
    @State private var renameText = ""
    @State private var showRenameAlert = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.honey50.ignoresSafeArea()

                if viewModel.conversations.isEmpty && !viewModel.isLoading {
                    VStack(spacing: 12) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.largeTitle)
                            .foregroundColor(.honey900.opacity(0.3))
                        Text("No conversations yet")
                            .foregroundColor(.honey900.opacity(0.5))
                    }
                } else {
                    List {
                        // Pinned
                        if !viewModel.pinnedConversations.isEmpty {
                            Section("Pinned") {
                                ForEach(viewModel.pinnedConversations) { conversation in
                                    conversationRow(conversation)
                                }
                            }
                        }

                        // Recent
                        Section("Recent") {
                            ForEach(viewModel.unpinnedConversations) { conversation in
                                conversationRow(conversation)
                            }

                            if viewModel.hasMore {
                                Button("Load more...") {
                                    Task { await viewModel.loadMore() }
                                }
                                .foregroundColor(.honey900)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                    .refreshable {
                        await viewModel.loadConversations()
                    }
                }

                if viewModel.isLoading && viewModel.conversations.isEmpty {
                    ProgressView()
                        .tint(.honey900)
                }
            }
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.honey900)
                }
            }
            .alert("Rename", isPresented: $showRenameAlert) {
                TextField("Title", text: $renameText)
                Button("Cancel", role: .cancel) {}
                Button("Save") {
                    if let target = renameTarget {
                        Task { await viewModel.rename(target, to: renameText) }
                    }
                }
            }
        }
    }

    private func conversationRow(_ conversation: Conversation) -> some View {
        Button {
            onSelect(conversation)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    if conversation.isPinned {
                        Image(systemName: "pin.fill")
                            .font(.caption2)
                            .foregroundColor(.honey400)
                    }
                    Text(conversation.title ?? "New conversation")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.honey900)
                        .lineLimit(1)
                }

                if let preview = conversation.lastMessagePreview {
                    Text(preview)
                        .font(.caption)
                        .foregroundColor(.honey900.opacity(0.5))
                        .lineLimit(2)
                }
            }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                Task { await viewModel.deleteConversation(conversation.id) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading) {
            Button {
                Task { await viewModel.togglePin(conversation) }
            } label: {
                Label(
                    conversation.isPinned ? "Unpin" : "Pin",
                    systemImage: conversation.isPinned ? "pin.slash" : "pin"
                )
            }
            .tint(.honey400)
        }
        .contextMenu {
            Button {
                renameTarget = conversation
                renameText = conversation.title ?? ""
                showRenameAlert = true
            } label: {
                Label("Rename", systemImage: "pencil")
            }

            Button {
                Task { await viewModel.togglePin(conversation) }
            } label: {
                Label(
                    conversation.isPinned ? "Unpin" : "Pin",
                    systemImage: conversation.isPinned ? "pin.slash" : "pin"
                )
            }

            Button(role: .destructive) {
                Task { await viewModel.deleteConversation(conversation.id) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }
}
