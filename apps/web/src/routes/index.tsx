/**
 * Route components - Separated page-level components for each route
 * @module routes
 */

import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { ChatInterface } from '../components/ChatInterface';
import { PlaylistSidebar } from '../components/PlaylistSidebar';
import { useSidebarState } from '../hooks/useSidebarState';
import type { PlaybackTime } from '../types';
import type { UnifiedTrack } from '../providers/types';
import type { AuthSession } from '../hooks/useAuth';
import type { MusicActions, QueueOperations } from '../hooks/useAgentChatAdapter';
import type { UsePlayQueueReturn } from '../hooks/usePlayQueue';
import type { Conversation } from '../types';

interface RouteComponentProps {
  session: AuthSession | null;
  conversations: Conversation[];
  onDeleteConversation: (id: string) => void;
  onPinConversation: (id: string, pinned: boolean) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onLoadMoreConversations?: () => void;
  hasMoreConversations?: boolean;
  isLoadingMoreConversations?: boolean;
  isDJSpeaking: boolean;
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  isTransitioning: boolean;
  isAppleMusicAuthorized: boolean;
  togglePlay: () => void;
  playbackTime: PlaybackTime;
  seekTo: (time: number) => void;
  playAppleTrack?: (index: number) => Promise<void>;
  musicActions: MusicActions;
  fetchConversations: () => Promise<void>;
  onLogout: () => void;
  onLinkApple?: () => Promise<void>;
  onDisconnectApple?: () => Promise<void>;
  skipNext?: () => Promise<void>;
  skipPrev?: () => Promise<void>;
  queue: UsePlayQueueReturn;
}

/**
 * Home Route (/) - New chat page without sidebar
 */
export function HomeRoute({
  session,
  conversations,
  onDeleteConversation,
  onPinConversation,
  onRenameConversation,
  onLoadMoreConversations,
  hasMoreConversations,
  isLoadingMoreConversations,
  isDJSpeaking,
  currentTrack,
  isPlaying,
  isTransitioning,
  isAppleMusicAuthorized,
  togglePlay,
  playbackTime,
  seekTo,
  musicActions,
  fetchConversations,
  onLogout,
  onLinkApple,
  onDisconnectApple,
  skipNext,
  skipPrev,
  queue,
}: RouteComponentProps) {
  const navigate = useNavigate();

  const handleSessionCreated = (
    newSessionId: string,
    initialMessage: string
  ): void => {
    navigate(`/chat/${newSessionId}`, {
      replace: true,
      state: {
        isNewlyCreated: true,
        initialMessage
      }
    });
    fetchConversations();
  };

  return (
    <AppLayout
      onNewChat={() => navigate('/')}
      onSelectConversation={(id) => navigate(`/chat/${id}`)}
      onDeleteConversation={onDeleteConversation}
      onPinConversation={onPinConversation}
      onRenameConversation={onRenameConversation}
      conversations={conversations}
      activeConversationId={null}
      rightPanel={null}
      onLoadMoreConversations={onLoadMoreConversations}
      hasMoreConversations={hasMoreConversations}
      isLoadingMoreConversations={isLoadingMoreConversations}
      userEmail={session?.user.email || ''}
      userName={session?.user.email?.split('@')[0] || 'User'}
      onLogout={onLogout}
      isAppleMusicAuthorized={isAppleMusicAuthorized}
      onConnectAppleMusic={onLinkApple}
      onDisconnectAppleMusic={onDisconnectApple}
    >
      <ChatInterface
        isDJSpeaking={isDJSpeaking}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isTransitioning={isTransitioning}
        isAppleMusicAuthorized={isAppleMusicAuthorized}
        togglePlay={togglePlay}
        playbackTime={playbackTime}
        onSeek={seekTo}
        sessionId={null}
        userId={session?.user.id || null}
        musicActions={musicActions}
        queueOps={queue}
        onMessageSent={fetchConversations}
        onSessionCreated={handleSessionCreated}
        onLinkApple={onLinkApple}
        onSkipNext={skipNext}
        onSkipPrev={skipPrev}
      />
    </AppLayout>
  );
}

/**
 * Chat Route (/chat/:id) - Chat page with sidebar
 */
export function ChatRoute({
  session,
  conversations,
  onDeleteConversation,
  onPinConversation,
  onRenameConversation,
  onLoadMoreConversations,
  hasMoreConversations,
  isLoadingMoreConversations,
  isDJSpeaking,
  currentTrack,
  isPlaying,
  isTransitioning,
  isAppleMusicAuthorized,
  togglePlay,
  playbackTime,
  seekTo,
  playAppleTrack,
  musicActions,
  fetchConversations,
  onLogout,
  onLinkApple,
  onDisconnectApple,
  skipNext,
  skipPrev,
  queue,
}: RouteComponentProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Sidebar state with persistence
  const { collapsed, width, toggleCollapse, setWidth } = useSidebarState();

  const sessionId = id === 'pending' ? null : (id ?? null);

  const handleSessionCreated = (
    newSessionId: string,
    initialMessage: string
  ): void => {
    navigate(`/chat/${newSessionId}`, {
      replace: true,
      state: {
        isNewlyCreated: true,
        initialMessage
      }
    });
    fetchConversations();
  };

  return (
    <AppLayout
      onNewChat={() => navigate('/')}
      onSelectConversation={(convId) => navigate(`/chat/${convId}`)}
      onDeleteConversation={onDeleteConversation}
      onPinConversation={onPinConversation}
      onRenameConversation={onRenameConversation}
      conversations={conversations}
      activeConversationId={id}
      onLoadMoreConversations={onLoadMoreConversations}
      hasMoreConversations={hasMoreConversations}
      isLoadingMoreConversations={isLoadingMoreConversations}
      userEmail={session?.user.email || ''}
      userName={session?.user.email?.split('@')[0] || 'User'}
      onLogout={onLogout}
      isAppleMusicAuthorized={isAppleMusicAuthorized}
      onConnectAppleMusic={onLinkApple}
      onDisconnectAppleMusic={onDisconnectApple}
      rightPanel={
        <PlaylistSidebar
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          queue={queue.queue}
          currentIndex={queue.currentIndex}
          onPlayTrack={(index) => queue.playAtIndex(index)}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
          width={width}
          onWidthChange={setWidth}
        />
      }
    >
      <ChatInterface
        isDJSpeaking={isDJSpeaking}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isTransitioning={isTransitioning}
        isAppleMusicAuthorized={isAppleMusicAuthorized}
        togglePlay={togglePlay}
        playbackTime={playbackTime}
        onSeek={seekTo}
        sessionId={sessionId}
        userId={session?.user.id || null}
        musicActions={musicActions}
        queueOps={queue}
        onMessageSent={fetchConversations}
        onSessionCreated={handleSessionCreated}
        onLinkApple={onLinkApple}
        onSkipNext={skipNext}
        onSkipPrev={skipPrev}
      />
    </AppLayout>
  );
}
