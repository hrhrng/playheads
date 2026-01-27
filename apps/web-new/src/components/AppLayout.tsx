
import { useState } from 'react';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface Conversation {
  id: string;
  title?: string;
  message_count: number;
  last_message_preview?: string;
  is_pinned?: boolean;
  updated_at?: string;
}

interface AppLayoutProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  onNewChat?: () => void;
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onPinConversation?: (id: string, isPinned: boolean) => void;
  conversations?: Conversation[];
  activeConversationId?: string | null;
}

export const AppLayout = ({
  children,
  rightPanel,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onPinConversation,
  conversations = [],
  activeConversationId = null
}: AppLayoutProps) => {
    const [expanded, setExpanded] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);

    // Handle pin click
    const handlePin = (conv: Conversation, e: React.MouseEvent) => {
        e.stopPropagation();
        onPinConversation?.(conv.id, !conv.is_pinned);
    };

    // Handle delete button click - open dialog
    const handleDelete = (conv: Conversation, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent conversation selection
        setConversationToDelete(conv);
        setDeleteDialogOpen(true);
    };

    // Handle actual deletion after confirmation - optimistic update
    const handleConfirmDelete = async () => {
        if (!conversationToDelete) return;

        const convId = conversationToDelete.id;

        // Immediately close dialog and update UI (optimistic)
        setDeleteDialogOpen(false);
        onDeleteConversation?.(convId);
        setConversationToDelete(null);

        // Then send delete request to backend
        try {
            const res = await fetch(`http://localhost:8000/conversations/${convId}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                throw new Error('Delete failed');
            }
        } catch (err) {
            // If backend fails, show error but keep UI updated
            console.error('Failed to delete conversation:', err);
            // Optionally: could implement rollback here if needed
        }
    };

    // Handle dialog cancel
    const handleCancelDelete = () => {
        setDeleteDialogOpen(false);
        setConversationToDelete(null);
    };

    return (
        <div className="flex h-screen bg-gemini-bg font-sans text-gemini-text overflow-hidden selection:bg-gemini-primary selection:text-white">

            {/* 1. Left Sidebar (Navigation) */}
            <nav className={`${expanded ? 'w-64' : 'w-[72px]'} flex flex-col py-6 shrink-0 z-20 transition-all duration-300 ease-in-out`}>
                <div className={`mb-8 w-full flex items-center ${expanded ? 'justify-between px-4' : 'justify-center'}`}>
                    {/* Burger Menu / toggle */}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-3 rounded-xl hover:bg-gemini-hover transition-colors text-gemini-subtext hover:text-gemini-text"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                </div>

                <div className="bg-gemini-hover/50 rounded-3xl mx-2 px-1 py-4 flex flex-col gap-2 w-[calc(100%-16px)] overflow-y-auto max-h-[calc(100vh-300px)]">
                    {/* New Chat */}
                    <button
                        onClick={onNewChat}
                        className={`p-3 rounded-2xl bg-gemini-hover text-gemini-text shadow-sm hover:shadow-md transition-all flex items-center ${expanded ? 'gap-3' : ''} overflow-hidden whitespace-nowrap ${expanded ? 'justify-start px-4' : 'justify-center'}`}
                    >
                        <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                        <span className={`transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>New Chat</span>
                    </button>

                    {/* Conversation List - Empty state or actual conversations */}
                    {conversations.length === 0 ? (
                        <div className={`p-3 text-gemini-subtext text-sm text-center ${expanded ? '' : 'hidden'}`}>
                            No conversations yet
                        </div>
                    ) : (
                        conversations.map((conv, idx) => (
                            <div key={conv.id || idx} className="group relative">
                                <button
                                    onClick={() => onSelectConversation && onSelectConversation(conv.id)}
                                    className={`
                                        w-full p-3 rounded-xl transition-colors flex flex-col items-start
                                        ${expanded ? 'gap-1' : ''}
                                        overflow-hidden
                                        ${conv.id === activeConversationId
                                            ? 'bg-white text-gemini-text font-medium'
                                            : 'text-gemini-subtext hover:bg-white'
                                        }
                                    `}
                                >
                                    {/* Title row with icon */}
                                    <div className={`flex items-center w-full ${expanded ? 'gap-3' : 'justify-center'}`}>
                                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                            <polyline points="14 2 14 8 20 8" />
                                            <line x1="16" y1="13" x2="8" y2="13" />
                                            <line x1="16" y1="17" x2="8" y2="17" />
                                        </svg>
                                        <div className={`flex-1 flex items-center gap-2 transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
                                            <span className="truncate flex-1 text-sm font-medium">
                                                {conv.title || 'New Conversation'}
                                            </span>
                                            {conv.message_count > 0 && (
                                                <span className="text-xs text-gemini-subtext/60 shrink-0">
                                                    {conv.message_count}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Message preview - only in expanded mode */}
                                    {expanded && conv.last_message_preview && (
                                        <p className="text-xs text-gemini-subtext/70 truncate w-full pl-8">
                                            {conv.last_message_preview}
                                        </p>
                                    )}
                                </button>

                                {/* Pin and Delete buttons - visible on hover or if pinned (for pin button) */}
                                {expanded && (
                                    <div className={`absolute right-2 top-2 flex gap-1 ${conv.is_pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                        <button
                                            onClick={(e) => handlePin(conv, e)}
                                            className={`p-1.5 rounded-lg transition-colors
                                                ${conv.is_pinned
                                                    ? 'text-gemini-primary bg-gemini-primary/10'
                                                    : 'text-gemini-subtext hover:bg-gemini-hover hover:text-gemini-text'
                                                }`}
                                            title={conv.is_pinned ? "Unpin conversation" : "Pin conversation"}
                                        >
                                            <svg className="w-4 h-4" fill={conv.is_pinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={(e) => handleDelete(conv, e)}
                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gemini-subtext hover:text-red-600 transition-colors"
                                            title="Delete conversation"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-auto flex flex-col gap-2 mb-2 w-full px-2">
                    <button className={`p-3 rounded-xl hover:bg-gemini-hover text-gemini-subtext transition-colors flex items-center ${expanded ? 'gap-3' : ''} overflow-hidden whitespace-nowrap ${expanded ? 'justify-start px-4' : 'justify-center'}`}>
                        <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <span className={`transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>Settings</span>
                    </button>
                    <div className={`p-1 flex items-center ${expanded ? 'gap-3' : ''} overflow-hidden whitespace-nowrap ${expanded ? 'justify-start px-4' : 'justify-center'}`}>
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0">XY</div>
                        <div className={`flex flex-col text-sm transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
                            <span className="font-medium text-gemini-text">Xiaoyang</span>
                            <span className="text-[10px] text-gemini-subtext">Free Plan</span>
                        </div>
                    </div>
                </div>
            </nav>

            {/* 2. Main Content Area (Rounded White Card) */}
            <main className="flex-1 h-full py-4 relative z-10 min-w-0">
                <div className="bg-white h-full w-full rounded-3xl shadow-sm overflow-hidden border border-white relative flex flex-col">
                    {children}
                </div>
            </main>

            {/* 3. Right Sidebar (Playlist) */}
            <aside className="shrink-0 z-10">
                {rightPanel}
            </aside>

            {/* Delete Confirmation Dialog */}
            <DeleteConfirmDialog
                isOpen={deleteDialogOpen}
                onConfirm={handleConfirmDelete}
                onCancel={handleCancelDelete}
                conversationTitle={conversationToDelete?.title}
            />

        </div>
    );
};
