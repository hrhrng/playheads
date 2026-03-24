/**
 * AppLayout - Main application layout with sidebar navigation
 * @module components/AppLayout
 *
 * Features:
 * - Resizable left navigation sidebar (drag to resize)
 * - Auto-collapse when dragged below threshold
 * - Persistent width saved to localStorage
 * - Mobile: collapsible nav drawer overlay
 * - Mobile: bottom sheet for playlist
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ConversationList } from './ConversationList';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { UserSettingsPopover } from './UserSettingsPopover';
import { SettingsModal } from './SettingsModal';
import { useNavSidebarState } from '../hooks/useNavSidebarState';
import { PlaylistSheetContext } from '../contexts/PlaylistSheetContext';
import type { Conversation } from '../types';

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
  /** Load more conversations (pagination) */
  onLoadMoreConversations?: () => void;
  /** Whether there are more conversations to load */
  hasMoreConversations?: boolean;
  /** Whether more conversations are currently being loaded */
  isLoadingMoreConversations?: boolean;
  /** User email for settings popover */
  userEmail?: string;
  /** User display name */
  userName?: string;
  /** Logout handler */
  onLogout?: () => void;
  /** Apple Music authorization state */
  isAppleMusicAuthorized?: boolean;
  /** Connect Apple Music */
  onConnectAppleMusic?: () => void;
  /** Disconnect Apple Music */
  onDisconnectAppleMusic?: () => void;
  /** Called before opening the mobile playlist sheet (e.g. to force-expand the sidebar) */
  onOpenPlaylist?: () => void;
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
  activeConversationId = null,
  onLoadMoreConversations,
  hasMoreConversations,
  isLoadingMoreConversations,
  userEmail = '',
  userName = 'User',
  onLogout,
  isAppleMusicAuthorized,
  onConnectAppleMusic,
  onDisconnectAppleMusic,
  onOpenPlaylist,
}: AppLayoutProps): React.JSX.Element => {
  // Use persisted state for nav sidebar to survive page navigation
  const { expanded, setExpanded, width, setWidth, COLLAPSED_WIDTH } = useNavSidebarState();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobilePlaylistOpen, setMobilePlaylistOpen] = useState(false);

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

  // Close mobile nav when a conversation is selected
  const handleSelectConversation = useCallback((conversationId: string) => {
    setMobileNavOpen(false);
    onSelectConversation?.(conversationId);
  }, [onSelectConversation]);

  // Handle new chat from mobile nav
  const handleNewChat = useCallback(() => {
    setMobileNavOpen(false);
    onNewChat?.();
  }, [onNewChat]);

  // Handle delete via ConversationList — open confirmation dialog
  const handleDeleteRequest = (conversationId: string): void => {
    const conv = conversations.find(c => c.id === conversationId);
    if (conv) {
      setConversationToDelete(conv);
      setDeleteDialogOpen(true);
    }
  };

  // Handle actual deletion after confirmation — delegate to parent
  const handleConfirmDelete = (): void => {
    if (!conversationToDelete) return;

    const convId = conversationToDelete.id;

    setDeleteDialogOpen(false);
    setConversationToDelete(null);
    onDeleteConversation?.(convId);
  };

  // Handle dialog cancel
  const handleCancelDelete = (): void => {
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  // Shared nav content used in both desktop sidebar and mobile drawer
  const navContent = (isMobile = false) => (
    <>
      {/* Burger Menu / toggle (desktop only) */}
      {!isMobile && (
        <div className="mb-3 px-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="nav-btn"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
      )}

      {/* New Chat — always at this level, same position expanded or collapsed */}
      <div className="px-4 mb-2">
        <button
          onClick={handleNewChat}
          className="w-full p-3 rounded-xl text-gemini-subtext hover:bg-gemini-hover transition-colors flex items-center overflow-hidden whitespace-nowrap"
        >
          <div className="w-6 flex justify-center shrink-0">
            <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          </div>
          <span className={`ml-3 truncate text-sm font-medium text-left transition-all duration-300 ${isMobile || expanded ? 'opacity-100 flex-1' : 'opacity-0 w-0 ml-0 overflow-hidden'}`}>New Chat</span>
        </button>
      </div>

      {/* Scrollable conversation container — only when expanded */}
      {(isMobile || expanded) && (
        <div className="bg-gemini-hover/50 rounded-3xl mx-2 py-4 flex flex-col gap-2 overflow-hidden overflow-y-auto max-h-[calc(100vh-300px)]">
          {/* Conversation List */}
          <ConversationList
            conversations={conversations}
            expanded={isMobile || expanded}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onPinConversation={onPinConversation}
            onRenameConversation={onRenameConversation}
            onDeleteConversation={handleDeleteRequest}
            onLoadMore={onLoadMoreConversations}
            hasMore={hasMoreConversations}
            isLoadingMore={isLoadingMoreConversations}
          />
        </div>
      )}

      {/* Bottom section: User info with settings popover */}
      <div className="mt-auto mb-2 px-4">
        <div className="p-2 flex items-center overflow-hidden whitespace-nowrap">
          <div className="w-6 flex justify-center shrink-0">
            <UserSettingsPopover
              userEmail={userEmail}
              userName={userName}
              onLogout={onLogout || (() => {})}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
          <div className={`ml-3 flex flex-col text-sm transition-all duration-300 ${isMobile || expanded ? 'opacity-100 flex-1' : 'opacity-0 w-0 ml-0 overflow-hidden'}`}>
            <span className="font-medium text-gemini-text">{userName}</span>
            <span className="text-[10px] text-gemini-subtext truncate">{userEmail}</span>
          </div>
        </div>
      </div>
    </>
  );

  const hasPlaylist = !!rightPanel;

  return (
    <PlaylistSheetContext.Provider value={{ openPlaylist: () => { onOpenPlaylist?.(); setMobilePlaylistOpen(true); }, hasPlaylist, isMobileSheet: false }}>
      <div className="flex flex-col h-screen bg-gemini-bg font-sans text-gemini-text overflow-hidden selection:bg-gemini-primary selection:text-white">

        {/* Mobile Top Bar */}
        <div className="flex md:hidden items-center h-14 px-2 shrink-0 border-b border-gemini-border/50">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-2.5 rounded-xl text-gemini-subtext hover:bg-gemini-hover transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="flex-1 text-center text-sm font-medium text-gemini-text">Playheads</span>
          <button
            onClick={onNewChat}
            className="p-2.5 rounded-xl text-gemini-subtext hover:bg-gemini-hover transition-colors"
            aria-label="New chat"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

        {/* Main row: sidebars + content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* 1. Left Sidebar (Navigation) — desktop only */}
          <nav
            ref={navRef}
            style={{ width: `${width}px` }}
            className={`relative hidden md:flex flex-col py-6 shrink-0 z-20 ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}`}
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
            {navContent(false)}
          </nav>

          {/* 2. Main Content Area (Rounded White Card) */}
          <main className="flex-1 h-full md:pt-4 relative z-10 min-w-0">
            <div className="bg-white h-full w-full md:rounded-t-3xl shadow-sm overflow-hidden border border-white relative flex flex-col">
              {children}
            </div>
          </main>

          {/* 3. Right Sidebar (Playlist) — desktop only */}
          <aside className="hidden md:block shrink-0 z-10 h-full overflow-hidden">
            {rightPanel}
          </aside>

        </div>

        {/* Mobile Nav Drawer Overlay */}
        {mobileNavOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 z-40 md:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
            {/* Drawer */}
            <nav className="fixed inset-y-0 left-0 w-72 z-50 md:hidden bg-gemini-bg flex flex-col py-6 shadow-2xl">
              {/* Close button */}
              <div className="mb-4 px-4">
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="nav-btn"
                  aria-label="Close menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {navContent(true)}
            </nav>
          </>
        )}

        {/* Mobile Playlist Bottom Sheet */}
        {mobilePlaylistOpen && rightPanel && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setMobilePlaylistOpen(false)}
            />
            {/* Sheet */}
            <div className="fixed inset-x-0 bottom-0 z-50 md:hidden rounded-t-3xl overflow-hidden bg-gemini-bg animate-slide-up" style={{ maxHeight: '70vh' }}>
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              {/* Playlist content — fill remaining height, isMobileSheet=true */}
              <PlaylistSheetContext.Provider value={{ openPlaylist: () => {}, hasPlaylist: true, isMobileSheet: true }}>
                <div className="h-[calc(70vh-24px)] overflow-hidden">
                  {rightPanel}
                </div>
              </PlaylistSheetContext.Provider>
            </div>
          </>
        )}

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          isOpen={deleteDialogOpen}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
          conversationTitle={conversationToDelete?.title}
        />

        {/* Settings Modal */}
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          isAppleMusicAuthorized={isAppleMusicAuthorized}
          onConnectAppleMusic={onConnectAppleMusic}
          onDisconnectAppleMusic={onDisconnectAppleMusic}
        />

      </div>
    </PlaylistSheetContext.Provider>
  );
};
