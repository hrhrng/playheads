/**
 * AppLayout - Main application layout with sidebar navigation
 * @module components/AppLayout
 *
 * Features:
 * - Resizable left navigation sidebar (drag to resize)
 * - Auto-collapse when dragged below threshold
 * - Persistent width saved to localStorage
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { useNavSidebarState } from '../hooks/useNavSidebarState';

interface Conversation {
  id: string;
  title?: string;
  is_pinned?: boolean;
  message_count?: number;
  last_message_preview?: string;
  [key: string]: unknown;
}

interface AppLayoutProps {
  /** Main content children */
  children: React.ReactNode;
  /** Right panel component (e.g., playlist sidebar) */
  rightPanel?: React.ReactNode;
  /** Callback to create new chat */
  onNewChat?: () => void;
  /** Callback when conversation is selected */
  onSelectConversation?: (conversationId: string) => void;
  /** Callback when conversation is deleted */
  onDeleteConversation?: (conversationId: string) => void;
  /** Callback when conversation is pinned/unpinned */
  onPinConversation?: (conversationId: string, isPinned: boolean) => void;
  /** Callback when conversation is renamed */
  onRenameConversation?: (conversationId: string, newTitle: string) => void;
  /** List of conversations */
  conversations?: Conversation[];
  /** ID of the currently active conversation */
  activeConversationId?: string | null;
}

/**
 * AppLayout - Main application layout with navigation sidebar
 * Handles conversation management, deletion confirmation, and responsive layout
 */
export const AppLayout = ({
  children,
  rightPanel,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onPinConversation,
  onRenameConversation,
  conversations = [],
  activeConversationId = null
}: AppLayoutProps): React.JSX.Element => {
  // Use persisted state for nav sidebar to survive page navigation
  const { expanded, setExpanded, width, setWidth, COLLAPSED_WIDTH } = useNavSidebarState();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);

  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  /**
   * Handle mouse down on resize handle - start drag operation
   */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  /**
   * Handle mouse move during drag - update width
   */
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate new width based on mouse position
      const newWidth = e.clientX;
      setWidth(newWidth, true); // isDragging = true for auto-collapse/expand
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    // Add global listeners for smooth dragging
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Disable text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, setWidth]);

  // Handle pin click
  const handlePin = (conv: Conversation, e: React.MouseEvent): void => {
    e.stopPropagation();
    onPinConversation?.(conv.id, !conv.is_pinned);
  };

  // Handle delete button click - open dialog
  const handleDelete = (conv: Conversation, e: React.MouseEvent): void => {
    e.stopPropagation(); // Prevent conversation selection
    setConversationToDelete(conv);
    setDeleteDialogOpen(true);
  };

  // Handle actual deletion after confirmation - optimistic update
  const handleConfirmDelete = async (): Promise<void> => {
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
  const handleCancelDelete = (): void => {
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  // Rename handlers
  const handleRenameStart = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingId(conv.id);
    setEditTitle(conv.title || '');
  };

  const handleRenameSave = () => {
    if (editingId && editTitle.trim()) {
      onRenameConversation?.(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      handleRenameSave();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setEditingId(null);
    }
  };

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="flex h-screen bg-gemini-bg font-sans text-gemini-text overflow-hidden selection:bg-gemini-primary selection:text-white">

      {/* 1. Left Sidebar (Navigation) with resize handle */}
      <nav
        ref={navRef}
        style={{ width: `${width}px` }}
        className={`relative flex flex-col py-6 shrink-0 z-20 ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}`}
      >
        {/* Resize Handle - positioned on the right edge */}
        <div
          onMouseDown={handleResizeStart}
          className={`
            absolute right-0 top-10 bottom-0 w-0.5 cursor-ew-resize z-30
            hover:bg-blue-400 transition-colors
            ${isResizing ? 'bg-blue-500' : 'bg-transparent'}
          `}
          title="Drag to resize"
        />
        {/* Burger Menu / toggle */}
        <div className="mb-8 px-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="nav-btn"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>

        <div className="bg-gemini-hover/50 rounded-3xl mx-2 py-4 flex flex-col gap-2 overflow-hidden overflow-y-auto max-h-[calc(100vh-300px)]">
          {/* New Chat */}
          <div className="mx-2">
            <button
              onClick={onNewChat}
              className="w-full p-3 rounded-xl text-gemini-subtext hover:bg-white transition-colors flex items-center overflow-hidden whitespace-nowrap"
            >
              <div className="w-6 flex justify-center shrink-0">
                <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              </div>
              <span className={`ml-3 truncate text-base font-semibold text-left transition-all duration-300 ${expanded ? 'opacity-100 flex-1' : 'opacity-0 w-0 ml-0 overflow-hidden'}`}>New Chat</span>
            </button>
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-gray-300" />

          {/* Conversation List - Empty state or actual conversations */}
          {conversations.length === 0 ? (
            <div className={`mx-2 p-3 text-gemini-subtext text-sm text-center ${expanded ? '' : 'hidden'}`}>
              No conversations yet
            </div>
          ) : (
            conversations.map((conv, idx) => (
              <div key={conv.id || idx} className="group relative mx-2">
                <button
                  onClick={() => onSelectConversation && onSelectConversation(conv.id)}
                  className={`
                    w-full p-3 rounded-xl transition-colors flex items-center
                    overflow-hidden
                    ${conv.id === activeConversationId
                      ? 'bg-white text-gemini-text font-medium'
                      : 'text-gemini-subtext hover:bg-white'
                    }
                  `}
                >
                  {/* Icon - fixed width column */}
                  <div className="w-6 flex justify-center shrink-0">
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  {/* Title only - left aligned */}
                  {editingId === conv.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      onBlur={handleRenameSave}
                      onClick={handleRenameClick}
                      className="ml-3 flex-1 bg-transparent border-none outline-none text-sm font-medium text-gemini-text p-0 min-w-0"
                    />
                  ) : (
                    <span className={`ml-3 truncate text-sm font-medium text-left transition-all duration-300 ${expanded ? 'opacity-100 flex-1' : 'opacity-0 w-0 ml-0 overflow-hidden'}`}>
                      {conv.title || 'New Conversation'}
                    </span>
                  )}
                </button>

                {/* Hover Actions: Pin, Rename, Delete */}
                {expanded && editingId !== conv.id && (
                  <div className={`
                    absolute right-0 top-1 bottom-1 flex items-center pr-2 pl-8 gap-0.5
                    bg-gradient-to-l from-white via-white to-transparent
                    ${conv.is_pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                    transition-opacity duration-200
                  `}>
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
                      onClick={(e) => handleRenameStart(conv, e)}
                      className="p-1.5 rounded-lg hover:bg-gemini-hover text-gemini-subtext hover:text-gemini-text transition-colors"
                      title="Rename conversation"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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

        {/* Bottom section: User info */}
        <div className="mt-auto flex flex-col gap-2 mb-2 px-4">
          <div className="p-3 flex items-center overflow-hidden whitespace-nowrap">
            <div className="w-6 flex justify-center shrink-0">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0">XY</div>
            </div>
            <div className={`ml-3 flex flex-col text-sm transition-all duration-300 ${expanded ? 'opacity-100 flex-1' : 'opacity-0 w-0 ml-0 overflow-hidden'}`}>
              <span className="font-medium text-gemini-text">Xiaoyang</span>
              <span className="text-[10px] text-gemini-subtext">Free Plan</span>
            </div>
          </div>
        </div>
      </nav>

      {/* 2. Main Content Area (Rounded White Card) */}
      <main className="flex-1 h-full pt-4 relative z-10 min-w-0">
        <div className="bg-white h-full w-full rounded-t-3xl shadow-sm overflow-hidden border border-white relative flex flex-col">
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
