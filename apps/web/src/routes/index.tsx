/**
 * Route components - Separated page-level components for each route
 * @module routes
 */

import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { ChatInterface } from '../components/ChatInterface';
import { DiscoveryPage } from '../components/DiscoveryPage';
import { PlaylistSidebar } from '../components/PlaylistSidebar';
import { PlaylistView } from '../components/PlaylistView';
import { useSidebarState } from '../hooks/useSidebarState';
import { API_BASE } from '../config/api';
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
  queue: UsePlayQueueReturn;
  playTrackById?: (trackId: string) => Promise<void>;
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
  isAppleMusicAuthorized,
  fetchConversations,
  onLogout,
  onLinkApple,
  onDisconnectApple,
}: RouteComponentProps) {
  const navigate = useNavigate();

  // Sidebar "New Chat": delegates to TopicsGrid's create handler — same
  // flow as clicking the "+ new topic" card.
  const handleNewChat = async () => {
    const userId = session?.user.id;
    if (!userId) {
      navigate('/');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error(`session/create ${res.status}`);
      const { session_id } = (await res.json()) as { session_id: string };
      fetchConversations();
      navigate(`/chat/${session_id}`, { replace: true });
    } catch (e) {
      console.error('[HomeRoute] new chat failed:', e);
    }
  };

  const handleCreatePlaylist = async (title: string) => {
    const userId = session?.user.id;
    const trimmed = title.trim();
    if (!userId || !trimmed) return;
    try {
      const res = await fetch(`${API_BASE}/playlists/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, title: trimmed }),
      });
      if (!res.ok) throw new Error(`playlists/create ${res.status}`);
      const { id } = (await res.json()) as { id: string };
      fetchConversations();
      navigate(`/chat/${id}`, { replace: true });
    } catch (e) {
      console.error('[Route] create playlist failed:', e);
    }
  };

  return (
    <AppLayout
      onNewChat={handleNewChat}
      onCreatePlaylist={handleCreatePlaylist}
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
      userId={session?.user.id || null}
      onLogout={onLogout}
      isAppleMusicAuthorized={isAppleMusicAuthorized}
      onConnectAppleMusic={onLinkApple}
      onDisconnectAppleMusic={onDisconnectApple}
    >
      <DiscoveryPage
        conversations={conversations}
        userId={session?.user.id || null}
        onSessionCreated={() => fetchConversations()}
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
  queue,
  playTrackById,
}: RouteComponentProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Sidebar state with persistence
  const { collapsed, width, toggleCollapse, setWidth, setCollapsed } = useSidebarState();

  const sessionId = id === 'pending' ? null : (id ?? null);

  // Active conversation — used to dispatch playlist routes (type==='playlist')
  // to the PlaylistView instead of the chat-shaped ChatInterface.
  const activeConversation = sessionId
    ? conversations.find((c) => c.id === sessionId)
    : undefined;
  const isPlaylistRoute = activeConversation?.type === 'playlist';

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

  const handleCreatePlaylist = async (title: string) => {
    const userId = session?.user.id;
    const trimmed = title.trim();
    if (!userId || !trimmed) return;
    try {
      const res = await fetch(`${API_BASE}/playlists/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, title: trimmed }),
      });
      if (!res.ok) throw new Error(`playlists/create ${res.status}`);
      const { id: pid } = (await res.json()) as { id: string };
      fetchConversations();
      navigate(`/chat/${pid}`, { replace: true });
    } catch (e) {
      console.error('[ChatRoute] create playlist failed:', e);
    }
  };

  return (
    <AppLayout
      onNewChat={() => navigate('/')}
      onCreatePlaylist={handleCreatePlaylist}
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
      userId={session?.user.id || null}
      onLogout={onLogout}
      isAppleMusicAuthorized={isAppleMusicAuthorized}
      onConnectAppleMusic={onLinkApple}
      onDisconnectAppleMusic={onDisconnectApple}
      onOpenPlaylist={() => setCollapsed(false)}
      rightPanel={
        <PlaylistSidebar
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          queue={queue.queue}
          history={queue.history}
          onPlayTrack={(index) => queue.playAtIndex(index)}
          onPlayFromHistory={(index) => queue.playFromHistory(index)}
          sessionId={sessionId}
          userId={session?.user.id || null}
          onPlayTopicTrack={(track) => queue.playTracks([track])}
          onAddTopicTrack={(track) => queue.addTracks([track])}
          onPlayTopicTracks={(tracks) => queue.playTracks(tracks)}
          onAddTopicTracks={(tracks) => queue.addTracks(tracks)}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
          width={width}
          onWidthChange={setWidth}
        />
      }
    >
      {isPlaylistRoute && activeConversation ? (
        <PlaylistView
          conversation={activeConversation}
          userId={session?.user.id || null}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onPlayTracks={(tracks) => queue.playTracks(tracks)}
          onAddTracks={(tracks) => queue.addTracks(tracks)}
          onSessionCreated={fetchConversations}
        />
      ) : (
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
          queue={queue.queue}
          history={queue.history}
          jumpToIndex={(i) => queue.jumpToIndex(i)}
          playTrackById={playTrackById}
          conversations={conversations}
          onConversationsRefetch={fetchConversations}
        />
      )}
    </AppLayout>
  );
}
