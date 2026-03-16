/**
 * Route components - Separated page-level components for each route
 * @module routes
 */

import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { ChatInterface } from '../components/ChatInterface';
import { PlaylistSidebar } from '../components/PlaylistSidebar';
import { useSidebarState } from '../hooks/useSidebarState';
import type {
  Track,
  PlaybackTime,
  Message,
  AgentAction,
  FormattedTrack,
  Conversation
} from '../types';
import type { AuthSession } from '../hooks/useAuth';

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
  appleTrack: Track | null;
  isApplePlaying: boolean;
  isAppleMusicAuthorized: boolean;
  toggleApple: () => void;
  playbackTime: PlaybackTime;
  seekTo: (time: number) => void;
  appleQueue?: Track[];
  playAppleTrack?: (index: number) => Promise<void>;
  executeAgentActions: (actions: AgentAction[]) => Promise<void>;
  fetchConversations: () => Promise<void>;
  onLogout: () => void;
  onLinkApple?: () => Promise<void>;
  onDisconnectApple?: () => Promise<void>;
  viewedPlaylist?: FormattedTrack[];
  isViewingPlayingConversation?: boolean;
  onStartPlaybackFromConversation?: (index: number) => void;
  playingSessionId?: string | null;
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
  appleTrack,
  isApplePlaying,
  isAppleMusicAuthorized,
  toggleApple,
  playbackTime,
  seekTo,
  executeAgentActions,
  fetchConversations,
  onLogout,
  onLinkApple,
  onDisconnectApple,
}: RouteComponentProps) {
  const navigate = useNavigate();

  const handleSessionCreated = (
    newSessionId: string,
    preservedMessages: Message[],
    initialMessage: string
  ): void => {
    navigate(`/chat/${newSessionId}`, {
      replace: true,
      state: {
        isNewlyCreated: true,
        preservedMessages,
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
        currentTrack={appleTrack}
        isPlaying={isApplePlaying}
        isAppleMusicAuthorized={isAppleMusicAuthorized}
        togglePlay={toggleApple}
        playbackTime={playbackTime}
        onSeek={seekTo}
        sessionId={null}
        userId={session?.user.id || null}
        onAgentActions={executeAgentActions}
        onMessageSent={fetchConversations}
        onSessionCreated={handleSessionCreated}
        onLinkApple={onLinkApple}
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
  appleTrack,
  isApplePlaying,
  isAppleMusicAuthorized,
  toggleApple,
  playbackTime,
  seekTo,
  appleQueue = [],
  playAppleTrack,
  executeAgentActions,
  fetchConversations,
  onLogout,
  onLinkApple,
  onDisconnectApple,
  viewedPlaylist = [],
  isViewingPlayingConversation = true,
  onStartPlaybackFromConversation,
  playingSessionId,
}: RouteComponentProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Sidebar state with persistence
  const { collapsed, width, toggleCollapse, setWidth } = useSidebarState();

  const sessionId = id === 'pending' ? null : (id ?? null);

  const handleSessionCreated = (
    newSessionId: string,
    preservedMessages: Message[],
    initialMessage: string
  ): void => {
    navigate(`/chat/${newSessionId}`, {
      replace: true,
      state: {
        isNewlyCreated: true,
        preservedMessages,
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
          currentTrack={appleTrack}
          isPlaying={isApplePlaying}
          queue={appleQueue}
          onPlayTrack={playAppleTrack}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
          width={width}
          onWidthChange={setWidth}
          viewedPlaylist={viewedPlaylist}
          isViewingPlayingConversation={isViewingPlayingConversation}
          onStartPlaybackFromConversation={onStartPlaybackFromConversation}
        />
      }
    >
      <ChatInterface
        isDJSpeaking={isDJSpeaking}
        currentTrack={appleTrack}
        isPlaying={isApplePlaying}
        isAppleMusicAuthorized={isAppleMusicAuthorized}
        togglePlay={toggleApple}
        playbackTime={playbackTime}
        onSeek={seekTo}
        sessionId={sessionId}
        userId={session?.user.id || null}
        onAgentActions={executeAgentActions}
        onMessageSent={fetchConversations}
        onSessionCreated={handleSessionCreated}
        onLinkApple={onLinkApple}
        playingSessionId={playingSessionId}
        playingConversationTitle={
          playingSessionId
            ? conversations.find(c => c.id === playingSessionId)?.title || 'Untitled'
            : null
        }
        onNavigateToPlayingConversation={
          playingSessionId
            ? () => navigate(`/chat/${playingSessionId}`)
            : undefined
        }
      />
    </AppLayout>
  );
}
